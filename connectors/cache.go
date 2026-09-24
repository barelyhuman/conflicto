package connectors

import (
	"fmt"
	"time"
)

const reviewCacheTTL = 1 * time.Minute

type reviewCacheKey struct {
	repo   string
	number int
}

type reviewCacheStore struct {
	entries map[reviewCacheKey]ReviewSnapshot
}

func newReviewCacheStore() *reviewCacheStore {
	return &reviewCacheStore{entries: make(map[reviewCacheKey]ReviewSnapshot)}
}

func (s *reviewCacheStore) get(repo string, number int) (ReviewSnapshot, bool) {
	entry, ok := s.entries[reviewCacheKey{repo: repo, number: number}]
	return entry, ok
}

func (s *reviewCacheStore) set(repo string, snap ReviewSnapshot) {
	s.entries[reviewCacheKey{repo: repo, number: snap.Number}] = snap
}

func (s *reviewCacheStore) invalidate(repo string, number int) {
	if number == 0 {
		for key := range s.entries {
			if key.repo == repo {
				delete(s.entries, key)
			}
		}
		return
	}
	key := reviewCacheKey{repo: repo, number: number}
	if entry, ok := s.entries[key]; ok {
		entry.FetchedAt = time.Time{}
		s.entries[key] = entry
	}
}

func (s *reviewCacheStore) clearRepo(repo string) {
	for key := range s.entries {
		if key.repo == repo {
			delete(s.entries, key)
		}
	}
}

func loadReviewCacheEntry(
	store *reviewCacheStore,
	repo string,
	number int,
	reload func() error,
) (ReviewSnapshot, error) {
	entry, ok := store.get(repo, number)
	if ok && len(entry.Files) > 0 {
		return entry, nil
	}
	if err := reload(); err != nil {
		return ReviewSnapshot{}, err
	}
	entry, ok = store.get(repo, number)
	if !ok {
		return ReviewSnapshot{}, fmt.Errorf("review #%d not cached", number)
	}
	return entry, nil
}

func fileDiffFromReviewCache(snap ReviewSnapshot, number int, path string) (FileDiff, error) {
	for _, f := range snap.Files {
		if f.Path == path {
			patch := ""
			if f.Patch != "" {
				patch = normalizeGitHubPatch(f.Path, f.Status, f.Patch)
			}
			return FileDiff{Path: f.Path, Patch: patch}, nil
		}
	}
	return FileDiff{}, fmt.Errorf("file %s not found in review #%d", path, number)
}
