package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"

	"github.com/creack/pty"
)

// TerminalStartOpts configures a new terminal session.
type TerminalStartOpts struct {
	Cwd  string   `json:"cwd"`
	Cols int      `json:"cols"`
	Rows int      `json:"rows"`
	Cmd  string   `json:"cmd"`
	Args []string `json:"args"`
}

// TerminalStartResult is returned after spawning a session.
type TerminalStartResult struct {
	ID  string `json:"id"`
	Cwd string `json:"cwd"`
}

type terminalSession struct {
	id   string
	cmd  *exec.Cmd
	ptmx *os.File
	cwd  string
}

// terminalManager owns multi-session PTYs for the app.
type terminalManager struct {
	mu       sync.Mutex
	sessions map[string]*terminalSession
	nextID   atomic.Uint64
	emit     func(name string, data interface{})
}

func newTerminalManager(emit func(name string, data interface{})) *terminalManager {
	return &terminalManager{
		sessions: make(map[string]*terminalSession),
		emit:     emit,
	}
}

// pendingUTF8 holds trailing incomplete UTF-8 bytes across PTY reads so we
// never emit a truncated multi-byte glyph (e.g. ▀ used by OpenCode logos).
func splitCompleteUTF8(data []byte) (complete, pending []byte) {
	if len(data) == 0 {
		return data, nil
	}
	// Walk back from the end while in a truncated sequence.
	i := len(data)
	for i > 0 {
		r, size := utf8.DecodeLastRune(data[:i])
		if r != utf8.RuneError || size != 1 {
			break
		}
		// Lone invalid byte — may be start of incomplete sequence.
		b := data[i-1]
		if b&0x80 == 0 {
			break
		}
		i--
		// Don't rewind more than 3 bytes (max UTF-8 length - 1)
		if len(data)-i >= 3 {
			// Treat as complete garbage; emit as-is
			return data, nil
		}
	}
	// Verify the cut point: if trailing bytes form an incomplete lead sequence, hold them.
	if i < len(data) {
		lead := data[i]
		need := 0
		switch {
		case lead&0xE0 == 0xC0:
			need = 2
		case lead&0xF0 == 0xE0:
			need = 3
		case lead&0xF8 == 0xF0:
			need = 4
		default:
			return data, nil
		}
		if len(data)-i < need {
			return data[:i], data[i:]
		}
	}
	return data, nil
}

func defaultShell() string {
	if runtime.GOOS == "windows" {
		if comspec := os.Getenv("COMSPEC"); comspec != "" {
			return comspec
		}
		return "powershell.exe"
	}
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	return "/bin/zsh"
}

func defaultCwd(cwd string, fallback string) string {
	if cwd != "" {
		if info, err := os.Stat(cwd); err == nil && info.IsDir() {
			return cwd
		}
	}
	if fallback != "" {
		if info, err := os.Stat(fallback); err == nil && info.IsDir() {
			return fallback
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return home
}

func cleanedEnv() []string {
	env := commandEnv()
	out := make([]string, 0, len(env)+4)
	for _, e := range env {
		switch {
		case strings.HasPrefix(e, "ELECTRON_RUN_AS_NODE="),
			strings.HasPrefix(e, "ELECTRON_NO_ASAR="),
			strings.HasPrefix(e, "VSCODE_INJECTION="),
			strings.HasPrefix(e, "VSCODE_NONCE="),
			strings.HasPrefix(e, "TERM="),
			strings.HasPrefix(e, "COLORTERM="):
			continue
		}
		out = append(out, e)
	}
	out = append(out, "TERM=xterm-256color", "COLORTERM=truecolor")
	return out
}

func (m *terminalManager) start(opts TerminalStartOpts, projectPath string) (*TerminalStartResult, error) {
	cols := opts.Cols
	rows := opts.Rows
	if cols < 2 {
		cols = 80
	}
	if rows < 1 {
		rows = 24
	}

	cwd := defaultCwd(opts.Cwd, projectPath)
	shell := defaultShell()
	cmdName := shell
	args := []string{}
	if opts.Cmd != "" {
		cmdName = opts.Cmd
		if opts.Args != nil {
			args = opts.Args
		}
	} else if runtime.GOOS == "darwin" {
		// Login shell loads .zprofile/.zshrc where Homebrew and mise set PATH.
		args = []string{"-l"}
	}

	cmd := exec.Command(cmdName, args...)
	cmd.Dir = cwd
	cmd.Env = cleanedEnv()

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("pty start: %w", err)
	}

	id := fmt.Sprintf("term-%d", m.nextID.Add(1))
	sess := &terminalSession{
		id:   id,
		cmd:  cmd,
		ptmx: ptmx,
		cwd:  cwd,
	}

	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()

	go m.readLoop(sess)
	go m.waitLoop(sess)

	return &TerminalStartResult{ID: id, Cwd: cwd}, nil
}

func (m *terminalManager) readLoop(sess *terminalSession) {
	buf := make([]byte, 32*1024)
	var pending []byte
	for {
		n, err := sess.ptmx.Read(buf)
		if n > 0 {
			chunk := append(pending, buf[:n]...)
			complete, rest := splitCompleteUTF8(chunk)
			pending = rest
			if len(complete) > 0 && m.emit != nil {
				// Base64 keeps binary/UTF-8 intact through Wails JSON events
				m.emit("terminal:data", map[string]string{
					"id":   sess.id,
					"data": base64.StdEncoding.EncodeToString(complete),
					"enc":  "b64",
				})
			}
		}
		if err != nil {
			if len(pending) > 0 && m.emit != nil {
				m.emit("terminal:data", map[string]string{
					"id":   sess.id,
					"data": base64.StdEncoding.EncodeToString(pending),
					"enc":  "b64",
				})
				pending = nil
			}
			return
		}
	}
}

func (m *terminalManager) waitLoop(sess *terminalSession) {
	err := sess.cmd.Wait()
	code := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			code = exitErr.ExitCode()
		} else {
			code = 1
		}
	}

	m.mu.Lock()
	_, existed := m.sessions[sess.id]
	if existed {
		delete(m.sessions, sess.id)
	}
	m.mu.Unlock()

	if sess.ptmx != nil {
		_ = sess.ptmx.Close()
	}

	if existed && m.emit != nil {
		m.emit("terminal:exit", map[string]interface{}{
			"id":   sess.id,
			"code": code,
		})
	}
}

func (m *terminalManager) write(id string, data string) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("terminal session %s not found", id)
	}
	_, err := sess.ptmx.Write([]byte(data))
	return err
}

func (m *terminalManager) resize(id string, cols, rows int) error {
	if cols < 2 {
		cols = 2
	}
	if rows < 1 {
		rows = 1
	}
	m.mu.Lock()
	sess, ok := m.sessions[id]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("terminal session %s not found", id)
	}
	return pty.Setsize(sess.ptmx, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
}

func (m *terminalManager) stop(id string) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if !ok {
		return nil
	}
	if sess.cmd != nil && sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
	}
	if sess.ptmx != nil {
		_ = sess.ptmx.Close()
	}
	return nil
}

func (m *terminalManager) stopAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.stop(id)
	}
}
