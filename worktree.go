package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// WorktreeInfo describes a git worktree linked to the current repository.
type WorktreeInfo struct {
	Path      string `json:"path"`
	Branch    string `json:"branch"`
	Head      string `json:"head"`
	IsMain    bool   `json:"isMain"`
	IsCurrent bool   `json:"isCurrent"`
}

// MainRepoPath returns the main repository toplevel, even when gs.path is a linked worktree.
func (gs *GitService) MainRepoPath() (string, error) {
	if gs.path == "" {
		return "", fmt.Errorf("no repository open")
	}

	out, err := gs.runGit("rev-parse", "--git-common-dir")
	if err != nil {
		return "", err
	}

	commonDir := strings.TrimSpace(string(out))
	if commonDir == ".git" {
		top, err := gs.runGit("rev-parse", "--show-toplevel")
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(top)), nil
	}

	if !filepath.IsAbs(commonDir) {
		commonDir = filepath.Join(gs.path, commonDir)
	}
	return filepath.Dir(commonDir), nil
}

// WorktreeBaseDir returns the parent directory for new worktrees:
// <parent-of-main-repo>/worktrees/<repo-name>
func (gs *GitService) WorktreeBaseDir() (string, error) {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return "", err
	}
	repoName := filepath.Base(mainRepo)
	parent := filepath.Dir(mainRepo)
	return filepath.Join(parent, "worktrees", repoName), nil
}

// WorktreePathPreview is the planned path/hash for a new worktree (not yet created).
type WorktreePathPreview struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

// WorktreePathForHash returns the filesystem path for a worktree hash without creating it.
func (gs *GitService) WorktreePathForHash(hash string) (string, error) {
	baseDir, err := gs.WorktreeBaseDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(baseDir, hash), nil
}

// PreviewWorktreePath generates a hash and returns the path where a worktree would be created.
func (gs *GitService) PreviewWorktreePath() (string, string, error) {
	hash, err := randomHex(8)
	if err != nil {
		return "", "", err
	}
	path, err := gs.WorktreePathForHash(hash)
	if err != nil {
		return "", "", err
	}
	return path, hash, nil
}

// NewWorktreePath generates a unique worktree path under WorktreeBaseDir.
func (gs *GitService) NewWorktreePath() (string, string, error) {
	path, hash, err := gs.PreviewWorktreePath()
	if err != nil {
		return "", "", err
	}

	baseDir, err := gs.WorktreeBaseDir()
	if err != nil {
		return "", "", err
	}

	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return "", "", fmt.Errorf("create worktree base dir: %w", err)
	}

	return path, hash, nil
}

// ListWorktrees returns all worktrees for the repository.
func (gs *GitService) ListWorktrees() ([]WorktreeInfo, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}

	out, err := gs.runGit("worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}

	var worktrees []WorktreeInfo
	var current *WorktreeInfo

	flush := func() {
		if current == nil {
			return
		}
		worktrees = append(worktrees, *current)
		current = nil
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if line == "" {
			flush()
			continue
		}

		key, value, _ := strings.Cut(line, " ")
		switch key {
		case "worktree":
			flush()
			current = &WorktreeInfo{Path: value}
		case "HEAD":
			if current != nil {
				head := value
				if len(head) > 7 {
					head = head[:7]
				}
				current.Head = head
			}
		case "branch":
			if current != nil {
				current.Branch = strings.TrimPrefix(value, "refs/heads/")
			}
		case "detached":
			// leave Branch empty
		}
	}
	flush()

	for i := range worktrees {
		worktrees[i].IsMain = i == 0
		worktrees[i].IsCurrent = worktrees[i].Path == gs.path
	}

	return worktrees, nil
}

// FetchPRHead fetches a PR head into a local branch without touching the main working tree.
func (gs *GitService) FetchPRHead(number int, localBranch string) error {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return err
	}

	refspec := fmt.Sprintf("pull/%d/head:refs/heads/%s", number, localBranch)
	cmd := appCommand("git", "fetch", "origin", refspec)
	cmd.Dir = mainRepo
	out, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}

	// Fallback: fetch by OID via gh (handles edge cases where pull/N/head is unavailable).
	oid, oidErr := gs.prHeadOID(mainRepo, number)
	if oidErr != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}

	fallbackSpec := fmt.Sprintf("%s:refs/heads/%s", oid, localBranch)
	fallbackCmd := appCommand("git", "fetch", "origin", fallbackSpec)
	fallbackCmd.Dir = mainRepo
	fallbackOut, fallbackErr := fallbackCmd.CombinedOutput()
	if fallbackErr != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(fallbackOut)), fallbackErr)
	}
	return nil
}

func (gs *GitService) prHeadOID(repoPath string, number int) (string, error) {
	cmd := appCommand("gh", "pr", "view", fmt.Sprintf("%d", number), "--json", "headRefOid", "--jq", ".headRefOid")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	oid := strings.TrimSpace(string(out))
	if oid == "" {
		return "", fmt.Errorf("empty PR head OID")
	}
	return oid, nil
}

// AddWorktree creates a new worktree at path checking out branch.
func (gs *GitService) AddWorktree(path, branch string) error {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return err
	}

	cmd := appCommand("git", "worktree", "add", path, branch)
	cmd.Dir = mainRepo
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// RemoveWorktree removes a worktree at the given path.
func (gs *GitService) RemoveWorktree(path string) error {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return err
	}

	cmd := appCommand("git", "worktree", "remove", path)
	cmd.Dir = mainRepo
	out, err := cmd.CombinedOutput()
	if err != nil {
		// Try pruning stale administrative entries.
		prune := appCommand("git", "worktree", "prune")
		prune.Dir = mainRepo
		_, _ = prune.CombinedOutput()
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// samePath reports whether two filesystem paths refer to the same location,
// tolerating symlinks (e.g. /var vs /private/var on macOS) when both exist.
func samePath(a, b string) bool {
	if filepath.Clean(a) == filepath.Clean(b) {
		return true
	}
	ra, errA := filepath.EvalSymlinks(a)
	rb, errB := filepath.EvalSymlinks(b)
	return errA == nil && errB == nil && ra == rb
}

// findWorktreeOwner returns the main repository that owns the worktree at path.
// When the worktree directory exists, git answers from the worktree itself.
// When it has been deleted on disk, candidates (typically recents) are scanned
// for a repo whose worktree list still contains path.
func findWorktreeOwner(path string, candidates []RecentProject) (string, error) {
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		main, err := (&GitService{path: path}).MainRepoPath()
		if err != nil {
			return "", fmt.Errorf("%s is not a git worktree: %w", path, err)
		}
		return main, nil
	}

	for _, r := range candidates {
		if info, err := os.Stat(r.Path); err != nil || !info.IsDir() {
			continue
		}
		main, err := (&GitService{path: r.Path}).MainRepoPath()
		if err != nil {
			continue
		}
		wts, err := (&GitService{path: main}).ListWorktrees()
		if err != nil {
			continue
		}
		for _, wt := range wts {
			if samePath(wt.Path, path) {
				return main, nil
			}
		}
	}
	return "", fmt.Errorf("worktree %s not found in any known repository", path)
}

// removeWorktreeFromOwner removes the worktree at path from whichever repo owns it,
// independent of the active project. It also drops the branch's conflicto-pr config entry.
func removeWorktreeFromOwner(path string, candidates []RecentProject) error {
	owner, err := findWorktreeOwner(path, candidates)
	if err != nil {
		return err
	}
	ogs := &GitService{path: owner}

	// Look up the branch before removal; the entry is still listed while admin data exists.
	branch := ""
	if wts, err := ogs.ListWorktrees(); err == nil {
		for _, wt := range wts {
			if samePath(wt.Path, path) {
				branch = wt.Branch
				break
			}
		}
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		// Directory already gone: only the stale administrative entry needs pruning.
		prune := appCommand("git", "worktree", "prune")
		prune.Dir = owner
		if out, err := prune.CombinedOutput(); err != nil {
			return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
		}
	} else if err := ogs.RemoveWorktree(path); err != nil {
		return err
	}

	if branch != "" {
		// Best effort: the key may not exist, which is not an error.
		_, _ = ogs.runGit("config", "--unset", "branch."+branch+"."+prConfigKey)
	}
	return nil
}

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// recentsPath is the path recorded in recents for the open project. Worktrees under
// WorktreeBaseDir are created by the app (PR worktrees), so they collapse into their
// main repo instead of crowding real projects out of the capped list.
func (gs *GitService) recentsPath() string {
	mainRepo, err := gs.MainRepoPath()
	if err != nil || samePath(mainRepo, gs.path) {
		return gs.path
	}
	base, err := gs.WorktreeBaseDir()
	if err != nil {
		return gs.path
	}
	if rel, err := filepath.Rel(base, gs.path); err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
		return mainRepo
	}
	return gs.path
}
