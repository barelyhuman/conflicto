package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ReviewDraft is a pending (unsubmitted) review comment.
type ReviewDraft struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	Body      string `json:"body"`
	Line      int    `json:"line"`
	Side      string `json:"side"` // LEFT | RIGHT
	StartLine int    `json:"startLine,omitempty"`
	StartSide string `json:"startSide,omitempty"`
	// HeadSHA is the PR head the draft was written against (for outdated detection).
	HeadSHA   string `json:"headSHA,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
}

// ReviewFile is a PR file with its patch (used by the frontend for line validation).
type ReviewFile struct {
	Path  string `json:"path"`
	Patch string `json:"patch"`
}

// ReviewState is returned by GetReviewState.
type ReviewState struct {
	Drafts  []ReviewDraft `json:"drafts"`
	HeadSHA string        `json:"headSHA"`
	Files   []ReviewFile  `json:"files"`
}

// reviewDraftStore persists drafts as JSON keyed by "<mainRepoPath>#<prNumber>".
type reviewDraftStore struct {
	mu   sync.Mutex
	path string
}

func reviewDraftsFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}

	configDir := filepath.Join(home, ".config", "conflicto")
	os.MkdirAll(configDir, 0755)

	return filepath.Join(configDir, "review_drafts.json")
}

func newReviewDraftStore(path string) *reviewDraftStore {
	return &reviewDraftStore{path: path}
}

func reviewKey(repoPath string, number int) string {
	return fmt.Sprintf("%s#%d", repoPath, number)
}

func (s *reviewDraftStore) load() map[string][]ReviewDraft {
	all := map[string][]ReviewDraft{}
	data, err := os.ReadFile(s.path)
	if err != nil {
		return all
	}
	if err := json.Unmarshal(data, &all); err != nil || all == nil {
		return map[string][]ReviewDraft{}
	}

	return all
}

func (s *reviewDraftStore) write(all map[string][]ReviewDraft) error {
	data, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}

	return os.Rename(tmp, s.path)
}

// List returns drafts for a key (never nil).
func (s *reviewDraftStore) List(key string) []ReviewDraft {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.load()[key]
	if out == nil {
		return []ReviewDraft{}
	}

	return out
}

func newDraftID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)

	return hex.EncodeToString(b)
}

// Save inserts or replaces (by ID) a draft and returns the stored value.
func (s *reviewDraftStore) Save(key string, d ReviewDraft) (ReviewDraft, error) {
	if strings.TrimSpace(d.Path) == "" || d.Line <= 0 {
		return d, fmt.Errorf("draft needs a path and line")
	}
	if strings.TrimSpace(d.Body) == "" {
		return d, fmt.Errorf("draft body is empty")
	}
	if d.Side != "LEFT" {
		d.Side = "RIGHT"
	}
	if d.StartLine > 0 {
		if d.StartSide != "LEFT" {
			d.StartSide = "RIGHT"
		}
	} else {
		d.StartLine, d.StartSide = 0, ""
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	all := s.load()
	list := all[key]
	if d.ID == "" {
		d.ID = newDraftID()
	}
	replaced := false
	for i := range list {
		if list[i].ID == d.ID {
			if d.CreatedAt == "" {
				d.CreatedAt = list[i].CreatedAt
			}
			list[i] = d
			replaced = true
			break
		}
	}
	if d.CreatedAt == "" {
		d.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if !replaced {
		list = append(list, d)
	}
	all[key] = list

	return d, s.write(all)
}

// Delete removes one draft by ID.
func (s *reviewDraftStore) Delete(key, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all := s.load()
	list := all[key]
	kept := make([]ReviewDraft, 0, len(list))
	for _, d := range list {
		if d.ID != id {
			kept = append(kept, d)
		}
	}
	if len(kept) == 0 {
		delete(all, key)
	} else {
		all[key] = kept
	}

	return s.write(all)
}

// Clear removes every draft for a key.
func (s *reviewDraftStore) Clear(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all := s.load()
	delete(all, key)

	return s.write(all)
}

var validReviewEvents = map[string]bool{"COMMENT": true, "APPROVE": true, "REQUEST_CHANGES": true}

// buildReviewPayload builds the body for POST /repos/{o}/{r}/pulls/{n}/reviews.
func buildReviewPayload(headSHA, event, body string, drafts []ReviewDraft) (map[string]interface{}, error) {
	if !validReviewEvents[event] {
		return nil, fmt.Errorf("invalid review event %q", event)
	}
	if len(drafts) == 0 && strings.TrimSpace(body) == "" && event != "APPROVE" {
		return nil, fmt.Errorf("a review needs a summary or at least one pending comment")
	}

	comments := make([]map[string]interface{}, 0, len(drafts))
	for _, d := range drafts {
		c := map[string]interface{}{
			"path": d.Path,
			"body": d.Body,
			"line": d.Line,
			"side": d.Side,
		}
		if d.StartLine > 0 && d.StartSide != "" {
			c["start_line"] = d.StartLine
			c["start_side"] = d.StartSide
		}
		comments = append(comments, c)
	}

	payload := map[string]interface{}{
		"event":    event,
		"comments": comments,
	}
	if strings.TrimSpace(body) != "" {
		payload["body"] = body
	}
	if headSHA != "" {
		payload["commit_id"] = headSHA
	}

	return payload, nil
}

// ghPostReview posts a review payload; a var so tests can stub the gh call.
var ghPostReview = func(dir, slug string, number int, payload []byte) ([]byte, error) {
	cmd := appCommand("gh", "api", fmt.Sprintf("repos/%s/pulls/%d/reviews", slug, number), "-X", "POST", "--input", "-")
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(string(payload))

	return cmd.CombinedOutput()
}

func (a *App) reviewStore() *reviewDraftStore {
	a.reviewOnce.Do(func() {
		if a.reviews == nil {
			a.reviews = newReviewDraftStore(reviewDraftsFilePath())
		}
	})

	return a.reviews
}

// reviewKeyFor keys by the MAIN repo path so a PR worktree and the main checkout share drafts.
func (a *App) reviewKeyFor(number int) (string, error) {
	if a.git == nil || !a.git.IsRepo() {
		return "", fmt.Errorf("no git repository")
	}
	main, err := a.git.MainRepoPath()
	if err != nil {
		return "", err
	}

	return reviewKey(main, number), nil
}

// GetReviewState returns pending drafts plus the PR head SHA and file patches (when cached).
func (a *App) GetReviewState(number int) (ReviewState, error) {
	state := ReviewState{Drafts: []ReviewDraft{}, Files: []ReviewFile{}}
	key, err := a.reviewKeyFor(number)
	if err != nil {
		return state, err
	}
	state.Drafts = a.reviewStore().List(key)
	if cache, ok := a.cachedPR(number); ok {
		state.HeadSHA = cache.HeadSHA
		for _, f := range cache.Files {
			state.Files = append(state.Files, ReviewFile{Path: f.Path, Patch: f.Patch})
		}
	}

	return state, nil
}

// GetReviewDrafts returns pending drafts for a PR.
func (a *App) GetReviewDrafts(number int) ([]ReviewDraft, error) {
	key, err := a.reviewKeyFor(number)
	if err != nil {
		return nil, err
	}

	return a.reviewStore().List(key), nil
}

// SaveReviewDraft creates (empty ID) or updates a draft; returns the stored draft.
func (a *App) SaveReviewDraft(number int, draft ReviewDraft) (ReviewDraft, error) {
	key, err := a.reviewKeyFor(number)
	if err != nil {
		return draft, err
	}
	if draft.HeadSHA == "" {
		if cache, ok := a.cachedPR(number); ok {
			draft.HeadSHA = cache.HeadSHA
		}
	}

	return a.reviewStore().Save(key, draft)
}

// DeleteReviewDraft removes one draft.
func (a *App) DeleteReviewDraft(number int, id string) error {
	key, err := a.reviewKeyFor(number)
	if err != nil {
		return err
	}

	return a.reviewStore().Delete(key, id)
}

// SubmitReview posts all pending drafts as one review. event: COMMENT | APPROVE | REQUEST_CHANGES.
func (a *App) SubmitReview(number int, event string, body string) error {
	key, err := a.reviewKeyFor(number)
	if err != nil {
		return err
	}
	cache, ok := a.cachedPR(number)
	if !ok || cache.HeadSHA == "" {
		return fmt.Errorf("PR #%d not loaded; fetch files first", number)
	}
	slug, err := a.git.GetRepoSlug()
	if err != nil {
		return err
	}

	store := a.reviewStore()
	payload, err := buildReviewPayload(cache.HeadSHA, event, body, store.List(key))
	if err != nil {
		return err
	}
	payloadJSON, _ := json.Marshal(payload)
	out, err := ghPostReview(a.git.path, slug, number, payloadJSON)
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}

		return fmt.Errorf("%s", msg)
	}
	if err := store.Clear(key); err != nil {
		return err
	}
	if a.ctx != nil {
		a.EmitEvent("prCommentPosted", map[string]interface{}{"number": number})
	}

	return nil
}
