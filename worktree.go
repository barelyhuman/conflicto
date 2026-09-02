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

func randomHex(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
