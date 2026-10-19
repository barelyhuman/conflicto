package main

import (
	"bytes"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Compare: diff the active worktree against any ref (branch, tag, SHA,
// HEAD~3, ...). The "new" side is always the working tree, so uncommitted and
// untracked changes show up. With mergeBase the "old" side is the merge base of
// HEAD and the ref (what `git diff ref...` would show, plus local changes),
// which hides changes that only landed on the ref.

// GitRef is one entry of the ref picker.
type GitRef struct {
	Name    string `json:"name"`    // short name, e.g. main, origin/main, v1.2.0
	Kind    string `json:"kind"`    // head | branch | remote | tag
	SHA     string `json:"sha"`     // abbreviated commit
	Subject string `json:"subject"` // commit subject
	Date    string `json:"date"`    // committer date, ISO 8601
}

// CompareFile is one changed path between the base and the working tree.
// Status is a git status letter (M, A, D, R, T); untracked files are A.
type CompareFile struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Untracked bool   `json:"untracked,omitempty"`
}

// CompareResult is the resolved base plus the changed files.
type CompareResult struct {
	Ref       string        `json:"ref"`
	MergeBase bool          `json:"mergeBase"`
	BaseSHA   string        `json:"baseSHA"`
	Files     []CompareFile `json:"files"`
}

// ListRefs returns HEAD, local branches, remote branches and tags, most
// recently committed first within the for-each-ref listing.
func (gs *GitService) ListRefs() ([]GitRef, error) {
	out, err := gs.runGit("for-each-ref", "--sort=-committerdate",
		"--format=%(refname)%00%(refname:short)%00%(objectname:short)%00%(committerdate:iso-strict)%00%(subject)",
		"refs/heads", "refs/remotes", "refs/tags")
	if err != nil {
		return nil, err
	}
	refs := []GitRef{}
	if head, herr := gs.runGit("log", "-1", "--format=%h%x00%cI%x00%s", "HEAD"); herr == nil {
		parts := strings.SplitN(strings.TrimRight(string(head), "\n"), "\x00", 3)
		if len(parts) == 3 {
			refs = append(refs, GitRef{Name: "HEAD", Kind: "head", SHA: parts[0], Date: parts[1], Subject: parts[2]})
		}
	}
	return append(refs, parseRefList(string(out))...), nil
}

// parseRefList parses the NUL-separated for-each-ref lines of ListRefs.
// Symbolic remote HEADs (origin/HEAD) are skipped.
func parseRefList(out string) []GitRef {
	var refs []GitRef
	for _, line := range strings.Split(out, "\n") {
		parts := strings.SplitN(line, "\x00", 5)
		if len(parts) != 5 {
			continue
		}
		full := parts[0]
		var kind string
		switch {
		case strings.HasPrefix(full, "refs/heads/"):
			kind = "branch"
		case strings.HasPrefix(full, "refs/remotes/"):
			if strings.HasSuffix(full, "/HEAD") {
				continue
			}
			kind = "remote"
		case strings.HasPrefix(full, "refs/tags/"):
			kind = "tag"
		default:
			continue
		}
		refs = append(refs, GitRef{Name: parts[1], Kind: kind, SHA: parts[2], Date: parts[3], Subject: parts[4]})
	}
	return refs
}

// resolveCompareBase turns a user ref into the commit the diff starts from.
func (gs *GitService) resolveCompareBase(ref string, mergeBase bool) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", fmt.Errorf("no ref given")
	}
	if strings.HasPrefix(ref, "-") {
		return "", fmt.Errorf("invalid ref %q", ref)
	}
	out, err := gs.runGit("rev-parse", "--verify", "--quiet", ref+"^{commit}")
	if err != nil {
		return "", fmt.Errorf("unknown ref %q", ref)
	}
	sha := strings.TrimSpace(string(out))
	if !mergeBase {
		return sha, nil
	}
	mb, err := gs.runGit("merge-base", "HEAD", sha)
	if err != nil {
		return "", fmt.Errorf("no merge base between HEAD and %s", ref)
	}
	return strings.TrimSpace(string(mb)), nil
}

// CompareFiles lists the paths that differ between the base and the working
// tree, including untracked files (collapsed per directory past
// maxUntrackedListed, like the status list).
func (gs *GitService) CompareFiles(ref string, mergeBase bool) (*CompareResult, error) {
	base, err := gs.resolveCompareBase(ref, mergeBase)
	if err != nil {
		return nil, err
	}
	nameStatus, err := gs.runGit("diff", "-z", "-M", "--name-status", base, "--")
	if err != nil {
		return nil, err
	}
	numstat, err := gs.runGit("diff", "-z", "-M", "--numstat", base, "--")
	if err != nil {
		return nil, err
	}
	files := parseNameStatusZ(nameStatus)
	applyNumstatZ(files, numstat)

	untracked, err := gs.runGit("ls-files", "-z", "--others", "--exclude-standard")
	if err == nil && bytes.Count(untracked, []byte{0}) > maxUntrackedListed {
		untracked, err = gs.runGit("ls-files", "-z", "--others", "--exclude-standard", "--directory")
	}
	if err == nil {
		for _, p := range strings.Split(string(untracked), "\x00") {
			if p != "" {
				files = append(files, CompareFile{Path: p, Status: "A", Untracked: true})
			}
		}
	}
	sort.SliceStable(files, func(i, j int) bool { return files[i].Path < files[j].Path })

	return &CompareResult{Ref: strings.TrimSpace(ref), MergeBase: mergeBase, BaseSHA: base, Files: files}, nil
}

// parseNameStatusZ parses `git diff -z --name-status`: STATUS\0path\0, with a
// second path for renames and copies (STATUS\0old\0new\0).
func parseNameStatusZ(out []byte) []CompareFile {
	fields := strings.Split(string(out), "\x00")
	var files []CompareFile
	for i := 0; i < len(fields); i++ {
		code := fields[i]
		if code == "" || i+1 >= len(fields) {
			continue
		}
		letter := code[:1]
		if (letter == "R" || letter == "C") && i+2 < len(fields) {
			files = append(files, CompareFile{OldPath: fields[i+1], Path: fields[i+2], Status: letter})
			i += 2
			continue
		}
		files = append(files, CompareFile{Path: fields[i+1], Status: letter})
		i++
	}
	return files
}

// applyNumstatZ fills additions/deletions from `git diff -z --numstat`:
// "add\tdel\tpath\0", or "add\tdel\t\0old\0new\0" for renames. Binary files
// report "-" and keep zero counts.
func applyNumstatZ(files []CompareFile, out []byte) {
	byPath := make(map[string]int, len(files))
	for i, f := range files {
		byPath[f.Path] = i
	}
	fields := strings.Split(string(out), "\x00")
	for i := 0; i < len(fields); i++ {
		parts := strings.SplitN(fields[i], "\t", 3)
		if len(parts) != 3 {
			continue
		}
		path := parts[2]
		if path == "" && i+2 < len(fields) {
			path = fields[i+2]
			i += 2
		}
		idx, ok := byPath[path]
		if !ok {
			continue
		}
		files[idx].Additions, _ = strconv.Atoi(parts[0])
		files[idx].Deletions, _ = strconv.Atoi(parts[1])
	}
}

// CompareFilePatch returns the unified diff of one path between base (the
// BaseSHA of a CompareResult) and the working tree. oldPath (renames) is added
// to the pathspec so the rename is detected instead of showing up as an add.
func (gs *GitService) CompareFilePatch(base, path, oldPath string, untracked bool) (*FileDiff, error) {
	base, err := gs.resolveCompareBase(base, false)
	if err != nil {
		return nil, err
	}
	if untracked {
		return &FileDiff{Path: path, Patch: string(gs.diffUntracked(path))}, nil
	}
	args := []string{"diff", "--unified", "-M", base, "--", path}
	if oldPath != "" && oldPath != path {
		args = append(args, oldPath)
	}
	out, err := gs.runGit(args...)
	if err != nil {
		return nil, err
	}
	return &FileDiff{Path: path, Patch: string(out)}, nil
}

// CompareFileContents returns the base and working-tree sides of a path, for
// expanding unchanged context in the diff viewer.
func (gs *GitService) CompareFileContents(base, path, oldPath string) (*FileContentsResult, error) {
	base, err := gs.resolveCompareBase(base, false)
	if err != nil {
		return nil, err
	}
	res, err := gs.GetFileContents(path, false)
	if err != nil {
		return nil, err
	}
	res.OldContent, res.HasOld = "", false
	from := path
	if oldPath != "" {
		from = oldPath
	}
	if old, err := gs.showRefFile(base, from); err == nil {
		res.OldContent, res.HasOld = old, true
	}
	return res, nil
}

// ListRefs returns the refs the compare picker offers for the active worktree.
func (a *App) ListRefs() ([]GitRef, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.ListRefs()
}

// GetCompareFiles lists what changed between ref (or its merge base with
// HEAD) and the working tree of the active worktree.
func (a *App) GetCompareFiles(ref string, mergeBase bool) (*CompareResult, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.CompareFiles(ref, mergeBase)
}

// GetCompareFilePatch returns one file's diff for a compare tab; base is the
// BaseSHA that GetCompareFiles resolved; untracked comes from its file entry.
func (a *App) GetCompareFilePatch(base string, path string, oldPath string, untracked bool) (*FileDiff, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.CompareFilePatch(base, path, oldPath, untracked)
}

// GetCompareFileContents returns both sides of a file for a compare tab.
func (a *App) GetCompareFileContents(base string, path string, oldPath string) (*FileContentsResult, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.CompareFileContents(base, path, oldPath)
}
