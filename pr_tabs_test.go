package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ghStub overrides gh access points for a test; unset ones keep safe defaults.
type ghStub struct {
	api    func(dir, endpoint string) ([]byte, error)
	view   func(ctx context.Context, dir string, n int) ([]byte, error)
	search func(ctx context.Context, dir, slug, q, state string, limit int) ([]byte, error)
	checks func(dir string, n int) ([]PRCheck, error)
}

func stubGH(t *testing.T, s *ghStub) {
	t.Helper()
	oSlug, oAPI, oView, oSearch, oChecks := ghRepoSlug, ghAPI, ghPRViewJSON, ghSearchPRs, ghPRChecks
	t.Cleanup(func() {
		ghRepoSlug, ghAPI, ghPRViewJSON, ghSearchPRs, ghPRChecks = oSlug, oAPI, oView, oSearch, oChecks
	})
	ghRepoSlug = func(string) (string, error) { return "o/r", nil }
	if s.api != nil {
		ghAPI = s.api
	}
	if s.view != nil {
		ghPRViewJSON = s.view
	}
	if s.search != nil {
		ghSearchPRs = s.search
	}
	ghPRChecks = func(string, int) ([]PRCheck, error) { return nil, errors.New("no checks") }
	if s.checks != nil {
		ghPRChecks = s.checks
	}
}

func appForRepo(path string) *App {
	a := NewApp()
	a.git = &GitService{path: path}
	return a
}

const viewJSON = `{"number":7,"title":"T","body":"B","state":"OPEN","isDraft":true,"url":"u",
"baseRefName":"main","headRefName":"feat","headRefOid":"abc","additions":3,"deletions":1,"changedFiles":2,
"reviewDecision":"APPROVED","createdAt":"c","updatedAt":"d","author":{"login":"al"}}`

func TestParsePRDetails(t *testing.T) {
	d, err := parsePRDetails([]byte(viewJSON))
	if err != nil {
		t.Fatal(err)
	}
	want := PRDetails{Number: 7, Title: "T", Body: "B", Author: "al", State: "OPEN", IsDraft: true, URL: "u",
		BaseRef: "main", HeadRef: "feat", HeadSHA: "abc", Additions: 3, Deletions: 1, ChangedFiles: 2,
		ReviewDecision: "APPROVED", CreatedAt: "c", UpdatedAt: "d"}
	if *d != want {
		t.Fatalf("got %+v", *d)
	}
	b, _ := json.Marshal(d)
	for _, k := range []string{`"headSha"`, `"baseRef"`, `"worktreePath"`, `"checks":null`, `"reviewDecision"`} {
		if !strings.Contains(string(b), k) {
			t.Errorf("json missing %s: %s", k, b)
		}
	}
}

func TestGetPRDetailsChecksAndWorktree(t *testing.T) {
	repo := setupRepoWithRemote(t)
	wt, err := createPRWorktree(&GitService{path: repo}, 1, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	stubGH(t, &ghStub{
		view: func(_ context.Context, _ string, n int) ([]byte, error) {
			return []byte(strings.Replace(viewJSON, `"number":7`, fmt.Sprintf(`"number":%d`, n), 1)), nil
		},
		checks: func(_ string, n int) ([]PRCheck, error) {
			return []PRCheck{{Name: "a", Bucket: "pass"}, {Name: "b", Bucket: "fail"}}, nil
		},
	})
	// Active project is the PR worktree; details must still resolve the main repo.
	a := appForRepo(wt)
	d, err := a.GetPRDetails(1)
	if err != nil {
		t.Fatal(err)
	}
	if d.WorktreePath != wt {
		t.Errorf("worktree = %q want %q", d.WorktreePath, wt)
	}
	if d.Checks == nil || d.Checks.Status != "failure" || d.Checks.Total != 2 {
		t.Errorf("checks = %+v", d.Checks)
	}
	d2, err := a.GetPRDetails(2)
	if err != nil || d2.WorktreePath != "" {
		t.Errorf("pr2 = %+v %v", d2, err)
	}

	// Worktree dir removed -> not reported.
	if err := os.RemoveAll(wt); err != nil {
		t.Fatal(err)
	}
	d3, err := appForRepo(repo).GetPRDetails(1)
	if err != nil || d3.WorktreePath != "" {
		t.Errorf("stale worktree reported: %+v %v", d3, err)
	}
}

func TestGetPRDetailsChecksFailureIsNil(t *testing.T) {
	repo := setupRepoWithRemote(t)
	stubGH(t, &ghStub{view: func(context.Context, string, int) ([]byte, error) { return []byte(viewJSON), nil }})
	d, err := appForRepo(repo).GetPRDetails(7)
	if err != nil || d.Checks != nil {
		t.Fatalf("d=%+v err=%v", d, err)
	}
}

func TestBuildPRTimeline(t *testing.T) {
	raw := func(ss ...string) []json.RawMessage {
		var out []json.RawMessage
		for _, s := range ss {
			out = append(out, json.RawMessage(s))
		}
		return out
	}
	comments := raw(
		`{"user":{"login":"a"},"body":"late","created_at":"2026-01-03T00:00:00Z","html_url":"c2"}`,
		`{"user":{"login":"b"},"body":"early","created_at":"2026-01-01T00:00:00Z","html_url":"c1"}`,
	)
	reviews := raw(
		`{"user":{"login":"r"},"body":"","state":"COMMENTED","submitted_at":"2026-01-02T00:00:00Z"}`,
		`{"user":{"login":"r"},"body":"","state":"APPROVED","submitted_at":"2026-01-02T12:00:00Z","html_url":"r1"}`,
		`{"user":{"login":"r"},"body":"hm","state":"COMMENTED","submitted_at":"2026-01-02T06:00:00Z","html_url":"r2"}`,
		`{"user":{"login":"r"},"body":"draft","state":"PENDING"}`,
	)
	got, err := buildPRTimeline(comments, reviews)
	if err != nil {
		t.Fatal(err)
	}
	var urls []string
	for _, it := range got {
		urls = append(urls, it.URL)
	}
	if strings.Join(urls, ",") != "c1,r2,r1,c2" {
		t.Fatalf("order = %v", urls)
	}
	if got[0].Kind != "comment" || got[0].State != "" || got[2].Kind != "review" || got[2].State != "APPROVED" {
		t.Errorf("kinds/states wrong: %+v", got)
	}
}

func TestGetPRTimelineEndpoints(t *testing.T) {
	repo := setupRepoWithRemote(t)
	var seen sync.Map
	stubGH(t, &ghStub{api: func(_, ep string) ([]byte, error) {
		seen.Store(strings.SplitN(ep, "?", 2)[0], true)
		if strings.Contains(ep, "/issues/") {
			return []byte(`[{"user":{"login":"a"},"body":"x","created_at":"1","html_url":"u"}]`), nil
		}
		return []byte(`[]`), nil
	}})
	items, err := appForRepo(repo).GetPRTimeline(5)
	if err != nil || len(items) != 1 {
		t.Fatalf("%v %v", items, err)
	}
	for _, ep := range []string{"repos/o/r/issues/5/comments", "repos/o/r/pulls/5/reviews"} {
		if _, ok := seen.Load(ep); !ok {
			t.Errorf("endpoint %s not called", ep)
		}
	}
}

func TestGetPRReviewCommentsShape(t *testing.T) {
	repo := setupRepoWithRemote(t)
	stubGH(t, &ghStub{api: func(_, ep string) ([]byte, error) {
		return []byte(`[{"path":"a.go","line":3,"side":"RIGHT","body":"hi","user":{"login":"z"},"html_url":"h"}]`), nil
	}})
	got, err := appForRepo(repo).GetPRReviewComments(1)
	if err != nil || len(got) != 1 || got[0]["path"] != "a.go" || got[0]["body"] != "hi" {
		t.Fatalf("%v %v", got, err)
	}
}

func TestParsePRNumberQuery(t *testing.T) {
	for q, want := range map[string]int{"12": 12, "#34": 34, " 5 ": 5} {
		if n, ok := parsePRNumberQuery(q); !ok || n != want {
			t.Errorf("%q -> %d %v", q, n, ok)
		}
	}
	for _, q := range []string{"", "fix 12", "#", "0", "abc"} {
		if _, ok := parsePRNumberQuery(q); ok {
			t.Errorf("%q should not be numeric", q)
		}
	}
}

func TestSearchPRsNumericAndWorktree(t *testing.T) {
	repo := setupRepoWithRemote(t)
	wt, err := createPRWorktree(&GitService{path: repo}, 1, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	var gotState, gotQuery string
	var gotLimit int
	stubGH(t, &ghStub{
		view: func(_ context.Context, _ string, n int) ([]byte, error) {
			if n != 1 {
				return nil, errors.New("not found")
			}
			return []byte(strings.Replace(viewJSON, `"number":7`, `"number":1`, 1)), nil
		},
		search: func(_ context.Context, _, slug, q, state string, limit int) ([]byte, error) {
			gotState, gotQuery, gotLimit = state, q, limit
			if slug != "o/r" {
				t.Errorf("slug %q", slug)
			}
			return []byte(`[{"number":9,"title":"Nine","author":{"login":"x"},"state":"CLOSED","isDraft":false,"headRefName":"n","updatedAt":"u"},
{"number":1,"title":"dup","author":{"login":"y"},"state":"OPEN","headRefName":"o","updatedAt":"u"}]`), nil
		},
	})
	a := appForRepo(repo)
	got, err := a.SearchPRs("#1", "bogus", 0)
	if err != nil {
		t.Fatal(err)
	}
	if gotState != "open" || gotQuery != "#1" || gotLimit != 30 {
		t.Errorf("search args %q %q %d", gotState, gotQuery, gotLimit)
	}
	if len(got) != 2 || got[0].Number != 1 || got[0].Title != "T" || got[1].Number != 9 {
		t.Fatalf("got %+v", got)
	}
	if got[0].WorktreePath != wt || got[1].WorktreePath != "" {
		t.Errorf("worktree fill: %+v", got)
	}
	if got[0].Author != "al" || got[1].State != "CLOSED" {
		t.Errorf("fields: %+v", got)
	}

	// Empty query -> no search term; requested state passes through; limit capped.
	if _, err := a.SearchPRs("", "Merged", 500); err != nil {
		t.Fatal(err)
	}
	if gotQuery != "" || gotState != "merged" || gotLimit != 100 {
		t.Errorf("empty-query args %q %q %d", gotQuery, gotState, gotLimit)
	}
	if a.git.path != repo {
		t.Error("search must not switch project")
	}
}

func TestSearchPRsCancelsPrevious(t *testing.T) {
	repo := setupRepoWithRemote(t)
	started := make(chan struct{})
	stubGH(t, &ghStub{search: func(ctx context.Context, _, _, q, _ string, _ int) ([]byte, error) {
		if q == "slow" {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		}
		return []byte(`[]`), nil
	}})
	a := appForRepo(repo)
	errc := make(chan error, 1)
	go func() {
		_, err := a.SearchPRs("slow", "open", 10)
		errc <- err
	}()
	<-started
	if _, err := a.SearchPRs("fast", "open", 10); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-errc:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("err = %v, want context.Canceled", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("slow search not canceled")
	}
}

func filesAPI(headSHA string, calls *atomic.Int32) func(string, string) ([]byte, error) {
	return func(_, ep string) ([]byte, error) {
		calls.Add(1)
		if strings.Contains(ep, "/files") {
			return []byte(`[{"filename":"a.go","status":"modified","additions":1,"deletions":1,"patch":"@@ -1 +1 @@\n-a\n+b\n"}]`), nil
		}
		return []byte(fmt.Sprintf(`{"head":{"sha":%q}}`, headSHA)), nil
	}
}

func TestPRFilesCacheTTLAndHeadSHA(t *testing.T) {
	repo := setupRepoWithRemote(t)
	var calls atomic.Int32
	stubGH(t, &ghStub{api: filesAPI("sha1", &calls)})
	a := appForRepo(repo)

	files, err := a.GetPRFilesList(3)
	if err != nil || len(files) != 1 || files[0].Status != "M" || files[0].Patch != "" {
		t.Fatalf("%+v %v", files, err)
	}
	first := calls.Load()
	if _, err := a.GetPRFilesList(3); err != nil || calls.Load() != first {
		t.Fatalf("fresh cache should not call gh (calls %d -> %d)", first, calls.Load())
	}
	diff, err := a.GetPRFilePatch(3, "a.go")
	if err != nil || !strings.HasPrefix(diff.Patch, "diff --git a/a.go b/a.go\n") {
		t.Fatalf("%+v %v", diff, err)
	}
	if _, err := a.GetPRFilePatch(3, "nope"); err == nil {
		t.Error("expected missing-file error")
	}

	// Stale + same head SHA: only the head lookup, no file pages.
	a.invalidatePRCache()
	before := calls.Load()
	if _, err := a.GetPRFilesList(3); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != before+1 {
		t.Errorf("same-sha revalidation made %d calls", calls.Load()-before)
	}

	// Stale + new head SHA: refetch files.
	a.invalidatePRCache()
	stubGH(t, &ghStub{api: filesAPI("sha2", &calls)})
	before = calls.Load()
	if _, err := a.GetPRFilesList(3); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != before+2 {
		t.Errorf("new-sha refetch made %d calls", calls.Load()-before)
	}
	if c, _ := a.cachedPR(3); c.HeadSHA != "sha2" {
		t.Errorf("head sha = %q", c.HeadSHA)
	}
}

func TestPRCacheKeyedByRepo(t *testing.T) {
	repoA := setupRepoWithRemote(t)
	repoB := setupRepoWithRemote(t)
	var calls atomic.Int32
	stubGH(t, &ghStub{api: filesAPI("s", &calls)})
	a := appForRepo(repoA)
	if _, err := a.GetPRFilesList(1); err != nil {
		t.Fatal(err)
	}
	if _, ok := a.cachedPR(1); !ok {
		t.Fatal("repo A should be cached")
	}
	a.git = &GitService{path: repoB}
	if _, ok := a.cachedPR(1); ok {
		t.Fatal("repo B must not see repo A's PR #1")
	}
	// A linked worktree of repo A shares repo A's cache.
	wt, err := createPRWorktree(&GitService{path: repoA}, 1, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	a.git = &GitService{path: wt}
	if _, ok := a.cachedPR(1); !ok {
		t.Fatal("worktree should share main repo cache")
	}
}

func TestGetPRFilesListConcurrent(t *testing.T) {
	repo := setupRepoWithRemote(t)
	stubGH(t, &ghStub{api: func(dir, ep string) ([]byte, error) {
		n := 0
		_, _ = fmt.Sscanf(ep[strings.Index(ep, "/pulls/")+len("/pulls/"):], "%d", &n)
		if strings.Contains(ep, "/files") {
			return []byte(fmt.Sprintf(`[{"filename":"f%d.go","status":"added","patch":"@@ -0,0 +1 @@\n+x\n"}]`, n)), nil
		}
		return []byte(fmt.Sprintf(`{"head":{"sha":"sha%d"}}`, n)), nil
	}})
	a := appForRepo(repo)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		n := 10 + i%2
		wg.Add(2)
		go func() {
			defer wg.Done()
			files, err := a.GetPRFilesList(n)
			if err != nil || len(files) != 1 || files[0].Path != fmt.Sprintf("f%d.go", n) {
				t.Errorf("pr %d: %+v %v", n, files, err)
			}
		}()
		go func() {
			defer wg.Done()
			d, err := a.GetPRFilePatch(n, fmt.Sprintf("f%d.go", n))
			if err != nil || !strings.Contains(d.Patch, "+x") {
				t.Errorf("patch %d: %+v %v", n, d, err)
			}
		}()
	}
	wg.Wait()
	for _, n := range []int{10, 11} {
		if c, ok := a.cachedPR(n); !ok || c.HeadSHA != fmt.Sprintf("sha%d", n) {
			t.Errorf("cache %d = %+v", n, c)
		}
	}
}

func TestOpenPRLocally(t *testing.T) {
	repo := setupRepoWithRemote(t)
	a := appForRepo(repo)
	path, err := a.OpenPRLocally(1)
	if err != nil {
		t.Fatal(err)
	}
	if a.git.path != path || filepath.Dir(path) == repo {
		t.Fatalf("not switched: %q vs %q", a.git.path, path)
	}
	// Second call (now from inside the worktree) reuses it.
	path2, err := a.OpenPRLocally(1)
	if err != nil || path2 != path {
		t.Fatalf("reuse: %q %v want %q", path2, err, path)
	}
	// Unknown PR surfaces the error.
	if _, err := a.OpenPRLocally(99); err == nil {
		t.Fatal("expected error for missing PR ref")
	}
}
