package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strconv"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// PRFile represents a file in a pull request (cached)
type PRFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
}

// PRCache stores metadata and files for a cached pull request
type PRCache struct {
	HeadSHA   string    `json:"headSHA"`
	Files     []PRFile  `json:"files"`
	FetchedAt time.Time `json:"fetchedAt"`
}

// prCacheTTL is how long cached PR files are considered fresh
const prCacheTTL = 1 * time.Minute

// App struct
type App struct {
	ctx      context.Context
	settings *Settings
	git      *GitService
	recents  *RecentsManager
	prCache  map[int]PRCache
	terms    *terminalManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		prCache: make(map[int]PRCache),
	}
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
	// Frontend is ready to receive events
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

// TerminalStopAll kills all PTY sessions (app shutdown).
func (a *App) TerminalStopAll() {
	if a.terms != nil {
		a.terms.stopAll()
	}
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

// DetectGH detects gh CLI installation
func (a *App) DetectGH() {
	cmd := exec.Command("gh", "--version")
	out, err := cmd.Output()

	if err != nil {
		a.EmitEvent("ghStatusChanged", map[string]interface{}{
			"installed": false,
			"version":   "",
			"user":      "",
		})
		return
	}

	version := strings.TrimSpace(string(out))
	// Extract version number from output like "gh version 2.40.1 (2024-01-01)"
	parts := strings.Fields(version)
	if len(parts) >= 3 {
		version = parts[2]
	}

	// Check if logged in
	userCmd := exec.Command("gh", "api", "user", "-q", ".login")
	userOut, userErr := userCmd.Output()

	user := ""
	if userErr == nil {
		user = strings.TrimSpace(string(userOut))
		if user != "" {
			user = "@" + user
		}
	}

	a.EmitEvent("ghStatusChanged", map[string]interface{}{
		"installed": true,
		"version":   version,
		"user":      user,
	})
}

// GetPRList gets list of open PRs for the current repo and emits structured data
func (a *App) GetPRList() error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	cmd := exec.Command("gh", "pr", "list", "--json", "number,title,author,baseRefName", "--limit", "20")
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR List Error",
			"message": "Failed to fetch PR list. Make sure gh CLI is authenticated.",
		})
		return err
	}

	var raw []struct {
		Number      int    `json:"number"`
		Title       string `json:"title"`
		Author      struct {
			Login string `json:"login"`
		} `json:"author"`
		BaseRefName string `json:"baseRefName"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR List Parse Error",
			"message": err.Error(),
		})
		return err
	}

	prs := make([]map[string]interface{}, 0, len(raw))
	for _, pr := range raw {
		prs = append(prs, map[string]interface{}{
			"number":     pr.Number,
			"title":      pr.Title,
			"author":     pr.Author.Login,
			"baseBranch": pr.BaseRefName,
		})
	}

	a.EmitEvent("prListUpdated", map[string]interface{}{
		"prs": prs,
	})
	return nil
}

// SearchPRList searches open PRs with optional query and returns structured data.
func (a *App) SearchPRList(limit int, search string) ([]map[string]interface{}, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no git repository")
	}

	args := []string{"pr", "list", "--json", "number,title,author,baseRefName", "--limit", strconv.Itoa(limit)}
	if search != "" {
		args = append(args, "--search", search)
	}
	cmd := exec.Command("gh", args...)
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("gh pr list failed: %w", err)
	}

	var raw []struct {
		Number      int    `json:"number"`
		Title       string `json:"title"`
		Author      struct {
			Login string `json:"login"`
		} `json:"author"`
		BaseRefName string `json:"baseRefName"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	prs := make([]map[string]interface{}, 0, len(raw))
	for _, pr := range raw {
		prs = append(prs, map[string]interface{}{
			"number":     pr.Number,
			"title":      pr.Title,
			"author":     pr.Author.Login,
			"baseBranch": pr.BaseRefName,
		})
	}
	return prs, nil
}

// GetPRFiles fetches the changed files for a PR via GitHub API and caches them
func (a *App) GetPRFiles(number int) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	// Return cached file list if still fresh (without re-fetching patches)
	if cache, ok := a.prCache[number]; ok && !cache.FetchedAt.IsZero() && time.Since(cache.FetchedAt) < prCacheTTL {
		fileList := make([]map[string]interface{}, 0, len(cache.Files))
		for _, f := range cache.Files {
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

	slug, err := a.git.GetRepoSlug()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Files Error",
			"message": err.Error(),
		})
		return err
	}

	cmd := exec.Command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/files", slug, number))
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Files Error",
			"message": fmt.Sprintf("Failed to fetch files for PR #%d", number),
		})
		return err
	}

	var apiFiles []struct {
		Filename  string `json:"filename"`
		Status    string `json:"status"`
		Additions int    `json:"additions"`
		Deletions int    `json:"deletions"`
		Patch     string `json:"patch"`
	}
	if err := json.Unmarshal(out, &apiFiles); err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Files Parse Error",
			"message": err.Error(),
		})
		return err
	}

	files := make([]PRFile, 0, len(apiFiles))
	for _, f := range apiFiles {
		status := strings.ToUpper(f.Status)
		if len(status) > 1 {
			status = string(status[0])
		}
		files = append(files, PRFile{
			Path:      f.Filename,
			Status:    status,
			Additions: f.Additions,
			Deletions: f.Deletions,
			Patch:     f.Patch,
		})
	}

	// Fetch PR head SHA for posting comments
	headSHA := ""
	headCmd := exec.Command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d", slug, number), "--jq", ".head.sha")
	headCmd.Dir = a.git.path
	if headOut, headErr := headCmd.Output(); headErr == nil {
		headSHA = strings.TrimSpace(string(headOut))
	}

	a.prCache[number] = PRCache{
		HeadSHA:   headSHA,
		Files:     files,
		FetchedAt: time.Now(),
	}

	// Emit simplified file list to frontend (no patch payload)
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

// GetPRFileDiff returns the parsed diff for a single file in a cached PR
func (a *App) GetPRFileDiff(number int, path string) error {
	cache, ok := a.prCache[number]
	if !ok {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Diff Error",
			"message": fmt.Sprintf("PR #%d not loaded. Fetch files first.", number),
		})
		return fmt.Errorf("PR #%d not cached", number)
	}

	for _, f := range cache.Files {
		if f.Path == path {
			parsed, err := ParseUnifiedDiff([]byte(f.Patch))
			if err != nil {
				a.EmitEvent("error", map[string]string{
					"title":   "Diff Parse Error",
					"message": err.Error(),
				})
				return err
			}

			a.EmitEvent("diffLoaded", &FileDiff{
				Path:      f.Path,
				Status:    f.Status,
				Additions: parsed.Additions,
				Deletions: parsed.Deletions,
				Lines:     parsed.Lines,
				Hunks:     parsed.Hunks,
				Patch:     f.Patch,
			})
			return nil
		}
	}

	a.EmitEvent("error", map[string]string{
		"title":   "PR Diff Error",
		"message": fmt.Sprintf("File %s not found in PR #%d", path, number),
	})
	return fmt.Errorf("file %s not found in PR #%d", path, number)
}

// InvalidatePRCache resets all PR cache timestamps so the next fetch hits the API
func (a *App) InvalidatePRCache() {
	for n, cache := range a.prCache {
		cache.FetchedAt = time.Time{}
		a.prCache[n] = cache
	}
}

// GetPRComments fetches review comments for a PR
func (a *App) GetPRComments(number int) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	slug, err := a.git.GetRepoSlug()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Comments Error",
			"message": err.Error(),
		})
		return err
	}

	cmd := exec.Command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/comments", slug, number))
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Comments Error",
			"message": fmt.Sprintf("Failed to fetch comments for PR #%d", number),
		})
		return err
	}

	a.EmitEvent("prCommentsUpdated", map[string]interface{}{
		"number": number,
		"raw":    string(out),
	})
	return nil
}

// PostPRComment posts a review comment on a PR file
func (a *App) PostPRComment(number int, path string, body string, line int, side string, startLine int, startSide string) error {
	cache, ok := a.prCache[number]
	if !ok || cache.HeadSHA == "" {
		a.EmitEvent("error", map[string]string{
			"title":   "Comment Error",
			"message": fmt.Sprintf("PR #%d not loaded. Fetch files first.", number),
		})
		return fmt.Errorf("PR #%d not cached", number)
	}

	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	slug, err := a.git.GetRepoSlug()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Comment Error",
			"message": err.Error(),
		})
		return err
	}

	payload := map[string]interface{}{
		"body":       body,
		"commit_id":  cache.HeadSHA,
		"path":       path,
		"line":       line,
		"side":       side,
	}
	if startLine > 0 && startSide != "" {
		payload["start_line"] = startLine
		payload["start_side"] = startSide
	}

	payloadJSON, _ := json.Marshal(payload)
	cmd := exec.Command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/comments", slug, number), "-X", "POST", "--input", "-")
	cmd.Dir = a.git.path
	cmd.Stdin = strings.NewReader(string(payloadJSON))
	out, err := cmd.CombinedOutput()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Comment Error",
			"message": string(out),
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

// CheckoutPR checks out a PR branch locally using gh pr checkout
func (a *App) CheckoutPR(number int) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	cmd := exec.Command("gh", "pr", "checkout", fmt.Sprintf("%d", number))
	cmd.Dir = a.git.path
	out, err := cmd.CombinedOutput()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Checkout Error",
			"message": string(out),
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

// CheckoutPRToWorktree checks out a PR into a new git worktree
func (a *App) CheckoutPRToWorktree(number int) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	repoPath := a.git.path
	repoName := filepath.Base(repoPath)

	// First do gh pr checkout locally to fetch the branch
	checkoutCmd := exec.Command("gh", "pr", "checkout", fmt.Sprintf("%d", number))
	checkoutCmd.Dir = repoPath
	checkoutOut, checkoutErr := checkoutCmd.CombinedOutput()
	if checkoutErr != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Checkout Error",
			"message": string(checkoutOut),
		})
		return checkoutErr
	}

	// Get the branch name of the PR
	branchCmd := exec.Command("gh", "pr", "view", fmt.Sprintf("%d", number), "--json", "headRefName", "--jq", ".headRefName")
	branchCmd.Dir = repoPath
	branchOut, branchErr := branchCmd.Output()
	if branchErr != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "PR Branch Error",
			"message": "Could not determine PR branch name.",
		})
		return branchErr
	}
	branch := strings.TrimSpace(string(branchOut))

	// Create worktree path: <repo>/worktrees/pr-<number>
	worktreePath := filepath.Join(repoPath, "worktrees", fmt.Sprintf("pr-%d", number))

	// Create worktree
	wtCmd := exec.Command("git", "worktree", "add", worktreePath, branch)
	wtCmd.Dir = repoPath
	wtOut, wtErr := wtCmd.CombinedOutput()
	if wtErr != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Worktree Error",
			"message": string(wtOut),
		})
		return wtErr
	}

	// Switch to the worktree as the active project
	err := a.switchToProject(worktreePath)
	if err != nil {
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

// CreatePR creates a new pull request from the current branch
func (a *App) CreatePR(title string, body string, baseBranch string, draft bool) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	args := []string{"pr", "create", "--title", title, "--body", body, "--base", baseBranch}
	if draft {
		args = append(args, "--draft")
	}

	cmd := exec.Command("gh", args...)
	cmd.Dir = a.git.path
	out, err := cmd.CombinedOutput()
	if err != nil {
		a.EmitEvent("error", map[string]string{
			"title":   "Create PR Error",
			"message": string(out),
		})
		return err
	}

	a.EmitEvent("prCreated", map[string]interface{}{
		"title": title,
		"base":  baseBranch,
		"url":   strings.TrimSpace(string(out)),
	})
	// Refresh PR list after creating
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

	// Fetch PR list for the new repo
	a.prCache = make(map[int]PRCache)
	go a.GetPRList()

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
	a.EmitEvent("platformInfo", map[string]string{
		"platform": goruntime.GOOS,
	})
	a.emitProjectChanged()
	a.emitRecentProjectsUpdated()
	a.emitFileStatus()
	a.emitBranchStatus()
	a.emitAheadBehind()
	a.DetectGH()
	if a.git != nil && a.git.IsRepo() {
		a.InvalidatePRCache()
		go a.GetPRList()
	}
	a.EmitEvent("refreshCompleted", nil)
}
