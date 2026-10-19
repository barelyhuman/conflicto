package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// --- contract types ---------------------------------------------------------

// PRDetails is everything the PR tab header and conversation view need.
type PRDetails struct {
	Number         int              `json:"number"`
	Title          string           `json:"title"`
	Body           string           `json:"body"`
	Author         string           `json:"author"`
	State          string           `json:"state"` // OPEN|MERGED|CLOSED
	IsDraft        bool             `json:"isDraft"`
	URL            string           `json:"url"`
	BaseRef        string           `json:"baseRef"`
	HeadRef        string           `json:"headRef"`
	HeadSHA        string           `json:"headSha"`
	Additions      int              `json:"additions"`
	Deletions      int              `json:"deletions"`
	ChangedFiles   int              `json:"changedFiles"`
	ReviewDecision string           `json:"reviewDecision"`
	CreatedAt      string           `json:"createdAt"`
	UpdatedAt      string           `json:"updatedAt"`
	Checks         *PRChecksSummary `json:"checks"`       // nil if unavailable
	WorktreePath   string           `json:"worktreePath"` // "" if not opened locally
}

// PRSummary is one row of the PR browser.
type PRSummary struct {
	Number       int    `json:"number"`
	Title        string `json:"title"`
	Author       string `json:"author"`
	State        string `json:"state"`
	IsDraft      bool   `json:"isDraft"`
	HeadRef      string `json:"headRef"`
	UpdatedAt    string `json:"updatedAt"`
	WorktreePath string `json:"worktreePath"`
}

// PRTimelineItem is an issue comment or a review on a PR.
type PRTimelineItem struct {
	Kind      string `json:"kind"` // "comment" | "review"
	Author    string `json:"author"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
	State     string `json:"state"` // review: APPROVED|CHANGES_REQUESTED|COMMENTED|DISMISSED; "" for comments
	URL       string `json:"url"`
}

// --- PR cache ---------------------------------------------------------------

// prCacheKey scopes cached PR data to a repo so PR #N of one repo is never
// served for another.
type prCacheKey struct {
	repo   string
	number int
}

// prCacheStore is a mutex-guarded PR cache; PR tabs fetch concurrently.
type prCacheStore struct {
	mu sync.Mutex
	m  map[prCacheKey]PRCache
}

func newPRCacheStore() *prCacheStore {
	return &prCacheStore{m: map[prCacheKey]PRCache{}}
}

func (s *prCacheStore) get(repo string, number int) (PRCache, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.m[prCacheKey{repo, number}]
	return c, ok
}

func (s *prCacheStore) set(repo string, number int, c PRCache) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[prCacheKey{repo, number}] = c
}

// invalidate zeroes every FetchedAt so the next fetch revalidates.
func (s *prCacheStore) invalidate() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, c := range s.m {
		c.FetchedAt = time.Time{}
		s.m[k] = c
	}
}

// mainRepo returns the main repo path of the active worktree.
func (a *App) mainRepo() (string, error) {
	if a.git == nil || !a.git.IsRepo() {
		return "", fmt.Errorf("no git repository")
	}
	return a.git.MainRepoPath()
}

// cachedPR returns the cached entry for PR number in the current repo.
func (a *App) cachedPR(number int) (PRCache, bool) {
	repo, err := a.mainRepo()
	if err != nil {
		return PRCache{}, false
	}
	return a.prCache.get(repo, number)
}

// prRepo resolves the main repo path and its GitHub slug (cached per repo).
func (a *App) prRepo() (dir, slug string, err error) {
	dir, err = a.mainRepo()
	if err != nil {
		return "", "", err
	}
	if v, ok := a.prSlugs.Load(dir); ok {
		return dir, v.(string), nil
	}
	slug, err = ghRepoSlug(dir)
	if err != nil {
		return "", "", err
	}
	a.prSlugs.Store(dir, slug)
	return dir, slug, nil
}

// --- gh access points, replaceable in tests ---------------------------------

var (
	ghRepoSlug = func(dir string) (string, error) {
		gs := &GitService{path: dir}
		return gs.GetRepoSlug()
	}
	// ghAPI GETs a GitHub REST endpoint and returns the raw JSON.
	ghAPI = func(dir, endpoint string) ([]byte, error) {
		cmd := appCommand("gh", "api", endpoint)
		cmd.Dir = dir
		return cmd.Output()
	}
	ghPRViewJSON = func(ctx context.Context, dir string, number int) ([]byte, error) {
		cmd := appCommandContext(ctx, "gh", "pr", "view", strconv.Itoa(number), "--json",
			"number,title,body,author,state,isDraft,url,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,reviewDecision,createdAt,updatedAt")
		cmd.Dir = dir
		return cmd.Output()
	}
	ghSearchPRs = func(ctx context.Context, dir, slug, query, state string, limit int) ([]byte, error) {
		args := []string{"pr", "list", "-R", slug, "--state", state, "--limit", strconv.Itoa(limit),
			"--json", "number,title,author,state,isDraft,headRefName,updatedAt"}
		if query != "" {
			args = append(args, "--search", query)
		}
		cmd := appCommandContext(ctx, "gh", args...)
		cmd.Dir = dir
		return cmd.Output()
	}
)

// ghAPIPages walks a paginated list endpoint and concatenates the items.
func ghAPIPages(dir, endpoint string, max int) ([]json.RawMessage, error) {
	const perPage = 100
	sep := "?"
	if strings.Contains(endpoint, "?") {
		sep = "&"
	}
	var all []json.RawMessage
	for page := 1; ; page++ {
		out, err := ghAPI(dir, fmt.Sprintf("%s%sper_page=%d&page=%d", endpoint, sep, perPage, page))
		if err != nil {
			return nil, err
		}
		var items []json.RawMessage
		if err := json.Unmarshal(out, &items); err != nil {
			return nil, err
		}
		all = append(all, items...)
		if len(items) < perPage || (max > 0 && len(all) >= max) {
			break
		}
	}
	return all, nil
}

// --- details ----------------------------------------------------------------

type ghPRViewPayload struct {
	Number         int    `json:"number"`
	Title          string `json:"title"`
	Body           string `json:"body"`
	State          string `json:"state"`
	IsDraft        bool   `json:"isDraft"`
	URL            string `json:"url"`
	BaseRefName    string `json:"baseRefName"`
	HeadRefName    string `json:"headRefName"`
	HeadRefOid     string `json:"headRefOid"`
	Additions      int    `json:"additions"`
	Deletions      int    `json:"deletions"`
	ChangedFiles   int    `json:"changedFiles"`
	ReviewDecision string `json:"reviewDecision"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	Author         struct {
		Login string `json:"login"`
	} `json:"author"`
}

func parsePRDetails(data []byte) (*PRDetails, error) {
	var p ghPRViewPayload
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &PRDetails{
		Number: p.Number, Title: p.Title, Body: p.Body, Author: p.Author.Login,
		State: p.State, IsDraft: p.IsDraft, URL: p.URL,
		BaseRef: p.BaseRefName, HeadRef: p.HeadRefName, HeadSHA: p.HeadRefOid,
		Additions: p.Additions, Deletions: p.Deletions, ChangedFiles: p.ChangedFiles,
		ReviewDecision: p.ReviewDecision, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}, nil
}

// prWorktreeMap maps PR number -> existing local worktree path for a main repo.
func prWorktreeMap(mainRepo string) map[int]string {
	out := map[int]string{}
	snaps := snapshotRepos([]RecentProject{{Path: mainRepo}})
	if len(snaps) != 1 {
		return out
	}
	for _, wt := range snaps[0].Worktrees {
		if wt.IsMain || wt.Branch == "" {
			continue
		}
		n := snaps[0].WTPR[wt.Branch]
		if n <= 0 {
			continue
		}
		if info, err := os.Stat(wt.Path); err != nil || !info.IsDir() {
			continue
		}
		if _, dup := out[n]; !dup {
			out[n] = wt.Path
		}
	}
	return out
}

// GetPRDetails returns header + conversation metadata for a PR of the current repo.
func (a *App) GetPRDetails(number int) (*PRDetails, error) {
	dir, err := a.mainRepo()
	if err != nil {
		return nil, err
	}

	var checks *PRChecksSummary
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, cerr := ghPRChecks(dir, number); cerr == nil {
			s := summarizePRChecks(number, list)
			checks = &s
		}
	}()

	out, err := ghPRViewJSON(context.Background(), dir, number)
	wg.Wait()
	if err != nil {
		return nil, fmt.Errorf("gh pr view #%d failed: %w", number, err)
	}
	d, err := parsePRDetails(out)
	if err != nil {
		return nil, err
	}
	d.Checks = checks
	d.WorktreePath = prWorktreeMap(dir)[number]
	return d, nil
}

// --- files / patches --------------------------------------------------------

type ghPRFile struct {
	Filename  string `json:"filename"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
}

func prFilesFromAPI(items []json.RawMessage) ([]PRFile, error) {
	files := make([]PRFile, 0, len(items))
	for _, raw := range items {
		var f ghPRFile
		if err := json.Unmarshal(raw, &f); err != nil {
			return nil, err
		}
		status := strings.ToUpper(f.Status)
		if len(status) > 1 {
			status = string(status[0])
		}
		files = append(files, PRFile{Path: f.Filename, Status: status, Additions: f.Additions, Deletions: f.Deletions, Patch: f.Patch})
	}
	return files, nil
}

func prHeadSHA(dir, slug string, number int) (string, error) {
	out, err := ghAPI(dir, fmt.Sprintf("repos/%s/pulls/%d", slug, number))
	if err != nil {
		return "", err
	}
	var p struct {
		Head struct {
			SHA string `json:"sha"`
		} `json:"head"`
	}
	if err := json.Unmarshal(out, &p); err != nil {
		return "", err
	}
	return p.Head.SHA, nil
}

// loadPRCache returns the cache entry for a PR, fetching when missing or stale.
// A stale entry whose head SHA is unchanged is revalidated without refetching files.
func (a *App) loadPRCache(number int) (PRCache, error) {
	dir, slug, err := a.prRepo()
	if err != nil {
		return PRCache{}, err
	}
	cached, ok := a.prCache.get(dir, number)
	if ok && len(cached.Files) > 0 && !cached.FetchedAt.IsZero() && time.Since(cached.FetchedAt) < prCacheTTL {
		return cached, nil
	}

	headSHA, headErr := prHeadSHA(dir, slug, number)
	if headErr == nil && ok && len(cached.Files) > 0 && headSHA != "" && headSHA == cached.HeadSHA {
		cached.FetchedAt = time.Now()
		a.prCache.set(dir, number, cached)
		return cached, nil
	}

	// GitHub caps list-files at 3000 entries.
	items, err := ghAPIPages(dir, fmt.Sprintf("repos/%s/pulls/%d/files", slug, number), 3000)
	if err != nil {
		return PRCache{}, fmt.Errorf("failed to fetch files for PR #%d: %w", number, err)
	}
	files, err := prFilesFromAPI(items)
	if err != nil {
		return PRCache{}, err
	}
	entry := PRCache{HeadSHA: headSHA, Files: files, FetchedAt: time.Now()}
	a.prCache.set(dir, number, entry)
	return entry, nil
}

// GetPRFilesList returns the changed files of a PR (without patches).
func (a *App) GetPRFilesList(number int) ([]PRFile, error) {
	cache, err := a.loadPRCache(number)
	if err != nil {
		return nil, err
	}
	files := make([]PRFile, len(cache.Files))
	for i, f := range cache.Files {
		f.Patch = ""
		files[i] = f
	}
	return files, nil
}

// GetPRFilePatch returns the normalized unified diff for one file of a PR.
func (a *App) GetPRFilePatch(number int, path string) (*FileDiff, error) {
	cache, err := a.loadPRCache(number)
	if err != nil {
		return nil, err
	}
	return fileDiffFromPRCache(cache, number, path)
}

// --- comments / timeline ----------------------------------------------------

// GetPRReviewComments returns the raw GitHub inline review comments of a PR.
func (a *App) GetPRReviewComments(number int) ([]map[string]interface{}, error) {
	dir, slug, err := a.prRepo()
	if err != nil {
		return nil, err
	}
	items, err := ghAPIPages(dir, fmt.Sprintf("repos/%s/pulls/%d/comments", slug, number), 0)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments for PR #%d: %w", number, err)
	}
	out := make([]map[string]interface{}, 0, len(items))
	for _, raw := range items {
		var m map[string]interface{}
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

type ghUser struct {
	Login string `json:"login"`
}

// buildPRTimeline merges issue comments and reviews (REST shapes), oldest first.
// Reviews with an empty body and a COMMENTED state, and pending reviews, are dropped.
func buildPRTimeline(comments, reviews []json.RawMessage) ([]PRTimelineItem, error) {
	items := []PRTimelineItem{}
	for _, raw := range comments {
		var c struct {
			User      ghUser `json:"user"`
			Body      string `json:"body"`
			CreatedAt string `json:"created_at"`
			HTMLURL   string `json:"html_url"`
		}
		if err := json.Unmarshal(raw, &c); err != nil {
			return nil, err
		}
		items = append(items, PRTimelineItem{Kind: "comment", Author: c.User.Login, Body: c.Body, CreatedAt: c.CreatedAt, URL: c.HTMLURL})
	}
	for _, raw := range reviews {
		var r struct {
			User        ghUser `json:"user"`
			Body        string `json:"body"`
			State       string `json:"state"`
			SubmittedAt string `json:"submitted_at"`
			HTMLURL     string `json:"html_url"`
		}
		if err := json.Unmarshal(raw, &r); err != nil {
			return nil, err
		}
		if r.State == "PENDING" || r.SubmittedAt == "" {
			continue
		}
		if strings.TrimSpace(r.Body) == "" && r.State == "COMMENTED" {
			continue
		}
		items = append(items, PRTimelineItem{Kind: "review", Author: r.User.Login, Body: r.Body, CreatedAt: r.SubmittedAt, State: r.State, URL: r.HTMLURL})
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt < items[j].CreatedAt })
	return items, nil
}

// GetPRTimeline returns issue comments and reviews of a PR, oldest first.
func (a *App) GetPRTimeline(number int) ([]PRTimelineItem, error) {
	dir, slug, err := a.prRepo()
	if err != nil {
		return nil, err
	}
	comments, err := ghAPIPages(dir, fmt.Sprintf("repos/%s/issues/%d/comments", slug, number), 0)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments for PR #%d: %w", number, err)
	}
	reviews, err := ghAPIPages(dir, fmt.Sprintf("repos/%s/pulls/%d/reviews", slug, number), 0)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch reviews for PR #%d: %w", number, err)
	}
	return buildPRTimeline(comments, reviews)
}

// --- search -----------------------------------------------------------------

func normalizePRSearchState(state string) string {
	switch s := strings.ToLower(strings.TrimSpace(state)); s {
	case "open", "closed", "merged", "all":
		return s
	default:
		return "open"
	}
}

// parsePRNumberQuery recognises "123" and "#123".
func parsePRNumberQuery(q string) (int, bool) {
	n, err := strconv.Atoi(strings.TrimPrefix(strings.TrimSpace(q), "#"))
	return n, err == nil && n > 0
}

func parsePRSummaries(data []byte) ([]PRSummary, error) {
	var raw []ghPRViewPayload
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	out := make([]PRSummary, 0, len(raw))
	for _, p := range raw {
		out = append(out, PRSummary{
			Number: p.Number, Title: p.Title, Author: p.Author.Login, State: p.State,
			IsDraft: p.IsDraft, HeadRef: p.HeadRefName, UpdatedAt: p.UpdatedAt,
		})
	}
	return out, nil
}

// SearchPRs live-searches PRs in the current repo. A newer search cancels any in flight;
// superseded calls return context.Canceled.
func (a *App) SearchPRs(query string, state string, limit int) ([]PRSummary, error) {
	dir, slug, err := a.prRepo()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.prSearchMu.Lock()
	if a.prSearchCancel != nil {
		a.prSearchCancel()
	}
	a.prSearchCancel = cancel
	a.prSearchMu.Unlock()
	defer cancel()

	state = normalizePRSearchState(state)
	if limit <= 0 {
		limit = 30
	} else if limit > 100 {
		limit = 100
	}
	query = strings.TrimSpace(query)

	var exact *PRSummary
	if n, ok := parsePRNumberQuery(query); ok {
		if out, verr := ghPRViewJSON(ctx, dir, n); verr == nil {
			if d, perr := parsePRDetails(out); perr == nil {
				exact = &PRSummary{
					Number: d.Number, Title: d.Title, Author: d.Author, State: d.State,
					IsDraft: d.IsDraft, HeadRef: d.HeadRef, UpdatedAt: d.UpdatedAt,
				}
			}
		}
		if ctx.Err() != nil {
			return nil, context.Canceled
		}
	}

	out, err := ghSearchPRs(ctx, dir, slug, query, state, limit)
	if ctx.Err() != nil {
		return nil, context.Canceled
	}
	if err != nil {
		return nil, fmt.Errorf("gh pr list failed: %w", err)
	}
	list, err := parsePRSummaries(out)
	if err != nil {
		return nil, err
	}

	if exact != nil {
		merged := []PRSummary{*exact}
		for _, p := range list {
			if p.Number != exact.Number {
				merged = append(merged, p)
			}
		}
		list = merged
	}

	wts := prWorktreeMap(dir)
	for i := range list {
		list[i].WorktreePath = wts[list[i].Number]
	}
	return list, nil
}

// --- open locally -----------------------------------------------------------

// OpenPRLocally switches to the PR's worktree, creating it if needed, and returns its path.
func (a *App) OpenPRLocally(number int) (string, error) {
	dir, err := a.mainRepo()
	if err != nil {
		return "", err
	}
	wtPath := prWorktreeMap(dir)[number]
	if wtPath == "" {
		wtPath, err = createPRWorktree(&GitService{path: dir}, number, "", nil)
		if err != nil {
			return "", err
		}
	}
	if err := a.switchToProject(wtPath); err != nil {
		return "", err
	}
	a.emitWorkspaceIndex()
	return wtPath, nil
}
