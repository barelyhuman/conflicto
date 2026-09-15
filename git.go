package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// FileDiff is the minimal diff payload sent to the frontend (Pierre parses the patch).
type FileDiff struct {
	Path  string `json:"path"`
	Patch string `json:"patch"`
}

// FileContentsResult holds both sides of a file for diff hydration.
type FileContentsResult struct {
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
	HasOld     bool   `json:"hasOld"`
	HasNew     bool   `json:"hasNew"`
}

// GitService wraps git CLI operations
type GitService struct {
	path string
}

// FileStatus represents a file's git status
type FileStatus struct {
	Path    string `json:"path"`
	Status  string `json:"status"` // M, A, D, R, C (conflict-marked untracked), or two-char unmerged code (UU, AA, DU, UD, AU, UA, DD)
	OldPath string `json:"oldPath"`
}

// ConflictFile holds the worktree file (with inline markers for
// modify/modify conflicts) and the ours/theirs index stages (2/3).
// Modify/delete conflicts leave no markers, so those stages drive the viewer.
type ConflictFile struct {
	Worktree    string `json:"worktree"`
	HasWorktree bool   `json:"hasWorktree"`
	Ours        string `json:"ours"`
	HasOurs     bool   `json:"hasOurs"`
	Theirs      string `json:"theirs"`
	HasTheirs   bool   `json:"hasTheirs"`
}

// NewGitService creates a new GitService and attempts to open the current repo
func NewGitService() *GitService {
	gs := &GitService{}

	// Try to find git repo starting from current working directory
	cwd, err := os.Getwd()
	if err != nil {
		return gs
	}

	gs.OpenRepo(cwd)
	return gs
}

// OpenRepo opens a git repository at the given path
func (gs *GitService) OpenRepo(path string) error {
	originalPath := path

	// Walk up directory tree looking for .git
	for {
		gitDir := filepath.Join(path, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			// Verify it's actually a git repo by asking git itself
			cmd := appCommand("git", "rev-parse", "--show-toplevel")
			cmd.Dir = path
			out, err := cmd.Output()
			if err == nil {
				gs.path = strings.TrimSpace(string(out))
				return nil
			}
			return fmt.Errorf("git repository at %s is not readable: %w", path, err)
		}

		parent := filepath.Dir(path)
		if parent == path {
			break
		}
		path = parent
	}

	return fmt.Errorf("no git repository found at %s", originalPath)
}

// IsRepo returns true if a repo is open
func (gs *GitService) IsRepo() bool {
	return gs.path != ""
}

// GetRepoName returns the name of the repo directory
func (gs *GitService) GetRepoName() string {
	if gs.path == "" {
		return ""
	}
	return filepath.Base(gs.path)
}

// GetRepoSlug returns "owner/repo" for the current repository using gh CLI
func (gs *GitService) GetRepoSlug() (string, error) {
	if gs.path == "" {
		return "", fmt.Errorf("no repository open")
	}
	cmd := appCommand("gh", "repo", "view", "--json", "owner,name")
	cmd.Dir = gs.path
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get repo info via gh: %w", err)
	}
	var result struct {
		Owner struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		return "", fmt.Errorf("failed to parse repo info: %w", err)
	}
	return result.Owner.Login + "/" + result.Name, nil
}

// runGit runs a git command in the repo directory and returns stdout
func (gs *GitService) runGit(args ...string) ([]byte, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}
	cmd := appCommand("git", args...)
	cmd.Dir = gs.path
	return cmd.Output()
}

// GetFileStatus returns staged, unstaged, and conflicted files
func (gs *GitService) GetFileStatus() ([]FileStatus, []FileStatus, []FileStatus, error) {
	if gs.path == "" {
		return nil, nil, nil, fmt.Errorf("no repository open")
	}

	// -uall lists every untracked file (not just the top-level directory name).
	out, err := gs.runGit("status", "--porcelain", "-uall")
	if err != nil {
		return nil, nil, nil, err
	}

	staged, unstaged, conflicts := parseFileStatus(string(out), gs.path)
	return staged, unstaged, conflicts, nil
}

// parseFileStatus splits `git status --porcelain -uall` output into staged,
// unstaged, and conflicts lists. repoDir is used to scan untracked files for
// conflict markers. Conflict entries carry the raw two-char unmerged code
// (UU, AA, DU, UD, AU, UA, DD); X describes our side vs the base and Y the
// other side (e.g. UD = we kept our change, they deleted the file).
func parseFileStatus(out string, repoDir string) ([]FileStatus, []FileStatus, []FileStatus) {
	var staged []FileStatus
	var unstaged []FileStatus
	var conflicts []FileStatus

	lines := strings.Split(out, "\n")
	for _, line := range lines {
		if len(line) < 3 {
			continue
		}

		x := line[0] // index status
		y := line[1] // worktree status
		rest := line[3:]

		// Parse path (handle renames with tab separator)
		path := rest
		oldPath := rest
		if idx := strings.Index(rest, "\t"); idx != -1 {
			oldPath = rest[:idx]
			path = rest[idx+1:]
		}

		// Untracked
		if x == '?' && y == '?' {
			fs := FileStatus{Path: path, Status: "U", OldPath: path}
			if isConflict(filepath.Join(repoDir, path)) {
				fs.Status = "C"
				conflicts = append(conflicts, fs)
			} else {
				unstaged = append(unstaged, fs)
			}
			continue
		}

		// Conflicts (unmerged): the seven two-char codes git can emit.
		if isUnmergedCode(x, y) {
			conflicts = append(conflicts, FileStatus{
				Path:    path,
				Status:  string(x) + string(y),
				OldPath: oldPath,
			})
			continue
		}

		// Staged
		if x != ' ' {
			staged = append(staged, FileStatus{
				Path:    path,
				Status:  string(x),
				OldPath: oldPath,
			})
		}

		// Unstaged
		if y != ' ' && y != '?' {
			unstaged = append(unstaged, FileStatus{
				Path:    path,
				Status:  string(y),
				OldPath: oldPath,
			})
		}
	}

	return staged, unstaged, conflicts
}

// isUnmergedCode reports whether the porcelain XY pair is one of the
// unmerged codes: UU, AA, DD, AU, UA, DU, UD.
func isUnmergedCode(x, y byte) bool {
	switch {
	case x == 'U' && y == 'U', // both modified
		x == 'A' && y == 'A', // both added
		x == 'D' && y == 'D', // both deleted
		x == 'A' && y == 'U', // added by us
		x == 'U' && y == 'A', // added by them
		x == 'D' && y == 'U', // deleted by them
		x == 'U' && y == 'D': // deleted by us
		return true
	}
	return false
}

// maxWorktreeContentSize caps worktree file reads sent to the frontend.
// The diff UI can't meaningfully render more than a few MB, and oversized
// reads (e.g. compiled binaries selected as untracked files) block the
// webview with multi-MB IPC payloads.
const maxWorktreeContentSize = 4 << 20 // 4 MiB

// maxConflictScanSize bounds the conflict-marker scan: it runs on every
// status emit for each untracked file, and binaries/oversized files are
// both pointless to scan and false-positive prone (arbitrary bytes can
// contain marker-like sequences, e.g. compiled ELF binaries).
const maxConflictScanSize = 1 << 20 // 1 MiB

// isConflict checks if a file has merge conflict markers at line start.
// Binary files (NUL byte, git's heuristic) and files over maxConflictScanSize
// are never treated as conflicts. A substring match would false-positive on
// files that merely mention markers (e.g. Go sources with "<<<<<<<" in
// string literals).
func isConflict(path string) bool {
	if st, err := os.Stat(path); err != nil || !st.Mode().IsRegular() || st.Size() > maxConflictScanSize {
		return false
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	if bytes.IndexByte(content, 0) != -1 {
		return false
	}
	return hasConflictMarker(content)
}

// hasConflictMarker reports whether any line starts with a `<<<<<<<`
// merge-conflict start marker, optionally followed by a label.
func hasConflictMarker(content []byte) bool {
	for _, line := range strings.Split(string(content), "\n") {
		if !strings.HasPrefix(line, "<<<<<<<") {
			continue
		}
		rest := line[7:]
		if rest == "" || rest[0] == ' ' || rest[0] == '\t' || rest[0] == '\r' {
			return true
		}
	}
	return false
}

// StageFile stages a file
func (gs *GitService) StageFile(path string) error {
	_, err := gs.runGit("add", path)
	return err
}

// UnstageFile unstages a file
func (gs *GitService) UnstageFile(path string) error {
	cmd := appCommand("git", "reset", "HEAD", path)
	cmd.Dir = gs.path
	return cmd.Run()
}

// DiscardFile discards unstaged worktree changes for a path (restore from index).
// Untracked paths are removed from the working tree.
func (gs *GitService) DiscardFile(path string) error {
	if gs.path == "" {
		return fmt.Errorf("no repository open")
	}
	if gs.isUntracked(path) {
		return gs.removeRepoPath(path)
	}
	_, err := gs.runGit("restore", "--worktree", "--", path)
	return err
}

// Commit creates a commit from the current index with the given message.
func (gs *GitService) Commit(message string) error {
	if gs.path == "" {
		return fmt.Errorf("no repository open")
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return fmt.Errorf("commit message is empty")
	}
	_, err := gs.runGit("commit", "-m", message)
	return err
}

// isUntracked reports whether path is not in the index.
func (gs *GitService) isUntracked(path string) bool {
	_, err := gs.runGit("ls-files", "--error-unmatch", "--", path)
	return err != nil
}

// removeRepoPath deletes an untracked file or directory under the repo root.
func (gs *GitService) removeRepoPath(path string) error {
	full := filepath.Clean(filepath.Join(gs.path, path))
	root := filepath.Clean(gs.path)
	sep := string(os.PathSeparator)
	if full != root && !strings.HasPrefix(full, root+sep) {
		return fmt.Errorf("path outside repository")
	}
	return os.RemoveAll(full)
}

// GetCurrentBranch returns the current branch name
func (gs *GitService) GetCurrentBranch() (string, error) {
	out, err := gs.runGit("branch", "--show-current")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// GetBranches returns local and remote branches
func (gs *GitService) GetBranches() ([]string, []string, error) {
	localOut, err := gs.runGit("branch", "--format=%(refname:short)")
	if err != nil {
		return nil, nil, err
	}

	var local []string
	for _, line := range strings.Split(string(localOut), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			local = append(local, line)
		}
	}

	remoteOut, err := gs.runGit("branch", "-r", "--format=%(refname:short)")
	if err != nil {
		return nil, nil, err
	}

	var remote []string
	for _, line := range strings.Split(string(remoteOut), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			remote = append(remote, line)
		}
	}

	return local, remote, nil
}

// SwitchBranch switches to a branch
func (gs *GitService) SwitchBranch(name string) error {
	_, err := gs.runGit("checkout", name)
	return err
}

// GetDiff returns the diff for a file.
// When staged is true, returns the index (cached) diff vs HEAD.
// When staged is false, returns the worktree diff vs the index.
// Untracked files are shown as a full addition via --no-index.
func (gs *GitService) GetDiff(path string, staged bool) (*FileDiff, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}

	var out []byte
	untracked := !staged && gs.isUntracked(path)
	if staged {
		cmd := appCommand("git", "diff", "--unified", "--cached", "--", path)
		cmd.Dir = gs.path
		var err error
		out, err = cmd.Output()
		if err != nil {
			if _, statErr := os.Stat(filepath.Join(gs.path, path)); os.IsNotExist(statErr) {
				cmd = appCommand("git", "diff", "--unified", "--cached", "--", path)
				cmd.Dir = gs.path
				out, _ = cmd.CombinedOutput()
			}
		}
	} else if untracked {
		out = gs.diffUntracked(path)
	} else {
		cmd := appCommand("git", "diff", "--unified", "--", path)
		cmd.Dir = gs.path
		var err error
		out, err = cmd.Output()
		if err != nil {
			if _, statErr := os.Stat(filepath.Join(gs.path, path)); os.IsNotExist(statErr) {
				cmd = appCommand("git", "diff", "--unified", "--", path)
				cmd.Dir = gs.path
				out, _ = cmd.CombinedOutput()
			}
		}
	}

	return &FileDiff{
		Path:  path,
		Patch: string(out),
	}, nil
}

// diffUntracked returns a unified diff treating path as a new file.
// git diff --no-index exits 1 when files differ; that is expected.
func (gs *GitService) diffUntracked(path string) []byte {
	cmd := appCommand("git", "diff", "--unified", "--no-index", "--", "/dev/null", path)
	cmd.Dir = gs.path
	out, err := cmd.CombinedOutput()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 1 {
			return out
		}
	}
	return out
}

// GetFileContents returns the old and new file contents for a diff path.
// staged=true  -> old=HEAD, new=index (staged)
// staged=false -> old=index, new=worktree (unstaged / untracked / deleted)
func (gs *GitService) GetFileContents(path string, staged bool) (*FileContentsResult, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}

	res := &FileContentsResult{}

	if staged {
		// Old = HEAD, New = index
		if old, err := gs.showRefFile("HEAD", path); err == nil {
			res.OldContent = old
			res.HasOld = true
		}
		if new, err := gs.showRefFile("", path); err == nil {
			res.NewContent = new
			res.HasNew = true
		}
	} else {
		// Old = index
		if old, err := gs.showRefFile("", path); err == nil {
			res.OldContent = old
			res.HasOld = true
		}
		// New = worktree (read from disk). Oversized files (likely binaries)
		// are skipped — shipping megabytes over IPC wedges the webview.
		fullPath := filepath.Join(gs.path, path)
		if st, statErr := os.Stat(fullPath); statErr == nil && st.Size() <= maxWorktreeContentSize {
			data, err := os.ReadFile(fullPath)
			if err == nil {
				res.NewContent = string(data)
				res.HasNew = true
			}
		}
	}

	return res, nil
}

// showRefFile reads a file from a git ref. ref="" reads from the index
// (stage 0). stage > 0 reads that unmerged index stage instead (1=base,
// 2=ours, 3=theirs).
func (gs *GitService) showRefFile(ref, path string, stage ...int) (string, error) {
	var spec string
	switch {
	case ref != "":
		spec = fmt.Sprintf("%s:%s", ref, path)
	case len(stage) > 0 && stage[0] > 0:
		spec = fmt.Sprintf(":%d:%s", stage[0], path)
	default:
		spec = fmt.Sprintf(":%s", path)
	}
	cmd := appCommand("git", "show", spec)
	cmd.Dir = gs.path
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// GetConflictFile returns the worktree contents and unmerged index stages
// for a conflicted path. Stages that git does not record for this conflict
// kind (e.g. theirs for a modify/delete conflict) come back with has*=false.
func (gs *GitService) GetConflictFile(path string) (*ConflictFile, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}

	res := &ConflictFile{}

	if out, err := gs.showRefFile("", path, 2); err == nil {
		res.Ours = out
		res.HasOurs = true
	}
	if out, err := gs.showRefFile("", path, 3); err == nil {
		res.Theirs = out
		res.HasTheirs = true
	}

	if st, err := os.Stat(filepath.Join(gs.path, path)); err == nil && st.Size() <= maxWorktreeContentSize {
		if data, err := os.ReadFile(filepath.Join(gs.path, path)); err == nil {
			res.Worktree = string(data)
			res.HasWorktree = true
		}
	}

	return res, nil
}

// GetAheadBehind returns ahead/behind counts
func (gs *GitService) GetAheadBehind() (int, int, error) {
	if gs.path == "" {
		return 0, 0, fmt.Errorf("no repository open")
	}

	cmd := appCommand("git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
	cmd.Dir = gs.path
	out, err := cmd.Output()
	if err != nil {
		return 0, 0, err
	}

	var ahead, behind int
	fmt.Sscanf(string(out), "%d\t%d", &ahead, &behind)
	return ahead, behind, nil
}

// Pull performs git pull
func (gs *GitService) Pull() error {
	_, err := gs.runGit("pull")
	return err
}

// Push performs git push
func (gs *GitService) Push() error {
	_, err := gs.runGit("push")
	return err
}

// Fetch performs git fetch
func (gs *GitService) Fetch() error {
	_, err := gs.runGit("fetch")
	return err
}
