package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
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

// NewWorktreePath generates a unique worktree path under WorktreeBaseDir.
func (gs *GitService) NewWorktreePath() (string, string, error) {
	baseDir, err := gs.WorktreeBaseDir()
	if err != nil {
		return "", "", err
	}

	hash, err := randomHex(8)
	if err != nil {
		return "", "", err
	}

	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return "", "", fmt.Errorf("create worktree base dir: %w", err)
	}

	return filepath.Join(baseDir, hash), hash, nil
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

		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		switch fields[0] {
		case "worktree":
			flush()
			current = &WorktreeInfo{Path: fields[1]}
		case "HEAD":
			if current != nil && len(fields) >= 2 {
				head := fields[1]
				if len(head) > 7 {
					head = head[:7]
				}
				current.Head = head
			}
		case "branch":
			if current != nil && len(fields) >= 2 {
				ref := fields[1]
				current.Branch = strings.TrimPrefix(ref, "refs/heads/")
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

// FetchPRHead fetches a PR head into a local branch without leaving the main repo on that branch.
func (gs *GitService) FetchPRHead(number int, localBranch string) error {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return err
	}

	currentBranch, _ := gs.runGitInDir(mainRepo, "branch", "--show-current")
	current := strings.TrimSpace(string(currentBranch))

	checkoutCmd := exec.Command("gh", "pr", "checkout", fmt.Sprintf("%d", number), "--branch", localBranch)
	checkoutCmd.Dir = mainRepo
	checkoutOut, checkoutErr := checkoutCmd.CombinedOutput()
	if checkoutErr != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(checkoutOut)), checkoutErr)
	}

	// Restore the main repo's previous branch.
	if current != "" && current != localBranch {
		_, restoreErr := gs.runGitInDir(mainRepo, "checkout", current)
		if restoreErr != nil {
			return fmt.Errorf("restore branch %q: %w", current, restoreErr)
		}
	} else if current == "" {
		if _, restoreErr := gs.runGitInDir(mainRepo, "checkout", "-"); restoreErr != nil {
			return fmt.Errorf("restore previous HEAD: %w", restoreErr)
		}
	}

	return nil
}

// AddWorktree creates a new worktree at path checking out branch.
func (gs *GitService) AddWorktree(path, branch string) error {
	mainRepo, err := gs.MainRepoPath()
	if err != nil {
		return err
	}

	cmd := exec.Command("git", "worktree", "add", path, branch)
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

	cmd := exec.Command("git", "worktree", "remove", path)
	cmd.Dir = mainRepo
	out, err := cmd.CombinedOutput()
	if err != nil {
		// Try pruning stale administrative entries.
		prune := exec.Command("git", "worktree", "prune")
		prune.Dir = mainRepo
		_, _ = prune.CombinedOutput()
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
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

func (gs *GitService) runGitInDir(dir string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	return cmd.Output()
}
