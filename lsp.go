package main

// Language Server Protocol bridge.
//
// The backend is a thin, generic JSON-RPC transport plus process lifecycle.
// The frontend owns all protocol semantics (initialize, capabilities,
// documents, requests); the backend never sends `initialize` itself.
//
// Methods bound to the frontend:
//
//	LSPServers() []LSPServerInfo
//	    Registry plus status for the active worktree. Never starts anything.
//	LSPStart(serverID) (LSPServerInfo, error)
//	    Lazily spawn the server with cwd = active worktree root (the
//	    frontend should use RootURI as the LSP rootUri). Idempotent: returns
//	    the current info if the server is already starting/running. Errors
//	    if the binary is not installed or fails to spawn.
//	LSPSend(serverID, message) error
//	    message is a raw JSON-RPC message with NO Content-Length header; the
//	    backend adds the framing before writing to the server's stdin.
//	LSPStop(serverID) error
//	    shutdown request + exit notification, then kill after 2s.
//
// Events:
//
//	lsp:message {serverId, message}  one per framed message from server stdout
//	                                 (message is the raw JSON-RPC string).
//	lsp:status  LSPServerInfo        on every status change.
//
// Lifecycle: only the active worktree's servers run. Switching project tears
// down every server started for the previous root; app shutdown stops all.
// A crash sets status "error" with the stderr tail in Error. There is no
// automatic restart; the frontend may call LSPStart again.
//
// Binary resolution: settings override (Settings.LSPServers) first, then
// <worktree>/node_modules/.bin, PATH, common install dirs (~/go/bin,
// ~/.cargo/bin, Homebrew prefixes, ~/.local/bin) and, on macOS, the login
// shell PATH.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LSPServerInfo struct {
	ID        string   `json:"id"`
	Languages []string `json:"languages"`
	Command   string   `json:"command"`
	Available bool     `json:"available"`
	Status    string   `json:"status"` // "stopped" | "starting" | "running" | "error"
	Error     string   `json:"error"`
	RootURI   string   `json:"rootUri"`
}

// LSPServerOverride replaces the built-in command for a server ID.
type LSPServerOverride struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
}

type lspCandidate struct {
	command string
	args    []string
}

type lspDef struct {
	id         string
	languages  []string
	candidates []lspCandidate
}

var lspRegistry = []lspDef{
	{"gopls", []string{"go", "gomod"}, []lspCandidate{{"gopls", nil}}},
	{"typescript", []string{"typescript", "typescriptreact", "javascript", "javascriptreact"},
		[]lspCandidate{{"typescript-language-server", []string{"--stdio"}}}},
	{"python", []string{"python"}, []lspCandidate{
		{"pyright-langserver", []string{"--stdio"}},
		{"pylsp", nil},
	}},
	{"rust", []string{"rust"}, []lspCandidate{{"rust-analyzer", nil}}},
}

const (
	lspStopTimeout   = 2 * time.Second
	lspStderrLimit   = 8 << 10
	lspMaxMessage    = 256 << 20
	lspResolveTTL    = 30 * time.Second
	lspShutdownReqID = "conflicto-shutdown"
)

// ---------- framing ----------

func encodeLSPFrame(msg string) []byte {
	return []byte("Content-Length: " + strconv.Itoa(len(msg)) + "\r\n\r\n" + msg)
}

// lspDecoder is an io.Writer that reassembles Content-Length framed messages
// from arbitrary chunks and calls onMessage for each complete one.
type lspDecoder struct {
	buf       []byte
	onMessage func(string)
}

func (d *lspDecoder) Write(p []byte) (int, error) {
	d.buf = append(d.buf, p...)
	for {
		hdrEnd := bytes.Index(d.buf, []byte("\r\n\r\n"))
		if hdrEnd < 0 {
			if len(d.buf) > 64<<10 { // garbage without a header terminator
				d.buf = nil
			}
			break
		}
		length := -1
		for _, line := range strings.Split(string(d.buf[:hdrEnd]), "\r\n") {
			k, v, ok := strings.Cut(line, ":")
			if ok && strings.EqualFold(strings.TrimSpace(k), "Content-Length") {
				if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && n >= 0 {
					length = n
				}
			}
		}
		if length < 0 || length > lspMaxMessage {
			d.buf = d.buf[hdrEnd+4:] // skip malformed header
			continue
		}
		total := hdrEnd + 4 + length
		if len(d.buf) < total {
			break
		}
		msg := string(d.buf[hdrEnd+4 : total])
		d.buf = append([]byte(nil), d.buf[total:]...)
		d.onMessage(msg)
	}
	return len(p), nil
}

// ringBuffer keeps the last n bytes written.
type ringBuffer struct {
	mu  sync.Mutex
	n   int
	buf []byte
}

func (r *ringBuffer) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf = append(r.buf, p...)
	if len(r.buf) > r.n {
		r.buf = append([]byte(nil), r.buf[len(r.buf)-r.n:]...)
	}
	return len(p), nil
}

func (r *ringBuffer) String() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return strings.TrimSpace(string(r.buf))
}

// ---------- binary resolution ----------

var lspExtraDirs = func() []string {
	home, _ := os.UserHomeDir()
	dirs := []string{"/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"}
	if home != "" {
		dirs = append(dirs,
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, ".local", "bin"),
		)
	}
	return dirs
}

func isExecFile(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir() && info.Mode()&0o111 != 0
}

// resolveLSPBinary finds name for the given worktree root, or "".
func resolveLSPBinary(name, root string) string {
	if filepath.IsAbs(name) || strings.ContainsRune(name, filepath.Separator) {
		if isExecFile(name) {
			return name
		}
		return ""
	}
	if root != "" {
		if p := filepath.Join(root, "node_modules", ".bin", name); isExecFile(p) {
			return p
		}
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	for _, d := range lspExtraDirs() {
		if p := filepath.Join(d, name); isExecFile(p) {
			return p
		}
	}
	if runtime.GOOS == "darwin" {
		if p, err := commandPath(name); err == nil {
			return p
		}
	}
	return ""
}

// ---------- manager ----------

type lspProc struct {
	def     lspDef
	root    string
	cmd     *exec.Cmd
	command string
	stdin   io.WriteCloser
	writeMu sync.Mutex
	stderr  *ringBuffer
	done    chan struct{}

	// guarded by manager.mu
	status   string
	err      string
	stopping bool
}

type lspCacheEntry struct {
	path string
	at   time.Time
}

type lspManager struct {
	emit      func(name string, data interface{})
	overrides func() map[string]LSPServerOverride
	resolve   func(name, root string) string

	mu      sync.Mutex
	procs   map[string]*lspProc // by server id (single active root)
	cache   map[string]lspCacheEntry
	pending sync.WaitGroup // background teardowns
}

func newLSPManager(emit func(string, interface{}), overrides func() map[string]LSPServerOverride) *lspManager {
	return &lspManager{
		emit:      emit,
		overrides: overrides,
		resolve:   resolveLSPBinary,
		procs:     map[string]*lspProc{},
		cache:     map[string]lspCacheEntry{},
	}
}

func fileURI(path string) string {
	if path == "" {
		return ""
	}
	p := filepath.ToSlash(path)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return (&url.URL{Scheme: "file", Path: p}).String()
}

func findLSPDef(id string) (lspDef, bool) {
	for _, d := range lspRegistry {
		if d.id == id {
			return d, true
		}
	}
	return lspDef{}, false
}

func (m *lspManager) cachedResolve(name, root string) string {
	key := root + "\x00" + name
	m.mu.Lock()
	e, ok := m.cache[key]
	m.mu.Unlock()
	if ok && time.Since(e.at) < lspResolveTTL {
		return e.path
	}
	p := m.resolve(name, root)
	m.mu.Lock()
	m.cache[key] = lspCacheEntry{p, time.Now()}
	m.mu.Unlock()
	return p
}

// resolveServer returns the command and args to use, or "" when unavailable.
func (m *lspManager) resolveServer(def lspDef, root string) (string, []string) {
	if m.overrides != nil {
		if o, ok := m.overrides()[def.id]; ok && o.Command != "" {
			return m.cachedResolve(o.Command, root), o.Args
		}
	}
	for _, c := range def.candidates {
		if p := m.cachedResolve(c.command, root); p != "" {
			return p, c.args
		}
	}
	return "", nil
}

func (m *lspManager) infoLocked(def lspDef, root string, command string) LSPServerInfo {
	info := LSPServerInfo{
		ID:        def.id,
		Languages: def.languages,
		Command:   command,
		Available: command != "",
		Status:    "stopped",
		RootURI:   fileURI(root),
	}
	if p := m.procs[def.id]; p != nil && p.root == root {
		info.Status = p.status
		info.Error = p.err
		if p.command != "" {
			info.Command = p.command
			info.Available = true
		}
	}
	return info
}

func (m *lspManager) list(root string) []LSPServerInfo {
	out := make([]LSPServerInfo, 0, len(lspRegistry))
	for _, def := range lspRegistry {
		cmd := ""
		if root != "" {
			cmd, _ = m.resolveServer(def, root)
		}
		m.mu.Lock()
		out = append(out, m.infoLocked(def, root, cmd))
		m.mu.Unlock()
	}
	return out
}

func (m *lspManager) start(id, root string) (LSPServerInfo, error) {
	def, ok := findLSPDef(id)
	if !ok {
		return LSPServerInfo{}, fmt.Errorf("unknown language server %q", id)
	}
	if root == "" {
		return LSPServerInfo{}, errors.New("no active worktree")
	}
	command, args := m.resolveServer(def, root)

	m.mu.Lock()
	if p := m.procs[id]; p != nil && p.root == root && (p.status == "starting" || p.status == "running") {
		info := m.infoLocked(def, root, command)
		m.mu.Unlock()
		return info, nil
	}
	if command == "" {
		info := m.infoLocked(def, root, "")
		m.mu.Unlock()
		return info, fmt.Errorf("language server %q is not installed", id)
	}

	p := &lspProc{def: def, root: root, command: command, status: "starting",
		stderr: &ringBuffer{n: lspStderrLimit}, done: make(chan struct{})}
	cmd := exec.Command(command, args...)
	cmd.Dir = root
	cmd.Env = lspEnv(root)
	cmd.Stdout = &lspDecoder{onMessage: func(msg string) {
		m.mu.Lock()
		stopping := p.stopping
		m.mu.Unlock()
		if !stopping {
			m.emit("lsp:message", map[string]string{"serverId": id, "message": msg})
		}
	}}
	cmd.Stderr = p.stderr
	cmd.WaitDelay = time.Second
	stdin, err := cmd.StdinPipe()
	if err == nil {
		p.stdin = stdin
		p.cmd = cmd
		err = cmd.Start()
	}
	if err != nil {
		p.status, p.err = "error", err.Error()
		m.procs[id] = p
		info := m.infoLocked(def, root, command)
		m.mu.Unlock()
		m.emit("lsp:status", info)
		return info, err
	}
	p.status = "running"
	m.procs[id] = p
	info := m.infoLocked(def, root, command)
	m.mu.Unlock()
	m.emit("lsp:status", info)

	go m.watch(p)
	return info, nil
}

// watch waits for process exit and reports crashes.
func (m *lspManager) watch(p *lspProc) {
	werr := p.cmd.Wait()
	m.mu.Lock()
	if p.stopping {
		p.status = "stopped"
	} else {
		p.status = "error"
		msg := p.stderr.String()
		if msg == "" {
			if werr != nil {
				msg = werr.Error()
			} else {
				msg = "server exited unexpectedly"
			}
		}
		p.err = msg
	}
	info := LSPServerInfo{
		ID: p.def.id, Languages: p.def.languages, Command: p.command, Available: true,
		Status: p.status, Error: p.err, RootURI: fileURI(p.root),
	}
	m.mu.Unlock()
	close(p.done)
	m.emit("lsp:status", info)
}

func lspEnv(root string) []string {
	extra := append([]string{filepath.Join(root, "node_modules", ".bin")}, lspExtraDirs()...)
	env := make([]string, 0, len(os.Environ())+1)
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "PATH=") {
			env = append(env, e)
		}
	}
	path := os.Getenv("PATH") + string(os.PathListSeparator) + strings.Join(extra, string(os.PathListSeparator))
	return append(env, "PATH="+path)
}

func (m *lspManager) send(id, message string) error {
	m.mu.Lock()
	p := m.procs[id]
	ok := p != nil && !p.stopping && (p.status == "running" || p.status == "starting")
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("language server %q is not running", id)
	}
	return p.write(message)
}

func (p *lspProc) write(message string) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	_, err := p.stdin.Write(encodeLSPFrame(message))
	return err
}

// terminate performs the graceful shutdown sequence on a proc and blocks
// until it exits (killing after lspStopTimeout).
func (m *lspManager) terminate(p *lspProc) {
	m.mu.Lock()
	alreadyDead := p.status == "error"
	p.stopping = true
	m.mu.Unlock()
	if alreadyDead {
		return
	}
	shutdown, _ := json.Marshal(map[string]interface{}{"jsonrpc": "2.0", "id": lspShutdownReqID, "method": "shutdown"})
	exit, _ := json.Marshal(map[string]interface{}{"jsonrpc": "2.0", "method": "exit"})
	// Writes could block on a wedged server; do them off-thread so the kill
	// timer is still honoured.
	go func() {
		_ = p.write(string(shutdown))
		_ = p.write(string(exit))
		_ = p.stdin.Close()
	}()
	select {
	case <-p.done:
	case <-time.After(lspStopTimeout):
		_ = p.cmd.Process.Kill()
		<-p.done
	}
}

func (m *lspManager) stop(id string) error {
	m.mu.Lock()
	p := m.procs[id]
	m.mu.Unlock()
	if p == nil {
		return nil
	}
	m.terminate(p)
	return nil
}

// stopAll tears down every server. When wait is false teardown runs in the
// background (tracked by m.pending).
func (m *lspManager) stopAll(wait bool) {
	m.mu.Lock()
	procs := make([]*lspProc, 0, len(m.procs))
	for _, p := range m.procs {
		procs = append(procs, p)
	}
	m.procs = map[string]*lspProc{}
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, p := range procs {
		wg.Add(1)
		m.pending.Add(1)
		go func(p *lspProc) {
			defer wg.Done()
			defer m.pending.Done()
			m.terminate(p)
		}(p)
	}
	if wait {
		wg.Wait()
	}
}

// switchRoot tears down servers that belong to a different root.
func (m *lspManager) switchRoot(newRoot string) {
	m.mu.Lock()
	stale := false
	for _, p := range m.procs {
		if p.root != newRoot {
			stale = true
		}
	}
	m.mu.Unlock()
	if stale {
		m.stopAll(false)
	}
}

// ---------- App bindings ----------

func (a *App) lspManager() *lspManager {
	a.lspOnce.Do(func() {
		a.lsp = newLSPManager(a.EmitEvent, func() map[string]LSPServerOverride {
			if a.settings == nil {
				return nil
			}
			return a.settings.LSPServers
		})
	})
	return a.lsp
}

func (a *App) lspRoot() string {
	if a.git != nil && a.git.IsRepo() {
		return a.git.path
	}
	return ""
}

// LSPServers returns the registry with status for the active worktree.
func (a *App) LSPServers() []LSPServerInfo {
	return a.lspManager().list(a.lspRoot())
}

// LSPStart lazily starts a language server for the active worktree.
func (a *App) LSPStart(serverID string) (LSPServerInfo, error) {
	return a.lspManager().start(serverID, a.lspRoot())
}

// LSPSend writes a raw JSON-RPC message (no framing) to the server.
func (a *App) LSPSend(serverID string, message string) error {
	return a.lspManager().send(serverID, message)
}

// LSPStop stops a language server.
func (a *App) LSPStop(serverID string) error {
	return a.lspManager().stop(serverID)
}
