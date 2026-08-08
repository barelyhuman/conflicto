package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// FileDiff represents a file's diff information
type FileDiff struct {
	Path       string      `json:"path"`
	Status     string      `json:"status"`
	Additions  int         `json:"additions"`
	Deletions  int         `json:"deletions"`
	Lines      []DiffLine  `json:"lines"`
	Hunks      []Hunk      `json:"hunks"`
	Patch      string      `json:"patch"` // raw unified diff string
}

// DiffLine represents a single line in a diff
type DiffLine struct {
	Type       string `json:"type"`       // context, add, remove
	OldLineNo  *int   `json:"oldLineNo"`  // nil for additions
	NewLineNo  *int   `json:"newLineNo"`  // nil for deletions
	Content    string `json:"content"`
}

// GitService wraps git CLI operations
type GitService struct {
	path string
}

// FileStatus represents a file's git status
type FileStatus struct {
	Path     string `json:"path"`
	Status   string `json:"status"`   // M, A, D, R, C
	OldPath  string `json:"oldPath"`
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
			cmd := exec.Command("git", "rev-parse", "--show-toplevel")
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
	cmd := exec.Command("gh", "repo", "view", "--json", "owner,name")
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
	cmd := exec.Command("git", args...)
	cmd.Dir = gs.path
	return cmd.Output()
}

// GetFileStatus returns staged, unstaged, and conflicted files
func (gs *GitService) GetFileStatus() ([]FileStatus, []FileStatus, []FileStatus, error) {
	if gs.path == "" {
		return nil, nil, nil, fmt.Errorf("no repository open")
	}

	out, err := gs.runGit("status", "--porcelain")
	if err != nil {
		return nil, nil, nil, err
	}

	var staged []FileStatus
	var unstaged []FileStatus
	var conflicts []FileStatus

	lines := strings.Split(string(out), "\n")
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
			fs := FileStatus{Path: path, Status: "?", OldPath: path}
			if isConflict(path) {
				fs.Status = "C"
				conflicts = append(conflicts, fs)
			}
			continue
		}

		// Conflicts (unmerged)
		if x == 'U' || y == 'U' {
			status := string(x)
			if y != ' ' && y != 'U' {
				status = string(y)
			}
			conflicts = append(conflicts, FileStatus{
				Path:    path,
				Status:  status,
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

	return staged, unstaged, conflicts, nil
}

// isConflict checks if a file has conflict markers
func isConflict(path string) bool {
	content, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return contains(string(content), "<<<<<<<")
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
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
	cmd := exec.Command("git", "reset", "HEAD", path)
	cmd.Dir = gs.path
	return cmd.Run()
}

// DiscardFile discards unstaged worktree changes for a path (restore from index).
func (gs *GitService) DiscardFile(path string) error {
	if gs.path == "" {
		return fmt.Errorf("no repository open")
	}
	_, err := gs.runGit("restore", "--worktree", "--", path)
	return err
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
func (gs *GitService) GetDiff(path string, staged bool) (*FileDiff, error) {
	if gs.path == "" {
		return nil, fmt.Errorf("no repository open")
	}

	var cmd *exec.Cmd
	if staged {
		cmd = exec.Command("git", "diff", "--unified", "--cached", "--", path)
	} else {
		cmd = exec.Command("git", "diff", "--unified", "--", path)
	}
	cmd.Dir = gs.path
	out, err := cmd.Output()
	if err != nil {
		// If the command fails, the file might be unchanged or deleted
		// Try to detect if it's a deleted file by checking if it exists
		if _, statErr := os.Stat(filepath.Join(gs.path, path)); os.IsNotExist(statErr) {
			// File was deleted — get diff showing full deletion
			if staged {
				cmd = exec.Command("git", "diff", "--unified", "--cached", "--", path)
			} else {
				cmd = exec.Command("git", "diff", "--unified", "--", path)
			}
			cmd.Dir = gs.path
			out, _ = cmd.CombinedOutput()
		}
	}

	parsed, err := ParseUnifiedDiff(out)
	if err != nil {
		return nil, err
	}

	// Determine status
	status := "M"
	if len(parsed.Lines) > 0 && parsed.Lines[0].Type == "add" && parsed.Hunks != nil && len(parsed.Hunks) > 0 && parsed.Hunks[0].OldStart == 0 && parsed.Hunks[0].OldCount == 0 {
		status = "A"
	}
	if len(parsed.Lines) > 0 && parsed.Lines[0].Type == "remove" && parsed.Hunks != nil && len(parsed.Hunks) > 0 && parsed.Hunks[0].NewStart == 0 && parsed.Hunks[0].NewCount == 0 {
		status = "D"
	}

	return &FileDiff{
		Path:      path,
		Status:    status,
		Additions: parsed.Additions,
		Deletions: parsed.Deletions,
		Lines:     parsed.Lines,
		Hunks:     parsed.Hunks,
		Patch:     string(out),
	}, nil
}

// GetAheadBehind returns ahead/behind counts
func (gs *GitService) GetAheadBehind() (int, int, error) {
	if gs.path == "" {
		return 0, 0, fmt.Errorf("no repository open")
	}

	cmd := exec.Command("git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
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
