package connectors

import (
	"errors"
	"strings"
	"testing"
)

func TestLoadReviewCacheEntry_MissingKeyReloads(t *testing.T) {
	store := newReviewCacheStore()
	repo := "/tmp/repo"
	reloads := 0
	got, err := loadReviewCacheEntry(store, repo, 7, func() error {
		reloads++
		store.set(repo, ReviewSnapshot{
			Number: 7,
			Files:  []ReviewFile{{Path: "a.go", Patch: "@@ -1 +1 @@\n-x\n+y\n"}},
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloads != 1 {
		t.Fatalf("reloads = %d, want 1", reloads)
	}
	if len(got.Files) != 1 || got.Files[0].Path != "a.go" {
		t.Fatalf("unexpected entry: %+v", got)
	}
}

func TestLoadReviewCacheEntry_EmptyFilesReloads(t *testing.T) {
	store := newReviewCacheStore()
	repo := "/tmp/repo"
	store.set(repo, ReviewSnapshot{Number: 3, Files: []ReviewFile{}})
	reloads := 0
	_, err := loadReviewCacheEntry(store, repo, 3, func() error {
		reloads++
		store.set(repo, ReviewSnapshot{Number: 3, Files: []ReviewFile{{Path: "b.go"}}})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloads != 1 {
		t.Fatalf("reloads = %d, want 1", reloads)
	}
}

func TestLoadReviewCacheEntry_PopulatedSkipsReload(t *testing.T) {
	store := newReviewCacheStore()
	repo := "/tmp/repo"
	store.set(repo, ReviewSnapshot{Number: 1, Files: []ReviewFile{{Path: "c.go"}}})
	reloads := 0
	got, err := loadReviewCacheEntry(store, repo, 1, func() error {
		reloads++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloads != 0 {
		t.Fatalf("reloads = %d, want 0", reloads)
	}
	if got.Files[0].Path != "c.go" {
		t.Fatalf("unexpected entry: %+v", got)
	}
}

func TestLoadReviewCacheEntry_ReloadError(t *testing.T) {
	store := newReviewCacheStore()
	want := errors.New("network down")
	_, err := loadReviewCacheEntry(store, "/tmp/repo", 9, func() error { return want })
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
}

func TestLoadReviewCacheEntry_ReloadOkButStillMissing(t *testing.T) {
	store := newReviewCacheStore()
	_, err := loadReviewCacheEntry(store, "/tmp/repo", 42, func() error { return nil })
	if err == nil || !strings.Contains(err.Error(), "review #42 not cached") {
		t.Fatalf("err = %v, want not cached", err)
	}
}

func TestFileDiffFromReviewCache_HitNormalizesPatch(t *testing.T) {
	hunk := "@@ -1,2 +1,2 @@\n line\n-old\n+new\n"
	snap := ReviewSnapshot{Number: 5, Files: []ReviewFile{{
		Path:   "src/foo.js",
		Status: "M",
		Patch:  hunk,
	}}}
	diff, err := fileDiffFromReviewCache(snap, 5, "src/foo.js")
	if err != nil {
		t.Fatal(err)
	}
	if diff.Path != "src/foo.js" {
		t.Fatalf("path = %q", diff.Path)
	}
	wantPrefix := "diff --git a/src/foo.js b/src/foo.js\n"
	if !strings.HasPrefix(diff.Patch, wantPrefix) {
		t.Fatalf("patch not normalized:\n%s", diff.Patch)
	}
	if !strings.Contains(diff.Patch, hunk) {
		t.Fatalf("missing hunk:\n%s", diff.Patch)
	}
}

func TestFileDiffFromReviewCache_Miss(t *testing.T) {
	snap := ReviewSnapshot{Files: []ReviewFile{{Path: "other.go"}}}
	_, err := fileDiffFromReviewCache(snap, 8, "missing.go")
	if err == nil || !strings.Contains(err.Error(), "file missing.go not found in review #8") {
		t.Fatalf("err = %v", err)
	}
}
