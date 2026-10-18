package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestMain doubles as a fake language server when CONFLICTO_FAKE_LSP is set.
func TestMain(m *testing.M) {
	if mode := os.Getenv("CONFLICTO_FAKE_LSP"); mode != "" {
		runFakeLSP(mode)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func readFrame(r *bufio.Reader) (string, error) {
	n := -1
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		if k, v, ok := strings.Cut(line, ":"); ok && strings.EqualFold(k, "Content-Length") {
			n, _ = strconv.Atoi(strings.TrimSpace(v))
		}
	}
	buf := make([]byte, n)
	_, err := io.ReadFull(r, buf)
	return string(buf), err
}

func runFakeLSP(mode string) {
	out := os.Stdout
	switch mode {
	case "crash":
		fmt.Fprintln(os.Stderr, "boom: fake crash")
		os.Exit(3)
	case "hang":
		// Ignore everything, including shutdown/exit.
		_, _ = io.Copy(io.Discard, os.Stdin)
		select {}
	}
	r := bufio.NewReader(os.Stdin)
	wd, _ := os.Getwd()
	for {
		msg, err := readFrame(r)
		if err != nil {
			return
		}
		var req map[string]interface{}
		_ = json.Unmarshal([]byte(msg), &req)
		switch req["method"] {
		case "exit":
			return
		case "shutdown":
			fmt.Fprint(out, string(encodeLSPFrame(`{"jsonrpc":"2.0","id":"`+lspShutdownReqID+`","result":null}`)))
		default:
			reply, _ := json.Marshal(map[string]interface{}{"echo": req, "cwd": wd})
			fmt.Fprint(out, string(encodeLSPFrame(string(reply))))
		}
	}
}

func TestLSPFramingRoundTrip(t *testing.T) {
	var got []string
	d := &lspDecoder{onMessage: func(s string) { got = append(got, s) }}
	a, b, c := `{"a":1}`, `{"b":"héllo wörld"}`, `{"c":[1,2,3]}`
	stream := append(append(encodeLSPFrame(a), encodeLSPFrame(b)...), encodeLSPFrame(c)...)

	// multiple messages in one chunk
	_, _ = d.Write(stream)
	if len(got) != 3 || got[0] != a || got[1] != b || got[2] != c {
		t.Fatalf("bulk decode: %v", got)
	}

	// byte-by-byte split chunks
	got = nil
	for i := range stream {
		_, _ = d.Write(stream[i : i+1])
	}
	if len(got) != 3 || got[1] != b {
		t.Fatalf("split decode: %v", got)
	}

	// large message across uneven chunks
	got = nil
	big := `{"x":"` + strings.Repeat("y", 3<<20) + `"}`
	frame := encodeLSPFrame(big)
	for off := 0; off < len(frame); off += 65537 {
		end := min(off+65537, len(frame))
		_, _ = d.Write(frame[off:end])
	}
	if len(got) != 1 || got[0] != big {
		t.Fatalf("large decode: %d messages", len(got))
	}
}

func TestLSPDecoderExtraHeadersAndGarbage(t *testing.T) {
	var got []string
	d := &lspDecoder{onMessage: func(s string) { got = append(got, s) }}
	_, _ = d.Write([]byte("Bogus: x\r\n\r\n"))
	_, _ = d.Write([]byte("content-length: 2\r\nContent-Type: application/vscode-jsonrpc\r\n\r\n{}"))
	if len(got) != 1 || got[0] != "{}" {
		t.Fatalf("got %v", got)
	}
}

func TestRingBuffer(t *testing.T) {
	r := &ringBuffer{n: 5}
	_, _ = r.Write([]byte("abc"))
	_, _ = r.Write([]byte("defgh"))
	if r.String() != "defgh" {
		t.Fatalf("got %q", r.String())
	}
}

func TestResolveLSPBinary(t *testing.T) {
	root := t.TempDir()
	bin := filepath.Join(root, "node_modules", ".bin")
	_ = os.MkdirAll(bin, 0o755)
	tsls := filepath.Join(bin, "typescript-language-server")
	_ = os.WriteFile(tsls, []byte("#!/bin/sh\n"), 0o755)
	if got := resolveLSPBinary("typescript-language-server", root); got != tsls {
		t.Fatalf("node_modules/.bin: got %q", got)
	}

	extra := t.TempDir()
	tool := filepath.Join(extra, "zz-fake-lsp-tool")
	_ = os.WriteFile(tool, []byte("#!/bin/sh\n"), 0o755)
	old := lspExtraDirs
	lspExtraDirs = func() []string { return []string{extra} }
	defer func() { lspExtraDirs = old }()
	if got := resolveLSPBinary("zz-fake-lsp-tool", root); got != tool {
		t.Fatalf("extra dir: got %q", got)
	}
	if got := resolveLSPBinary(tool, root); got != tool {
		t.Fatalf("absolute: got %q", got)
	}
	if got := resolveLSPBinary(filepath.Join(extra, "nope"), root); got != "" {
		t.Fatalf("missing absolute: got %q", got)
	}
}

func TestLSPOverrideAndRegistry(t *testing.T) {
	root := t.TempDir()
	fake := filepath.Join(root, "my-gopls")
	_ = os.WriteFile(fake, []byte("#!/bin/sh\n"), 0o755)
	m := newLSPManager(func(string, interface{}) {}, func() map[string]LSPServerOverride {
		return map[string]LSPServerOverride{"gopls": {Command: fake, Args: []string{"-x"}}}
	})
	m.resolve = func(name, root string) string {
		if name == "pylsp" {
			return "/fake/pylsp"
		}
		return resolveLSPBinary(name, root)
	}
	infos := m.list(root)
	byID := map[string]LSPServerInfo{}
	for _, i := range infos {
		byID[i.ID] = i
	}
	if len(infos) != 4 {
		t.Fatalf("want 4 servers, got %d", len(infos))
	}
	if g := byID["gopls"]; g.Command != fake || !g.Available || g.Status != "stopped" {
		t.Fatalf("gopls override: %+v", g)
	}
	// pyright missing -> falls back to pylsp
	if p := byID["python"]; p.Command != "/fake/pylsp" || !p.Available {
		t.Fatalf("python fallback: %+v", p)
	}
	if byID["gopls"].RootURI != "file://"+root {
		t.Fatalf("rootUri: %q", byID["gopls"].RootURI)
	}
	if _, err := m.start("nope", root); err == nil {
		t.Fatal("unknown id should error")
	}
}

type lspEvents struct {
	mu       sync.Mutex
	messages []map[string]string
	statuses []LSPServerInfo
}

func (e *lspEvents) emit(name string, data interface{}) {
	e.mu.Lock()
	defer e.mu.Unlock()
	switch name {
	case "lsp:message":
		e.messages = append(e.messages, data.(map[string]string))
	case "lsp:status":
		e.statuses = append(e.statuses, data.(LSPServerInfo))
	}
}

func (e *lspEvents) waitFor(t *testing.T, cond func(*lspEvents) bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		e.mu.Lock()
		ok := cond(e)
		e.mu.Unlock()
		if ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func (e *lspEvents) lastStatus() string {
	if len(e.statuses) == 0 {
		return ""
	}
	return e.statuses[len(e.statuses)-1].Status
}

func fakeManager(t *testing.T, mode string) (*lspManager, *lspEvents, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake server uses unix paths")
	}
	t.Setenv("CONFLICTO_FAKE_LSP", mode)
	ev := &lspEvents{}
	m := newLSPManager(ev.emit, func() map[string]LSPServerOverride {
		return map[string]LSPServerOverride{"gopls": {Command: os.Args[0]}}
	})
	root, _ := filepath.EvalSymlinks(t.TempDir())
	return m, ev, root
}

func TestLSPLifecycleSendReceiveStop(t *testing.T) {
	m, ev, root := fakeManager(t, "echo")
	info, err := m.start("gopls", root)
	if err != nil || info.Status != "running" {
		t.Fatalf("start: %+v %v", info, err)
	}
	// idempotent
	if again, err := m.start("gopls", root); err != nil || again.Status != "running" {
		t.Fatalf("second start: %+v %v", again, err)
	}
	if err := m.send("gopls", `{"jsonrpc":"2.0","id":1,"method":"ping"}`); err != nil {
		t.Fatal(err)
	}
	ev.waitFor(t, func(e *lspEvents) bool { return len(e.messages) == 1 })
	msg := ev.messages[0]
	if msg["serverId"] != "gopls" || !strings.Contains(msg["message"], `"ping"`) {
		t.Fatalf("message: %v", msg)
	}
	var reply struct{ Cwd string }
	_ = json.Unmarshal([]byte(msg["message"]), &reply)
	if reply.Cwd != root {
		t.Fatalf("cwd %q want %q", reply.Cwd, root)
	}

	start := time.Now()
	if err := m.stop("gopls"); err != nil {
		t.Fatal(err)
	}
	if time.Since(start) >= lspStopTimeout {
		t.Fatalf("graceful stop took %v", time.Since(start))
	}
	ev.waitFor(t, func(e *lspEvents) bool { return e.lastStatus() == "stopped" })
	if err := m.send("gopls", "{}"); err == nil {
		t.Fatal("send after stop should fail")
	}
}

func TestLSPStopOnProjectSwitch(t *testing.T) {
	m, ev, root := fakeManager(t, "echo")
	if _, err := m.start("gopls", root); err != nil {
		t.Fatal(err)
	}
	m.switchRoot(root) // same root: untouched
	if err := m.send("gopls", "{}"); err != nil {
		t.Fatalf("same root should keep server: %v", err)
	}
	m.switchRoot(t.TempDir())
	m.pending.Wait()
	ev.waitFor(t, func(e *lspEvents) bool { return e.lastStatus() == "stopped" })
	if err := m.send("gopls", "{}"); err == nil {
		t.Fatal("server should be gone after switch")
	}
	m.mu.Lock()
	n := len(m.procs)
	m.mu.Unlock()
	if n != 0 {
		t.Fatalf("procs left: %d", n)
	}
}

func TestLSPCrashReportsStderr(t *testing.T) {
	m, ev, root := fakeManager(t, "crash")
	if _, err := m.start("gopls", root); err != nil {
		t.Fatal(err)
	}
	ev.waitFor(t, func(e *lspEvents) bool { return e.lastStatus() == "error" })
	last := ev.statuses[len(ev.statuses)-1]
	if !strings.Contains(last.Error, "boom: fake crash") {
		t.Fatalf("error: %q", last.Error)
	}
	if got := m.list(root)[0]; got.Status != "error" || got.Error == "" {
		t.Fatalf("list: %+v", got)
	}
	// no auto restart; a manual start spawns again
	t.Setenv("CONFLICTO_FAKE_LSP", "echo")
	info, err := m.start("gopls", root)
	if err != nil || info.Status != "running" {
		t.Fatalf("restart: %+v %v", info, err)
	}
	m.stopAll(true)
}

func TestLSPKillAfterTimeout(t *testing.T) {
	m, _, root := fakeManager(t, "hang")
	if _, err := m.start("gopls", root); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	m.stopAll(true)
	d := time.Since(start)
	if d < lspStopTimeout-100*time.Millisecond || d > lspStopTimeout+2*time.Second {
		t.Fatalf("kill timing %v", d)
	}
}

func TestLSPNotInstalled(t *testing.T) {
	ev := &lspEvents{}
	m := newLSPManager(ev.emit, nil)
	m.resolve = func(string, string) string { return "" }
	info, err := m.start("rust", t.TempDir())
	if err == nil || info.Available {
		t.Fatalf("expected unavailable error, got %+v %v", info, err)
	}
}

func TestSearchGitGrep(t *testing.T) {
	root := newSearchRepo(t)
	ctx := context.Background()
	res, err := searchGitGrep(ctx, root, SearchOpts{Query: "needle", Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	checkSearchResults(t, res)

	res, err = searchGitGrep(ctx, root, SearchOpts{Query: "nee.le", Regex: true, CaseSensitive: true, Limit: 100})
	if err != nil || len(res) == 0 {
		t.Fatalf("regex: %v %v", res, err)
	}
	if res, _ = searchGitGrep(ctx, root, SearchOpts{Query: "NEEDLE", CaseSensitive: true, Limit: 100}); len(res) != 0 {
		t.Fatalf("case sensitive matched: %v", res)
	}
	res, _ = searchGitGrep(ctx, root, SearchOpts{Query: "needle", Glob: "*.md", Limit: 100})
	if len(res) != 1 || res[0].Path != "docs/notes.md" {
		t.Fatalf("glob: %v", res)
	}
	res, _ = searchGitGrep(ctx, root, SearchOpts{Query: "needle", Limit: 1})
	if len(res) != 1 {
		t.Fatalf("limit: %v", res)
	}
	if res, err = searchGitGrep(ctx, root, SearchOpts{Query: "zzzznomatch", Limit: 10}); err != nil || len(res) != 0 {
		t.Fatalf("nomatch: %v %v", res, err)
	}
}

func TestSearchRipgrep(t *testing.T) {
	rg, err := exec.LookPath("rg")
	if err != nil {
		t.Skip("rg not on PATH")
	}
	root := newSearchRepo(t)
	res, err := searchRipgrep(context.Background(), rg, root, SearchOpts{Query: "needle", Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	checkSearchResults(t, res)
	res, _ = searchRipgrep(context.Background(), rg, root, SearchOpts{Query: "needle", WholeWord: true, Glob: "*.md", Limit: 100})
	if len(res) != 1 || res[0].Path != "docs/notes.md" {
		t.Fatalf("glob/word: %v", res)
	}
}

func TestSearchCancelled(t *testing.T) {
	root := newSearchRepo(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := searchText(ctx, root, SearchOpts{Query: "needle"}); err != context.Canceled {
		t.Fatalf("want Canceled, got %v", err)
	}
}

// ignored.txt is .gitignored and must never show up.
func checkSearchResults(t *testing.T, res []SearchMatch) {
	t.Helper()
	want := map[string]SearchMatch{
		"main.go":       {Path: "main.go", Line: 3, Col: 6},
		"docs/notes.md": {Path: "docs/notes.md", Line: 1, Col: 4},
	}
	if len(res) != len(want) {
		t.Fatalf("got %d results: %+v", len(res), res)
	}
	for _, r := range res {
		w, ok := want[r.Path]
		if !ok || r.Line != w.Line || r.Col != w.Col || !strings.Contains(strings.ToLower(r.Text), "needle") {
			t.Fatalf("unexpected result %+v (want %+v)", r, w)
		}
	}
}

func newSearchRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	git := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	write := func(p, s string) {
		full := filepath.Join(root, p)
		_ = os.MkdirAll(filepath.Dir(full), 0o755)
		if err := os.WriteFile(full, []byte(s), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	git("init", "-q")
	write("main.go", "package main\n\n// héNeedle here\n")
	write("docs/notes.md", "## needle\n")
	write(".gitignore", "ignored.txt\n")
	write("ignored.txt", "needle\n")
	git("add", "main.go", "docs", ".gitignore")
	return root
}
