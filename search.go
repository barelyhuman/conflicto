package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"unicode/utf8"
)

type SearchMatch struct {
	Path string `json:"path"` // repo-relative
	Line int    `json:"line"` // 1-based
	Col  int    `json:"col"`  // 1-based, in characters
	Text string `json:"text"`
}

type SearchOpts struct {
	Query         string `json:"query"`
	Regex         bool   `json:"regex"`
	CaseSensitive bool   `json:"caseSensitive"`
	WholeWord     bool   `json:"wholeWord"`
	Glob          string `json:"glob"`
	Limit         int    `json:"limit"`
}

const (
	defaultSearchLimit = 500
	maxSearchText      = 400
)

func trimMatchText(s string) string {
	s = strings.TrimRight(s, "\r\n")
	if len(s) > maxSearchText {
		cut := maxSearchText
		for cut > 0 && !utf8.RuneStart(s[cut]) {
			cut--
		}
		s = s[:cut]
	}
	return s
}

// byteColToChar converts a 0-based byte offset in line to a 1-based char column.
func byteColToChar(line string, off int) int {
	if off > len(line) {
		off = len(line)
	}
	if off < 0 {
		off = 0
	}
	return utf8.RuneCountInString(line[:off]) + 1
}

// SearchText searches the active worktree using ripgrep, falling back to git grep.
// A newer search cancels any search still in flight.
func (a *App) SearchText(opts SearchOpts) ([]SearchMatch, error) {
	root := a.lspRoot()
	if root == "" {
		return nil, fmt.Errorf("no git repository")
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.searchMu.Lock()
	if a.searchCancel != nil {
		a.searchCancel()
	}
	a.searchCancel = cancel
	a.searchMu.Unlock()
	defer cancel()

	return searchText(ctx, root, opts)
}

func searchText(ctx context.Context, root string, opts SearchOpts) ([]SearchMatch, error) {
	if opts.Query == "" {
		return []SearchMatch{}, nil
	}
	if opts.Limit <= 0 {
		opts.Limit = defaultSearchLimit
	}
	var res []SearchMatch
	var err error
	// Empty root: never pick up a repo-local node_modules/.bin/rg from an untrusted repo.
	if rg := resolveLSPBinary("rg", ""); rg != "" {
		res, err = searchRipgrep(ctx, rg, root, opts)
	} else {
		res, err = searchGitGrep(ctx, root, opts)
	}
	if ctx.Err() != nil {
		return nil, context.Canceled
	}
	if res == nil {
		res = []SearchMatch{}
	}
	return res, err
}

func searchRipgrep(ctx context.Context, rg, root string, opts SearchOpts) ([]SearchMatch, error) {
	args := []string{"--json", "--no-config"}
	if !opts.Regex {
		args = append(args, "-F")
	}
	if opts.CaseSensitive {
		args = append(args, "-s")
	} else {
		args = append(args, "-i")
	}
	if opts.WholeWord {
		args = append(args, "-w")
	}
	if opts.Glob != "" {
		args = append(args, "-g", opts.Glob)
	}
	args = append(args, "-e", opts.Query, "--", ".")

	cctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(cctx, rg, args...)
	cmd.Dir = root
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var out []SearchMatch
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 64<<10), 64<<20)
	for sc.Scan() {
		var ev struct {
			Type string `json:"type"`
			Data struct {
				Path struct {
					Text string `json:"text"`
				} `json:"path"`
				Lines struct {
					Text string `json:"text"`
				} `json:"lines"`
				LineNumber int `json:"line_number"`
				Submatches []struct {
					Start int `json:"start"`
				} `json:"submatches"`
			} `json:"data"`
		}
		if json.Unmarshal(sc.Bytes(), &ev) != nil || ev.Type != "match" || ev.Data.Path.Text == "" {
			continue
		}
		start := 0
		if len(ev.Data.Submatches) > 0 {
			start = ev.Data.Submatches[0].Start
		}
		out = append(out, SearchMatch{
			Path: strings.TrimPrefix(ev.Data.Path.Text, "./"),
			Line: ev.Data.LineNumber,
			Col:  byteColToChar(ev.Data.Lines.Text, start),
			Text: trimMatchText(ev.Data.Lines.Text),
		})
		if len(out) >= opts.Limit {
			cancel()
			break
		}
	}
	// Drain so the process can exit, then reap.
	_, _ = bufioDiscard(stdout)
	werr := cmd.Wait()
	if len(out) >= opts.Limit || ctx.Err() != nil {
		return out, nil
	}
	var ee *exec.ExitError
	if errors.As(werr, &ee) && ee.ExitCode() == 1 {
		return out, nil // no matches
	}
	if werr != nil && len(out) == 0 {
		return nil, fmt.Errorf("rg: %s", strings.TrimSpace(stderr.String()))
	}
	return out, nil
}

func bufioDiscard(r interface{ Read([]byte) (int, error) }) (int64, error) {
	buf := make([]byte, 32<<10)
	var n int64
	for {
		c, err := r.Read(buf)
		n += int64(c)
		if err != nil {
			return n, err
		}
	}
}

func searchGitGrep(ctx context.Context, root string, opts SearchOpts) ([]SearchMatch, error) {
	args := []string{"grep", "-n", "--column", "-I", "-z", "--no-color", "--untracked", "--exclude-standard"}
	if opts.Regex {
		args = append(args, "-E")
	} else {
		args = append(args, "-F")
	}
	if !opts.CaseSensitive {
		args = append(args, "-i")
	}
	if opts.WholeWord {
		args = append(args, "-w")
	}
	args = append(args, "-e", opts.Query, "--")
	if opts.Glob != "" {
		g := opts.Glob
		if !strings.Contains(g, "/") {
			g = "**/" + g
		}
		args = append(args, ":(glob)"+g)
	}

	cctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := appCommand("git", args...)
	cmd = exec.CommandContext(cctx, cmd.Path, args...)
	cmd.Dir = root
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var out []SearchMatch
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 64<<10), 64<<20)
	for sc.Scan() {
		// -z separates every field with NUL: path\0line\0col\0text
		parts := strings.SplitN(sc.Text(), "\x00", 4)
		if len(parts) < 4 {
			continue
		}
		path := parts[0]
		ln, err := strconv.Atoi(parts[1])
		if err != nil {
			continue
		}
		col, _ := strconv.Atoi(parts[2])
		text := parts[3]
		out = append(out, SearchMatch{
			Path: path,
			Line: ln,
			Col:  byteColToChar(text, col-1),
			Text: trimMatchText(text),
		})
		if len(out) >= opts.Limit {
			cancel()
			break
		}
	}
	_, _ = bufioDiscard(stdout)
	werr := cmd.Wait()
	if len(out) >= opts.Limit || ctx.Err() != nil {
		return out, nil
	}
	var ee *exec.ExitError
	if errors.As(werr, &ee) && ee.ExitCode() == 1 {
		return out, nil
	}
	if werr != nil && len(out) == 0 {
		return nil, fmt.Errorf("git grep: %s", strings.TrimSpace(stderr.String()))
	}
	return out, nil
}
