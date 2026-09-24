package connectors

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// GitHubConnector implements ReviewConnector via the GitHub CLI (gh).
type GitHubConnector struct {
	cache   *reviewCacheStore
	command func(name string, args ...string) *exec.Cmd
}

// NewGitHubConnector wires a GitHub review connector. command should resolve
// binaries the same way the app does (PATH + login shell on macOS).
func NewGitHubConnector(command func(name string, args ...string) *exec.Cmd) *GitHubConnector {
	return &GitHubConnector{
		cache:   newReviewCacheStore(),
		command: command,
	}
}

func (g *GitHubConnector) ID() string { return "github" }

func (g *GitHubConnector) DisplayName() string { return "GitHub" }

func (g *GitHubConnector) DetectHost() HostStatus {
	cmd := g.command("gh", "--version")
	out, err := cmd.Output()
	if err != nil {
		return HostStatus{
			Installed: false,
			Error:     fmt.Sprintf("GitHub CLI could not be started: %v", err),
		}
	}

	version := strings.TrimSpace(string(out))
	parts := strings.Fields(version)
	if len(parts) >= 3 {
		version = parts[2]
	}

	userCmd := g.command("gh", "api", "user", "-q", ".login")
	userOut, userErr := userCmd.Output()
	user := ""
	if userErr == nil {
		user = strings.TrimSpace(string(userOut))
		if user != "" {
			user = "@" + user
		}
	}

	return HostStatus{
		Installed: true,
		Version:   version,
		User:      user,
	}
}

func (g *GitHubConnector) MatchRepo(repoPath string) bool {
	if repoPath == "" {
		return false
	}
	// gh pr list fails on non-GitHub repos; we still match any git repo when gh
	// is installed so the connector can surface auth errors consistently.
	return g.DetectHost().Installed
}

func (g *GitHubConnector) ListReviews(repoPath string, limit int, search string) ([]Review, error) {
	args := []string{"pr", "list", "--json", "number,title,author,baseRefName", "--limit", strconv.Itoa(limit)}
	if search != "" {
		args = append(args, "--search", search)
	}
	cmd := g.command("gh", args...)
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("gh pr list failed: %w", err)
	}

	var raw []struct {
		Number int    `json:"number"`
		Title  string `json:"title"`
		Author struct {
			Login string `json:"login"`
		} `json:"author"`
		BaseRefName string `json:"baseRefName"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	reviews := make([]Review, 0, len(raw))
	for _, pr := range raw {
		reviews = append(reviews, Review{
			Number:     pr.Number,
			Title:      pr.Title,
			Author:     pr.Author.Login,
			BaseBranch: pr.BaseRefName,
		})
	}
	return reviews, nil
}

func (g *GitHubConnector) ReviewFileList(repoPath string, number int) ([]ReviewFileSummary, error) {
	snap, err := g.loadReviewFiles(repoPath, number, false)
	if err != nil {
		return nil, err
	}
	out := make([]ReviewFileSummary, 0, len(snap.Files))
	for _, f := range snap.Files {
		out = append(out, ReviewFileSummary{Path: f.Path, Status: f.Status})
	}
	return out, nil
}

func (g *GitHubConnector) LoadReviewFiles(repoPath string, number int) (ReviewSnapshot, error) {
	return g.loadReviewFiles(repoPath, number, true)
}

func (g *GitHubConnector) loadReviewFiles(repoPath string, number int, forceFetch bool) (ReviewSnapshot, error) {
	if entry, ok := g.cache.get(repoPath, number); ok && !forceFetch &&
		!entry.FetchedAt.IsZero() && time.Since(entry.FetchedAt) < reviewCacheTTL {
		return entry, nil
	}

	slug, err := g.repoSlug(repoPath)
	if err != nil {
		return ReviewSnapshot{}, err
	}

	var apiFiles []struct {
		Filename  string `json:"filename"`
		Status    string `json:"status"`
		Additions int    `json:"additions"`
		Deletions int    `json:"deletions"`
		Patch     string `json:"patch"`
	}

	const perPage = 100
	for page := 1; ; page++ {
		cmd := g.command(
			"gh", "api",
			fmt.Sprintf("repos/%s/pulls/%d/files?per_page=%d&page=%d", slug, number, perPage, page),
		)
		cmd.Dir = repoPath
		out, err := cmd.Output()
		if err != nil {
			return ReviewSnapshot{}, fmt.Errorf("failed to fetch files for review #%d: %w", number, err)
		}

		var pageFiles []struct {
			Filename  string `json:"filename"`
			Status    string `json:"status"`
			Additions int    `json:"additions"`
			Deletions int    `json:"deletions"`
			Patch     string `json:"patch"`
		}
		if err := json.Unmarshal(out, &pageFiles); err != nil {
			return ReviewSnapshot{}, err
		}
		apiFiles = append(apiFiles, pageFiles...)
		if len(pageFiles) < perPage {
			break
		}
		if len(apiFiles) >= 3000 {
			break
		}
	}

	files := make([]ReviewFile, 0, len(apiFiles))
	for _, f := range apiFiles {
		status := strings.ToUpper(f.Status)
		if len(status) > 1 {
			status = string(status[0])
		}
		files = append(files, ReviewFile{
			Path:      f.Filename,
			Status:    status,
			Additions: f.Additions,
			Deletions: f.Deletions,
			Patch:     f.Patch,
		})
	}

	headSHA := ""
	headCmd := g.command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d", slug, number), "--jq", ".head.sha")
	headCmd.Dir = repoPath
	if headOut, headErr := headCmd.Output(); headErr == nil {
		headSHA = strings.TrimSpace(string(headOut))
	}

	snap := ReviewSnapshot{
		Number:    number,
		HeadSHA:   headSHA,
		Files:     files,
		FetchedAt: time.Now(),
	}
	g.cache.set(repoPath, snap)
	return snap, nil
}

func (g *GitHubConnector) FileDiff(repoPath string, number int, path string) (FileDiff, error) {
	snap, err := loadReviewCacheEntry(g.cache, repoPath, number, func() error {
		_, err := g.loadReviewFiles(repoPath, number, true)
		return err
	})
	if err != nil {
		return FileDiff{}, err
	}
	return fileDiffFromReviewCache(snap, number, path)
}

func (g *GitHubConnector) ListCommentsRaw(repoPath string, number int) (string, error) {
	slug, err := g.repoSlug(repoPath)
	if err != nil {
		return "", err
	}
	cmd := g.command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/comments", slug, number))
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to fetch comments for review #%d: %w", number, err)
	}
	return string(out), nil
}

func (g *GitHubConnector) PostComment(repoPath string, number int, req PostCommentRequest) error {
	slug, err := g.repoSlug(repoPath)
	if err != nil {
		return err
	}
	if req.HeadSHA == "" {
		snap, snapErr := loadReviewCacheEntry(g.cache, repoPath, number, func() error {
			_, err := g.loadReviewFiles(repoPath, number, true)
			return err
		})
		if snapErr != nil {
			return fmt.Errorf("review #%d not loaded: %w", number, snapErr)
		}
		req.HeadSHA = snap.HeadSHA
	}
	if req.HeadSHA == "" {
		return fmt.Errorf("review #%d has no head commit", number)
	}

	payload := map[string]interface{}{
		"body":      req.Body,
		"commit_id": req.HeadSHA,
		"path":      req.Path,
		"line":      req.Line,
		"side":      req.Side,
	}
	if req.StartLine > 0 && req.StartSide != "" {
		payload["start_line"] = req.StartLine
		payload["start_side"] = req.StartSide
	}

	payloadJSON, _ := json.Marshal(payload)
	cmd := g.command("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/comments", slug, number), "-X", "POST", "--input", "-")
	cmd.Dir = repoPath
	cmd.Stdin = strings.NewReader(string(payloadJSON))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func (g *GitHubConnector) Checkout(repoPath string, number int) error {
	cmd := g.command("gh", "pr", "checkout", fmt.Sprintf("%d", number))
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func (g *GitHubConnector) CreateReview(repoPath string, req CreateReviewRequest) (string, error) {
	args := []string{"pr", "create", "--title", req.Title, "--body", req.Body, "--base", req.BaseBranch}
	if req.Draft {
		args = append(args, "--draft")
	}
	cmd := g.command("gh", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s: %w", strings.TrimSpace(string(out)), err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (g *GitHubConnector) ReviewHeadOID(repoPath string, number int) (string, error) {
	cmd := g.command("gh", "pr", "view", fmt.Sprintf("%d", number), "--json", "headRefOid", "--jq", ".headRefOid")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	oid := strings.TrimSpace(string(out))
	if oid == "" {
		return "", fmt.Errorf("empty review head OID")
	}
	return oid, nil
}

func (g *GitHubConnector) InvalidateReviewCache(repoPath string, number int) {
	g.cache.invalidate(repoPath, number)
}

func (g *GitHubConnector) ClearRepoCache(repoPath string) {
	g.cache.clearRepo(repoPath)
}

func (g *GitHubConnector) HeadSHA(repoPath string, number int) (string, error) {
	snap, ok := g.cache.get(repoPath, number)
	if ok && snap.HeadSHA != "" {
		return snap.HeadSHA, nil
	}
	snap, err := g.loadReviewFiles(repoPath, number, true)
	if err != nil {
		return "", err
	}
	return snap.HeadSHA, nil
}

func (g *GitHubConnector) repoSlug(repoPath string) (string, error) {
	cmd := g.command("gh", "repo", "view", "--json", "owner,name")
	cmd.Dir = repoPath
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
		return "", err
	}
	if result.Owner.Login == "" || result.Name == "" {
		return "", fmt.Errorf("incomplete repo metadata from gh")
	}
	return result.Owner.Login + "/" + result.Name, nil
}
