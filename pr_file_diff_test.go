package main

import (
	"errors"
	"strings"
	"testing"
)

func TestLoadPRCacheEntry_MissingKeyReloads(t *testing.T) {
	cache := map[int]PRCache{}
	reloads := 0
	got, err := loadPRCacheEntry(cache, 7, func() error {
		reloads++
		cache[7] = PRCache{Files: []PRFile{{Path: "a.go", Patch: "@@ -1 +1 @@\n-x\n+y\n"}}}
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

func TestLoadPRCacheEntry_EmptyFilesReloads(t *testing.T) {
	cache := map[int]PRCache{
		3: {Files: []PRFile{}},
	}
	reloads := 0
	_, err := loadPRCacheEntry(cache, 3, func() error {
		reloads++
		cache[3] = PRCache{Files: []PRFile{{Path: "b.go"}}}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if reloads != 1 {
		t.Fatalf("reloads = %d, want 1", reloads)
	}
}

func TestLoadPRCacheEntry_PopulatedSkipsReload(t *testing.T) {
	cache := map[int]PRCache{
		1: {Files: []PRFile{{Path: "c.go"}}},
	}
	reloads := 0
	got, err := loadPRCacheEntry(cache, 1, func() error {
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

func TestLoadPRCacheEntry_ReloadError(t *testing.T) {
	cache := map[int]PRCache{}
	want := errors.New("network down")
	_, err := loadPRCacheEntry(cache, 9, func() error { return want })
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
}

func TestLoadPRCacheEntry_ReloadOkButStillMissing(t *testing.T) {
	cache := map[int]PRCache{}
	_, err := loadPRCacheEntry(cache, 42, func() error { return nil })
	if err == nil || !strings.Contains(err.Error(), "PR #42 not cached") {
		t.Fatalf("err = %v, want not cached", err)
	}
}

func TestFileDiffFromPRCache_HitNormalizesPatch(t *testing.T) {
	hunk := "@@ -1,2 +1,2 @@\n line\n-old\n+new\n"
	cache := PRCache{Files: []PRFile{{
		Path:   "src/foo.js",
		Status: "M",
		Patch:  hunk,
	}}}
	diff, err := fileDiffFromPRCache(cache, 5, "src/foo.js")
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

func TestFileDiffFromPRCache_Miss(t *testing.T) {
	cache := PRCache{Files: []PRFile{{Path: "other.go"}}}
	_, err := fileDiffFromPRCache(cache, 8, "missing.go")
	if err == nil || !strings.Contains(err.Error(), "file missing.go not found in PR #8") {
		t.Fatalf("err = %v", err)
	}
}
