package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"conflicto/connectors"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx      context.Context
	settings *Settings
	git      *GitService
	recents  *RecentsManager
	reviews  *connectors.Registry
	terms    *terminalManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		reviews: connectors.NewRegistry(
			connectors.NewGitHubConnector(appCommand),
		),
	}
}

func (a *App) repoPath() (string, error) {
	if a.git == nil || !a.git.IsRepo() {
		return "", fmt.Errorf("no git repository")
	}
	return a.git.path, nil
}

func (a *App) reviewConnector() (connectors.ReviewConnector, error) {
	repo, err := a.repoPath()
	if err != nil {
		return nil, err
	}
	return a.reviews.Resolve(repo)
}

// startup is called at application startup
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Load settings
	a.settings = LoadSettings()

	// Initialize recents
	a.recents = NewRecentsManager()

	// Initialize git service
	a.git = NewGitService()

	// Terminal PTY sessions
	a.terms = newTerminalManager(a.EmitEvent)

	// Add current repo to recents if we have one
	if a.git != nil && a.git.IsRepo() {
		a.recents.Add(a.git.path)
	}

	// Detect gh CLI status
	a.DetectGH()

	// Initial UI state is emitted from Refresh() once the frontend
	// has registered event listeners (startup races ahead of that).

	// Fetch PR list if gh is available and we're in a repo
	if a.git != nil && a.git.IsRepo() {
		go a.GetPRList()
	}
}

// domReady is called after the frontend has loaded
func (a *App) domReady(ctx context.Context) {
	// Align system traffic lights with the 44px island header (vertically centered).
	applyMacTrafficLightPosition(16, 16)
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	if a.terms != nil {
		a.terms.stopAll()
	}
	// Save settings
	if a.settings != nil {
		a.settings.Save()
	}
}

// TerminalStart spawns a new PTY session.
func (a *App) TerminalStart(opts TerminalStartOpts) (*TerminalStartResult, error) {
	if a.terms == nil {
		return nil, fmt.Errorf("terminal manager not initialized")
	}
	projectPath := ""
	if a.git != nil && a.git.IsRepo() {
		projectPath = a.git.path
	}
	return a.terms.start(opts, projectPath)
}

// TerminalWrite writes data to a PTY session.
func (a *App) TerminalWrite(id string, data string) error {
	if a.terms == nil {
		return fmt.Errorf("terminal manager not initialized")
	}
	return a.terms.write(id, data)
}

// TerminalResize resizes a PTY session.
func (a *App) TerminalResize(id string, cols int, rows int) error {
	if a.terms == nil {
		return fmt.Errorf("terminal manager not initialized")
	}
	return a.terms.resize(id, cols, rows)
}

// TerminalStop kills a PTY session (explicit pane close only).
func (a *App) TerminalStop(id string) error {
	if a.terms == nil {
		return nil
	}
	return a.terms.stop(id)
}

// GetTerminalPrefs returns persisted terminal UI prefs.
func (a *App) GetTerminalPrefs() map[string]interface{} {
	if a.settings == nil {
		return map[string]interface{}{
			"terminalOpen":   false,
			"terminalHeight": 220,
		}
	}
	height := a.settings.TerminalHeight
	if height <= 0 {
		height = 220
	}
	return map[string]interface{}{
		"terminalOpen":   a.settings.TerminalOpen,
		"terminalHeight": height,
	}
}

// SetTerminalPrefs persists terminal UI prefs.
func (a *App) SetTerminalPrefs(open bool, height int) error {
	if a.settings == nil {
		a.settings = &Settings{}
	}
	if height < 120 {
		height = 120
	}
	a.settings.TerminalOpen = open
	a.settings.TerminalHeight = height
	return a.settings.Save()
}

// beforeClose is called when the application is about to close
func (a *App) beforeClose(ctx context.Context) bool {
	return false
}

// EmitEvent emits a named event to the frontend
func (a *App) EmitEvent(name string, data interface{}) {
	runtime.EventsEmit(a.ctx, name, data)
}

// emitFileStatus emits the current file status
func (a *App) emitFileStatus() {
	if a.git == nil || !a.git.IsRepo() {
		return
	}

	staged, unstaged, conflicts, err := a.git.GetFileStatus()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Git Status Error",
			"message": err.Error(),
		})
		return
	}

	a.EmitEvent("fileStatusChanged", map[string]interface{}{
		"staged":    staged,
		"unstaged":  unstaged,
		"conflicts": conflicts,
	})
}

// emitBranchStatus emits current branch and available branches
func (a *App) emitBranchStatus() {
	if a.git == nil || !a.git.IsRepo() {
		return
	}

	current, err := a.git.GetCurrentBranch()
	if err != nil {
		return
	}

	local, remote, err := a.git.GetBranches()
	if err != nil {
		return
	}

	a.EmitEvent("branchChanged", map[string]interface{}{
		"current": current,
		"local":   local,
		"remote":  remote,
	})
}

// emitAheadBehind emits ahead/behind counts
func (a *App) emitAheadBehind() {
	if a.git == nil || !a.git.IsRepo() {
		return
	}

	ahead, behind, err := a.git.GetAheadBehind()
	if err != nil {
		return
	}

	a.EmitEvent("aheadBehindUpdated", map[string]int{
		"ahead":  ahead,
		"behind": behind,
	})
}

// emitDiff emits diff data for a file.
// staged selects index-vs-HEAD (true) or worktree-vs-index (false).
func (a *App) emitDiff(path string, staged bool) {
	if a.git == nil || !a.git.IsRepo() {
		return
	}

	diff, err := a.git.GetDiff(path, staged)
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Diff Error",
			"message": err.Error(),
		})
		return
	}

	a.EmitEvent("diffLoaded", diff)
}

// StageFile stages a file
func (a *App) StageFile(path string) error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.StageFile(path)
	if err != nil {
		return err
	}

	a.emitFileStatus()
	return nil
}

// UnstageFile unstages a file
func (a *App) UnstageFile(path string) error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.UnstageFile(path)
	if err != nil {
		return err
	}

	a.emitFileStatus()
	return nil
}

// DiscardFile discards unstaged worktree changes for a path.
func (a *App) DiscardFile(path string) error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.DiscardFile(path)
	if err != nil {
		return err
	}

	a.emitFileStatus()
	return nil
}

// Commit creates a commit from staged changes with the given message.
func (a *App) Commit(message string) error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.Commit(message)
	if err != nil {
		return err
	}

	a.emitFileStatus()
	a.emitAheadBehind()
	return nil
}

// SwitchBranch switches to a branch
func (a *App) SwitchBranch(name string) error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.SwitchBranch(name)
	if err != nil {
		return err
	}

	a.emitBranchStatus()
	a.emitFileStatus()
	a.emitAheadBehind()
	return nil
}

// GetDiff gets diff for a file.
// staged=true → staged (index) diff; staged=false → unstaged (worktree) diff.
func (a *App) GetDiff(path string, staged bool) error {
	a.emitDiff(path, staged)
	return nil
}

// GetFileContents returns old and new file contents for diff hydration.
func (a *App) GetFileContents(path string, staged bool) (*FileContentsResult, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.GetFileContents(path, staged)
}

// GetConflictFile returns the worktree contents and unmerged index stages
// (base/ours/theirs) for a conflicted path.
func (a *App) GetConflictFile(path string) (*ConflictFile, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no repository open")
	}
	return a.git.GetConflictFile(path)
}

// WriteFile writes content to a worktree file and refreshes git status.
func (a *App) WriteFile(path string, content string) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no repository open")
	}
	if err := a.git.WriteFile(path, content); err != nil {
		return err
	}
	a.emitFileStatus()
	return nil
}

// Pull performs git pull
func (a *App) Pull() error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.Pull()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Pull Error",
			"message": err.Error(),
		})
		return err
	}

	a.emitFileStatus()
	a.emitAheadBehind()
	return nil
}

// Push performs git push
func (a *App) Push() error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.Push()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Push Error",
			"message": err.Error(),
		})
		return err
	}

	a.emitAheadBehind()
	return nil
}

// Fetch performs git fetch
func (a *App) Fetch() error {
	if a.git == nil {
		return fmt.Errorf("no git repository")
	}

	err := a.git.Fetch()
	if err != nil {
		return err
	}

	a.emitAheadBehind()
	return nil
}

func reviewsToPRMaps(reviews []connectors.Review) []map[string]interface{} {
	prs := make([]map[string]interface{}, 0, len(reviews))
	for _, pr := range reviews {
		prs = append(prs, map[string]interface{}{
			"number":     pr.Number,
			"title":      pr.Title,
			"author":     pr.Author,
			"baseBranch": pr.BaseBranch,
		})
	}
	return prs
}

func emitHostStatus(a *App, status connectors.HostStatus) {
	if !status.Installed && status.Error == "" {
		status.Error = "GitHub CLI (gh) was not found. Install it with Homebrew or add it to PATH."
	}
	a.EmitEvent("ghStatusChanged", map[string]interface{}{
		"installed": status.Installed,
		"version":   status.Version,
		"user":      status.User,
		"error":     status.Error,
	})
}

// DetectGH detects the primary review connector host (GitHub / gh today).
func (a *App) DetectGH() {
	if _, pathErr := commandPath("gh"); pathErr != nil {
		emitHostStatus(a, connectors.HostStatus{
			Installed: false,
			Error:     "GitHub CLI (gh) was not found. Install it with Homebrew or add it to PATH.",
		})
		return
	}
	emitHostStatus(a, a.reviews.PrimaryHostStatus())
}

// GetPRList gets list of open PRs for the current repo and emits structured data
func (a *App) GetPRList() error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	reviews, err := conn.ListReviews(repo, 20, "")
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR List Error",
			"message": "Failed to fetch PR list. Make sure gh CLI is authenticated.",
		})
		return err
	}

	a.EmitEvent("prListUpdated", map[string]interface{}{
		"prs": reviewsToPRMaps(reviews),
	})
	return nil
}

// SearchPRList searches open PRs with optional query and returns structured data.
func (a *App) SearchPRList(limit int, search string) ([]map[string]interface{}, error) {
	repo, err := a.repoPath()
	if err != nil {
		return nil, err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return nil, err
	}
	reviews, err := conn.ListReviews(repo, limit, search)
	if err != nil {
		return nil, err
	}
	return reviewsToPRMaps(reviews), nil
}

// GetPRFiles fetches the changed files for a PR via the review connector.
func (a *App) GetPRFiles(number int) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	files, err := conn.ReviewFileList(repo, number)
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Files Error",
			"message": fmt.Sprintf("Failed to fetch files for PR #%d", number),
		})
		return err
	}

	fileList := make([]map[string]interface{}, 0, len(files))
	for _, f := range files {
		fileList = append(fileList, map[string]interface{}{
			"path":   f.Path,
			"status": f.Status,
		})
	}
	a.EmitEvent("prFilesUpdated", map[string]interface{}{
		"number": number,
		"files":  fileList,
	})
	return nil
}

// GetPRFileDiff returns the diff patch for a single file in a cached PR
func (a *App) GetPRFileDiff(number int, path string) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	diff, err := conn.FileDiff(repo, number, path)
	if err != nil {
		if strings.Contains(err.Error(), "not cached") {
			a.EmitEvent("error", map[string]string{
				"title":   "PR Diff Error",
				"message": fmt.Sprintf("PR #%d not loaded. Fetch files first.", number),
			})
		} else {
			a.EmitEvent("error", map[string]string{
				"title":   "PR Diff Error",
				"message": fmt.Sprintf("File %s not found in PR #%d", path, number),
			})
		}
		a.EmitEvent("diffLoaded", &FileDiff{Path: path, Patch: ""})
		return err
	}
	a.EmitEvent("diffLoaded", &FileDiff{Path: diff.Path, Patch: diff.Patch})
	return nil
}

func (a *App) invalidatePRCache() {
	repo, err := a.repoPath()
	if err != nil {
		return
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return
	}
	conn.InvalidateReviewCache(repo, 0)
}

// GetPRComments fetches review comments for a PR
func (a *App) GetPRComments(number int) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	raw, err := conn.ListCommentsRaw(repo, number)
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Comments Error",
			"message": fmt.Sprintf("Failed to fetch comments for PR #%d", number),
		})
		return err
	}

	a.EmitEvent("prCommentsUpdated", map[string]interface{}{
		"number": number,
		"raw":    raw,
	})
	return nil
}

// PostPRComment posts a review comment on a PR file
func (a *App) PostPRComment(number int, path string, body string, line int, side string, startLine int, startSide string) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	err = conn.PostComment(repo, number, connectors.PostCommentRequest{
		Path:      path,
		Body:      body,
		Line:      line,
		Side:      side,
		StartLine: startLine,
		StartSide: startSide,
	})
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Comment Error",
			"message": err.Error(),
		})
		return err
	}

	a.EmitEvent("prCommentPosted", map[string]interface{}{
		"number": number,
		"path":   path,
		"body":   body,
	})
	return nil
}

// CheckoutPR checks out a PR branch locally via the review connector.
func (a *App) CheckoutPR(number int) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	if err := conn.Checkout(repo, number); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Checkout Error",
			"message": err.Error(),
		})
		return err
	}

	a.emitBranchStatus()
	a.emitFileStatus()
	a.emitAheadBehind()
	a.EmitEvent("prCheckoutCompleted", map[string]interface{}{
		"number": number,
		"mode":   "local",
	})
	return nil
}

// PreviewWorktreePath returns a planned worktree path and hash without creating anything.
func (a *App) PreviewWorktreePath() (WorktreePathPreview, error) {
	if a.git == nil || !a.git.IsRepo() {
		return WorktreePathPreview{}, fmt.Errorf("no git repository")
	}

	path, hash, err := a.git.PreviewWorktreePath()
	if err != nil {
		return WorktreePathPreview{}, err
	}

	return WorktreePathPreview{Path: path, Hash: hash}, nil
}

// CheckoutPRToWorktree checks out a PR into a new git worktree outside the repo.
// If hash is non-empty, uses the pre-reserved path from PreviewWorktreePath.
func (a *App) CheckoutPRToWorktree(number int, hash string) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	mainRepo, err := a.git.MainRepoPath()
	if err != nil {
		return err
	}
	repoName := filepath.Base(mainRepo)

	var worktreePath string
	if hash != "" {
		worktreePath, err = a.git.WorktreePathForHash(hash)
		if err != nil {
			a.EmitEvent("error", map[string]string{
				"title":   "Worktree Error",
				"message": err.Error(),
			})
			return err
		}
		baseDir, baseErr := a.git.WorktreeBaseDir()
		if baseErr != nil {
			return baseErr
		}
		if mkdirErr := os.MkdirAll(baseDir, 0o755); mkdirErr != nil {
			a.EmitEvent("error", map[string]string{
				"title":   "Worktree Error",
				"message": mkdirErr.Error(),
			})
			return mkdirErr
		}
	} else {
		var pathErr error
		worktreePath, hash, pathErr = a.git.NewWorktreePath()
		if pathErr != nil {
			a.EmitEvent("error", map[string]string{
				"title":   "Worktree Error",
				"message": pathErr.Error(),
			})
			return pathErr
		}
	}

	localBranch := fmt.Sprintf("pr-wt-%s", hash)

	headOID := func() (string, error) {
		conn, connErr := a.reviewConnector()
		if connErr != nil {
			return "", connErr
		}
		mainRepo, mainErr := a.git.MainRepoPath()
		if mainErr != nil {
			return "", mainErr
		}
		return conn.ReviewHeadOID(mainRepo, number)
	}

	if err := a.git.FetchPRHead(number, localBranch, headOID); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Fetch Error",
			"message": err.Error(),
		})
		return err
	}

	if err := a.git.AddWorktree(worktreePath, localBranch); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Worktree Error",
			"message": err.Error(),
		})
		return err
	}

	if err := a.switchToProject(worktreePath); err != nil {
		return err
	}

	a.EmitEvent("prCheckoutCompleted", map[string]interface{}{
		"number":       number,
		"mode":         "worktree",
		"worktreePath": worktreePath,
		"repoName":     repoName,
	})
	return nil
}

// GetWorktrees returns all worktrees for the current repository.
func (a *App) GetWorktrees() ([]WorktreeInfo, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no git repository")
	}

	worktrees, err := a.git.ListWorktrees()
	if err != nil {
		return nil, err
	}

	a.EmitEvent("worktreesUpdated", map[string]interface{}{
		"worktrees": worktrees,
	})
	return worktrees, nil
}

// RemoveWorktree removes a worktree at the given path.
func (a *App) RemoveWorktree(path string) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	// If removing the active project, switch back to the main repo first.
	if a.git.path == path {
		mainRepo, err := a.git.MainRepoPath()
		if err != nil {
			return err
		}
		if err := a.switchToProject(mainRepo); err != nil {
			return err
		}
	}

	if err := a.git.RemoveWorktree(path); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Remove Worktree Error",
			"message": err.Error(),
		})
		return err
	}

	a.emitWorktreesUpdated()
	return nil
}

// emitWorktreesUpdated emits the current list of worktrees.
func (a *App) emitWorktreesUpdated() {
	if a.git == nil || !a.git.IsRepo() {
		a.EmitEvent("worktreesUpdated", map[string]interface{}{
			"worktrees": []WorktreeInfo{},
		})
		return
	}

	worktrees, err := a.git.ListWorktrees()
	if err != nil {
		a.EmitEvent("worktreesUpdated", map[string]interface{}{
			"worktrees": []WorktreeInfo{},
		})
		return
	}

	a.EmitEvent("worktreesUpdated", map[string]interface{}{
		"worktrees": worktrees,
	})
}

// CreatePR creates a new pull request from the current branch
func (a *App) CreatePR(title string, body string, baseBranch string, draft bool) error {
	repo, err := a.repoPath()
	if err != nil {
		return err
	}
	conn, err := a.reviewConnector()
	if err != nil {
		return err
	}

	url, err := conn.CreateReview(repo, connectors.CreateReviewRequest{
		Title:      title,
		Body:       body,
		BaseBranch: baseBranch,
		Draft:      draft,
	})
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Create PR Error",
			"message": err.Error(),
		})
		return err
	}

	a.EmitEvent("prCreated", map[string]interface{}{
		"title": title,
		"base":  baseBranch,
		"url":   url,
	})
	go a.GetPRList()
	return nil
}

// emitProjectChanged emits the current project info
func (a *App) emitProjectChanged() {
	name := ""
	path := ""
	if a.git != nil && a.git.IsRepo() {
		name = a.git.GetRepoName()
		path = a.git.path
	}
	a.EmitEvent("projectChanged", map[string]string{
		"name": name,
		"path": path,
	})
}

// emitRecentProjectsUpdated emits the current list of recent projects
func (a *App) emitRecentProjectsUpdated() {
	var projects []RecentProject
	if a.recents != nil {
		projects = a.recents.List()
	}
	a.EmitEvent("recentProjectsUpdated", map[string]interface{}{
		"projects": projects,
	})
}

// switchToProject switches the git service to a new repo path
func (a *App) switchToProject(path string) error {
	if a.git == nil {
		a.git = NewGitService()
	}

	previousPath := ""
	if a.git.IsRepo() {
		previousPath = a.git.path
	}

	err := a.git.OpenRepo(path)
	if err != nil {
		return err
	}

	// Update recents
	if a.recents != nil {
		a.recents.Add(path)
	}

	// Emit updated state
	a.emitProjectChanged()
	a.emitRecentProjectsUpdated()
	a.emitFileStatus()
	a.emitBranchStatus()
	a.emitAheadBehind()

	if previousPath != "" && previousPath != path {
		a.reviews.ClearRepoCache(previousPath)
	}
	a.reviews.ClearRepoCache(path)
	go a.GetPRList()

	a.emitWorktreesUpdated()

	return nil
}

// OpenProject opens a native folder dialog and switches to the selected project
func (a *App) OpenProject() (string, error) {
	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Project",
	})
	if err != nil {
		return "", err
	}
	if selection == "" {
		return "", nil
	}

	err = a.switchToProject(selection)
	if err != nil {
		return "", err
	}

	return selection, nil
}

// SwitchProject switches to a project by path (from recents)
func (a *App) SwitchProject(path string) error {
	return a.switchToProject(path)
}

// GetRecentProjects returns the list of recent projects
func (a *App) GetRecentProjects() ([]RecentProject, error) {
	if a.recents == nil {
		return []RecentProject{}, nil
	}
	return a.recents.List(), nil
}

// GetCurrentProject returns the current project name and path
func (a *App) GetCurrentProject() (map[string]string, error) {
	name := ""
	path := ""
	if a.git != nil && a.git.IsRepo() {
		name = a.git.GetRepoName()
		path = a.git.path
	}
	return map[string]string{
		"name": name,
		"path": path,
	}, nil
}

// ToggleFullscreen enters or exits fullscreen via the Wails runtime.
func (a *App) ToggleFullscreen() {
	if a.ctx == nil {
		return
	}
	if runtime.WindowIsFullscreen(a.ctx) {
		runtime.WindowUnfullscreen(a.ctx)
		return
	}
	runtime.WindowFullscreen(a.ctx)
}

// Refresh re-fetches and re-emits all application state
func (a *App) Refresh() {
	a.emitProjectChanged()
	a.emitRecentProjectsUpdated()
	a.emitFileStatus()
	a.emitBranchStatus()
	a.emitAheadBehind()
	a.DetectGH()
	if a.git != nil && a.git.IsRepo() {
		a.invalidatePRCache()
		go a.GetPRList()
	}
	a.emitWorktreesUpdated()
	a.EmitEvent("refreshCompleted", nil)
}
