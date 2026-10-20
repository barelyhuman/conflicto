package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// WorkspaceEntry is one jumpable thing: a repo, a worktree, or a GitHub PR.
type WorkspaceEntry struct {
	Kind        string `json:"kind"`        // "repo" | "worktree" | "pr"
	ID          string `json:"id"`          // stable: "repo:<path>", "wt:<path>", "pr:<repoPath>#<n>"
	Title       string `json:"title"`       // repo name / PR title / worktree branch
	Subtitle    string `json:"subtitle"`    // e.g. "conflicto · #36 · @author"
	RepoPath    string `json:"repoPath"`    // main repo path
	RepoName    string `json:"repoName"`    // main repo directory name
	Path        string `json:"path"`        // local path (repo/worktree); "" for remote-only PR
	PRNumber    int    `json:"prNumber"`    // 0 if none
	PRState     string `json:"prState"`     // "OPEN" | "MERGED" | "CLOSED" | ""
	Branch      string `json:"branch"`      // branch name
	HasWorktree bool   `json:"hasWorktree"` // for PR entries
	Stale       bool   `json:"stale"`       // worktree whose PR is merged/closed
	Active      bool   `json:"active"`      // currently opened workspace
	UpdatedAt   string `json:"updatedAt"`   // RFC3339, for sorting
}

const (
	workspaceIndexTTL   = 2 * time.Minute
	workspaceConcurrent = 3
	prConfigKey         = "conflicto-pr"
)

// cachedPR is the persisted subset of a GitHub PR.
type cachedPR struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	HeadRef   string `json:"headRefName"`
	State     string `json:"state"`
	Author    string `json:"author"`
	UpdatedAt string `json:"updatedAt"`
}

// repoPRCache holds cached GitHub data for one repo.
type repoPRCache struct {
	Open   []cachedPR     `json:"open"`
	States map[int]string `json:"states"` // PR number -> state, for PRs with worktrees that aren't open
}

type workspaceCache struct {
	FetchedAt time.Time              `json:"fetchedAt"`
	Repos     map[string]repoPRCache `json:"repos"`
}

// repoSnapshot is the local (disk/git) view of one repo.
type repoSnapshot struct {
	Path      string
	Name      string
	OpenedAt  time.Time
	Branch    string
	Worktrees []WorktreeInfo // includes main (IsMain)
	WTPR      map[string]int // branch -> PR number (from git config)
	ModTimes  map[string]time.Time
}

// gh access points, replaceable in tests.
var (
	ghListOpenPRs = func(repoPath string) ([]cachedPR, error) {
		cmd := appCommand("gh", "pr", "list", "--state", "open", "--limit", "50",
			"--json", "number,title,headRefName,state,author,updatedAt")
		cmd.Dir = repoPath
		out, err := cmd.Output()
		if err != nil {
			return nil, err
		}
		var raw []struct {
			Number      int    `json:"number"`
			Title       string `json:"title"`
			HeadRefName string `json:"headRefName"`
			State       string `json:"state"`
			UpdatedAt   string `json:"updatedAt"`
			Author      struct {
				Login string `json:"login"`
			} `json:"author"`
		}
		if err := json.Unmarshal(out, &raw); err != nil {
			return nil, err
		}
		prs := make([]cachedPR, 0, len(raw))
		for _, r := range raw {
			prs = append(prs, cachedPR{r.Number, r.Title, r.HeadRefName, r.State, r.Author.Login, r.UpdatedAt})
		}
		return prs, nil
	}
	ghPRState = func(repoPath string, number int) (string, error) {
		cmd := appCommand("gh", "pr", "view", strconv.Itoa(number), "--json", "state", "--jq", ".state")
		cmd.Dir = repoPath
		out, err := cmd.Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
)

func workspaceIndexFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	dir := filepath.Join(home, ".config", "conflicto")
	_ = os.MkdirAll(dir, 0o755)
	return filepath.Join(dir, "workspace-index.json")
}

// workspaceIndex owns the cached GitHub data and refresh state.
type workspaceIndex struct {
	mu         sync.Mutex
	cache      workspaceCache
	refreshing bool
	file       string
}

func newWorkspaceIndex(file string) *workspaceIndex {
	wi := &workspaceIndex{file: file}
	wi.cache.Repos = map[string]repoPRCache{}
	if data, err := os.ReadFile(file); err == nil {
		var c workspaceCache
		if json.Unmarshal(data, &c) == nil && c.Repos != nil {
			wi.cache = c
		}
	}
	return wi
}

// snapshotCache returns the cache; the Repos map is replaced (never mutated) on update.
func (wi *workspaceIndex) snapshotCache() workspaceCache {
	wi.mu.Lock()
	defer wi.mu.Unlock()
	return wi.cache
}

func (wi *workspaceIndex) save() {
	wi.mu.Lock()
	data, err := json.MarshalIndent(wi.cache, "", "  ")
	wi.mu.Unlock()
	if err == nil && wi.file != "" {
		_ = os.WriteFile(wi.file, data, 0o644)
	}
}

// --- pure helpers -----------------------------------------------------------

func repoEntryID(path string) string     { return "repo:" + path }
func worktreeEntryID(path string) string { return "wt:" + path }
func prEntryID(repoPath string, n int) string {
	return fmt.Sprintf("pr:%s#%d", repoPath, n)
}

// parsePREntryID splits "pr:<repoPath>#<n>".
func parsePREntryID(id string) (string, int, bool) {
	rest, ok := strings.CutPrefix(id, "pr:")
	if !ok {
		return "", 0, false
	}
	i := strings.LastIndex(rest, "#")
	if i < 0 {
		return "", 0, false
	}
	n, err := strconv.Atoi(rest[i+1:])
	if err != nil || n <= 0 {
		return "", 0, false
	}
	return rest[:i], n, true
}

// prStateFor resolves a PR's state: the open list wins, then the persisted states.
func prStateFor(rc repoPRCache, n int) string {
	for _, pr := range rc.Open {
		if pr.Number == n {
			return "OPEN"
		}
	}
	return rc.States[n]
}

func isStaleState(state string) bool { return state == "MERGED" || state == "CLOSED" }

// openableWorktreeForPR is worktreeForPR restricted to worktrees whose directory still
// exists. A worktree deleted without `git worktree prune` stays listed, and reusing it
// would make every open of the PR fail.
func (s repoSnapshot) openableWorktreeForPR(n int) (string, bool) {
	for _, wt := range s.Worktrees {
		if wt.IsMain || wt.Branch == "" || s.WTPR[wt.Branch] != n {
			continue
		}
		if info, err := os.Stat(wt.Path); err == nil && info.IsDir() {
			return wt.Path, true
		}
	}
	return "", false
}

// worktreeForPR returns the worktree path mapped to PR n, if any.
func (s repoSnapshot) worktreeForPR(n int) (string, bool) {
	for _, wt := range s.Worktrees {
		if wt.IsMain || wt.Branch == "" {
			continue
		}
		if s.WTPR[wt.Branch] == n {
			return wt.Path, true
		}
	}
	return "", false
}

func fmtTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// buildWorkspaceEntries is the pure assembly of repo/worktree/PR entries.
func buildWorkspaceEntries(snaps []repoSnapshot, cache workspaceCache, activePath string) []WorkspaceEntry {
	entries := []WorkspaceEntry{}
	for _, s := range snaps {
		rc := cache.Repos[s.Path]
		entries = append(entries, WorkspaceEntry{
			Kind: "repo", ID: repoEntryID(s.Path), Title: s.Name,
			Subtitle: s.Branch, RepoPath: s.Path, RepoName: s.Name, Path: s.Path,
			Branch: s.Branch, Active: s.Path == activePath, UpdatedAt: fmtTime(s.OpenedAt),
		})

		prByNum := map[int]cachedPR{}
		for _, pr := range rc.Open {
			prByNum[pr.Number] = pr
		}

		for _, wt := range s.Worktrees {
			if wt.IsMain {
				continue
			}
			e := WorkspaceEntry{
				Kind: "worktree", ID: worktreeEntryID(wt.Path), Title: wt.Branch,
				RepoPath: s.Path, RepoName: s.Name, Path: wt.Path, Branch: wt.Branch,
				Active: wt.Path == activePath, UpdatedAt: fmtTime(s.ModTimes[wt.Path]),
			}
			if e.Title == "" {
				e.Title = filepath.Base(wt.Path)
			}
			e.Subtitle = s.Name + " · " + e.Title
			if n := s.WTPR[wt.Branch]; n > 0 && wt.Branch != "" {
				e.PRNumber = n
				e.PRState = prStateFor(rc, n)
				e.Stale = isStaleState(e.PRState)
				e.Subtitle = fmt.Sprintf("%s · #%d", s.Name, n)
				// An open PR's entry already carries this worktree's path.
				if _, ok := prByNum[n]; ok {
					continue
				}
				if e.Stale {
					e.Subtitle += " · " + strings.ToLower(e.PRState)
				}
			}
			entries = append(entries, e)
		}

		for _, pr := range rc.Open {
			wtPath, has := s.worktreeForPR(pr.Number)
			entries = append(entries, WorkspaceEntry{
				Kind: "pr", ID: prEntryID(s.Path, pr.Number), Title: pr.Title,
				Subtitle: fmt.Sprintf("%s · #%d · @%s", s.Name, pr.Number, pr.Author),
				RepoPath: s.Path, RepoName: s.Name, Path: wtPath,
				PRNumber: pr.Number, PRState: "OPEN", Branch: pr.HeadRef,
				HasWorktree: has, Active: has && wtPath == activePath, UpdatedAt: pr.UpdatedAt,
			})
		}
	}
	return entries
}

// --- local (git/disk) snapshot ---------------------------------------------

// gitConfigPRMap reads branch.<b>.conflicto-pr entries from a repo's config.
func gitConfigPRMap(gs *GitService) map[string]int {
	out := map[string]int{}
	b, err := gs.runGit("config", "--get-regexp", `^branch\..*\.`+prConfigKey+`$`)
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(b), "\n") {
		key, val, ok := strings.Cut(strings.TrimSpace(line), " ")
		if !ok {
			continue
		}
		branch := strings.TrimSuffix(strings.TrimPrefix(key, "branch."), "."+prConfigKey)
		if n, err := strconv.Atoi(strings.TrimSpace(val)); err == nil && n > 0 {
			out[branch] = n
		}
	}
	return out
}

// snapshotRepos resolves recents to distinct main repos with their worktrees.
// Recents may contain worktree paths; those collapse into their main repo.
func snapshotRepos(recents []RecentProject) []repoSnapshot {
	var snaps []repoSnapshot
	seen := map[string]bool{}
	for _, r := range recents {
		if info, err := os.Stat(r.Path); err != nil || !info.IsDir() {
			continue
		}
		gs := &GitService{path: r.Path}
		main, err := gs.MainRepoPath()
		if err != nil || seen[main] {
			continue
		}
		seen[main] = true
		mgs := &GitService{path: main}
		wts, err := mgs.ListWorktrees()
		if err != nil {
			continue
		}
		s := repoSnapshot{
			Path: main, Name: filepath.Base(main), OpenedAt: r.OpenedAt,
			Worktrees: wts, WTPR: gitConfigPRMap(mgs), ModTimes: map[string]time.Time{},
		}
		for _, wt := range wts {
			if wt.IsMain {
				s.Branch = wt.Branch
			} else if fi, err := os.Stat(wt.Path); err == nil {
				s.ModTimes[wt.Path] = fi.ModTime()
			}
		}
		snaps = append(snaps, s)
	}
	return snaps
}

// --- refresh ----------------------------------------------------------------

// refresh fetches GitHub data for the given repos (concurrency-limited), then persists.
// Repos whose gh calls fail keep their previously cached data.
func (wi *workspaceIndex) refresh(snaps []repoSnapshot) {
	defer func() {
		wi.mu.Lock()
		wi.refreshing = false
		wi.mu.Unlock()
	}()

	type result struct {
		path string
		rc   repoPRCache
		ok   bool
	}
	results := make([]result, len(snaps))
	sem := make(chan struct{}, workspaceConcurrent)
	var wg sync.WaitGroup
	old := wi.snapshotCache()
	for i, s := range snaps {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			open, err := ghListOpenPRs(s.Path)
			if err != nil {
				return
			}
			rc := repoPRCache{Open: open, States: map[int]string{}}
			openSet := map[int]bool{}
			for _, pr := range open {
				openSet[pr.Number] = true
			}
			for _, n := range s.WTPR {
				if openSet[n] {
					continue
				}
				if st, err := ghPRState(s.Path, n); err == nil && st != "" {
					rc.States[n] = st
				} else if prev, ok := old.Repos[s.Path].States[n]; ok {
					rc.States[n] = prev
				}
			}
			results[i] = result{s.Path, rc, true}
		}()
	}
	wg.Wait()

	wi.mu.Lock()
	repos := make(map[string]repoPRCache, len(wi.cache.Repos))
	for k, v := range wi.cache.Repos {
		repos[k] = v
	}
	for _, r := range results {
		if r.ok {
			repos[r.path] = r.rc
		}
	}
	wi.cache.Repos = repos
	// Stamp even on failure so a missing/unauthenticated gh isn't retried on every call.
	wi.cache.FetchedAt = time.Now()
	wi.mu.Unlock()
	wi.save()
}

// --- App integration --------------------------------------------------------

func (a *App) workspaceIdx() *workspaceIndex {
	a.wsInitOnce.Do(func() {
		if a.wsIndex == nil {
			a.wsIndex = newWorkspaceIndex(workspaceIndexFilePath())
		}
	})
	return a.wsIndex
}

func (a *App) activePath() string {
	if a.git != nil && a.git.IsRepo() {
		return a.git.path
	}
	return ""
}

func (a *App) currentRecents() []RecentProject {
	if a.recents == nil {
		return nil
	}
	return a.recents.List()
}

func (a *App) buildWorkspaceIndex() []WorkspaceEntry {
	snaps := snapshotRepos(a.currentRecents())
	entries := buildWorkspaceEntries(snaps, a.workspaceIdx().snapshotCache(), a.activePath())
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].UpdatedAt > entries[j].UpdatedAt })
	return entries
}

// GetWorkspaceIndex returns the cached index instantly and refreshes in the background when stale.
func (a *App) GetWorkspaceIndex() ([]WorkspaceEntry, error) {
	entries := a.buildWorkspaceIndex()
	if time.Since(a.workspaceIdx().snapshotCache().FetchedAt) > workspaceIndexTTL {
		a.startWorkspaceRefresh()
	}
	return entries, nil
}

// RefreshWorkspaceIndex forces a background refresh.
func (a *App) RefreshWorkspaceIndex() error {
	a.startWorkspaceRefresh()
	return nil
}

// emitWorkspaceIndex re-emits the index from local data plus cache (no gh calls).
func (a *App) emitWorkspaceIndex() {
	if a.ctx == nil {
		return
	}
	go a.EmitEvent("workspace:index-updated", a.buildWorkspaceIndex())
}

// startWorkspaceRefresh runs one background refresh; concurrent calls are deduplicated.
func (a *App) startWorkspaceRefresh() {
	wi := a.workspaceIdx()
	wi.mu.Lock()
	if wi.refreshing {
		wi.mu.Unlock()
		return
	}
	wi.refreshing = true
	wi.mu.Unlock()

	snaps := snapshotRepos(a.currentRecents())
	go func() {
		wi.refresh(snaps)
		if a.ctx != nil {
			a.EmitEvent("workspace:index-updated", a.buildWorkspaceIndex())
		}
	}()
}

// OpenWorkspace switches to a repo/worktree, or opens (creating if needed) a PR's worktree.
func (a *App) OpenWorkspace(id string) error {
	switch {
	case strings.HasPrefix(id, "repo:"), strings.HasPrefix(id, "wt:"):
		_, path, _ := strings.Cut(id, ":")
		if info, err := os.Stat(path); err != nil || !info.IsDir() {
			return fmt.Errorf("workspace path no longer exists: %s", path)
		}
		if err := a.switchToProject(path); err != nil {
			return err
		}
	case strings.HasPrefix(id, "pr:"):
		repoPath, n, ok := parsePREntryID(id)
		if !ok {
			return fmt.Errorf("invalid workspace id: %s", id)
		}
		var wtPath string
		if snaps := snapshotRepos([]RecentProject{{Path: repoPath}}); len(snaps) == 1 {
			wtPath, _ = snaps[0].openableWorktreeForPR(n)
		}
		if wtPath == "" {
			var err error
			wtPath, err = createPRWorktree(&GitService{path: repoPath}, n, "", func(title string, err error) {
				a.EmitEvent("error", map[string]string{"title": title, "message": err.Error()})
			})
			if err != nil {
				return err
			}
		}
		if err := a.switchToProject(wtPath); err != nil {
			return err
		}
	default:
		return fmt.Errorf("invalid workspace id: %s", id)
	}
	a.emitWorkspaceIndex()
	return nil
}

// createPRWorktree fetches a PR head and adds a worktree for it in gs's repo, recording
// the PR number in git config (branch.<b>.conflicto-pr) so the mapping survives restarts.
func createPRWorktree(gs *GitService, number int, hash string, onErr func(title string, err error)) (string, error) {
	fail := func(title string, err error) (string, error) {
		if onErr != nil {
			onErr(title, err)
		}
		return "", err
	}

	var worktreePath string
	var err error
	if hash != "" {
		worktreePath, err = gs.WorktreePathForHash(hash)
		if err != nil {
			return fail("Worktree Error", err)
		}
		baseDir, baseErr := gs.WorktreeBaseDir()
		if baseErr != nil {
			return "", baseErr
		}
		if mkErr := os.MkdirAll(baseDir, 0o755); mkErr != nil {
			return fail("Worktree Error", mkErr)
		}
	} else {
		worktreePath, hash, err = gs.NewWorktreePath()
		if err != nil {
			return fail("Worktree Error", err)
		}
	}

	localBranch := fmt.Sprintf("pr-wt-%s", hash)
	if err := gs.FetchPRHead(number, localBranch); err != nil {
		return fail("PR Fetch Error", err)
	}
	if err := gs.AddWorktree(worktreePath, localBranch); err != nil {
		return fail("Worktree Error", err)
	}
	// Best effort: the mapping only powers the index.
	if mainRepo, err := gs.MainRepoPath(); err == nil {
		cmd := appCommand("git", "config", fmt.Sprintf("branch.%s.%s", localBranch, prConfigKey), strconv.Itoa(number))
		cmd.Dir = mainRepo
		_ = cmd.Run()
	}
	return worktreePath, nil
}
