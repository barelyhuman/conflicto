package main

import (
	"path/filepath"
	"testing"
)

func TestReviewDraftStoreRoundTrip(t *testing.T) {
	s := newReviewDraftStore(filepath.Join(t.TempDir(), "d.json"))
	key := reviewKey("/repo", 7)

	d, err := s.Save(key, ReviewDraft{Path: "a.go", Body: "hi", Line: 3, Side: "bogus"})
	if err != nil || d.ID == "" || d.Side != "RIGHT" {
		t.Fatalf("save: %+v %v", d, err)
	}
	d.Body = "edited"
	if _, err := s.Save(key, d); err != nil {
		t.Fatal(err)
	}
	s2 := newReviewDraftStore(s.path)
	list := s2.List(key)
	if len(list) != 1 || list[0].Body != "edited" || list[0].CreatedAt == "" {
		t.Fatalf("list: %+v", list)
	}
	if got := s2.List(reviewKey("/repo", 8)); len(got) != 0 {
		t.Fatalf("other PR leaked: %+v", got)
	}
	if err := s2.Delete(key, d.ID); err != nil {
		t.Fatal(err)
	}
	if len(s2.List(key)) != 0 {
		t.Fatal("not deleted")
	}
}

func TestReviewDraftValidation(t *testing.T) {
	s := newReviewDraftStore(filepath.Join(t.TempDir(), "d.json"))
	if _, err := s.Save("k", ReviewDraft{Path: "a", Body: " ", Line: 1}); err == nil {
		t.Fatal("expected empty body error")
	}
	if _, err := s.Save("k", ReviewDraft{Path: "a", Body: "x", Line: 0}); err == nil {
		t.Fatal("expected line error")
	}
	d, _ := s.Save("k", ReviewDraft{Path: "a", Body: "x", Line: 5, StartLine: 2, StartSide: "LEFT", Side: "LEFT"})
	if d.StartLine != 2 || d.StartSide != "LEFT" {
		t.Fatalf("%+v", d)
	}
}

func TestBuildReviewPayload(t *testing.T) {
	drafts := []ReviewDraft{
		{Path: "a.go", Body: "one", Line: 4, Side: "RIGHT"},
		{Path: "b.go", Body: "two", Line: 9, Side: "LEFT", StartLine: 6, StartSide: "LEFT"},
	}
	p, err := buildReviewPayload("abc", "REQUEST_CHANGES", "summary", drafts)
	if err != nil {
		t.Fatal(err)
	}
	if p["event"] != "REQUEST_CHANGES" || p["body"] != "summary" || p["commit_id"] != "abc" {
		t.Fatalf("%v", p)
	}
	cs := p["comments"].([]map[string]interface{})
	if len(cs) != 2 {
		t.Fatal(cs)
	}
	if _, has := cs[0]["start_line"]; has {
		t.Fatal("single-line comment must not have start_line")
	}
	if cs[1]["start_line"] != 6 || cs[1]["start_side"] != "LEFT" || cs[1]["side"] != "LEFT" {
		t.Fatalf("%v", cs[1])
	}

	if _, err := buildReviewPayload("abc", "NOPE", "", drafts); err == nil {
		t.Fatal("bad event")
	}
	if _, err := buildReviewPayload("abc", "COMMENT", "", nil); err == nil {
		t.Fatal("empty review")
	}
	if _, err := buildReviewPayload("abc", "APPROVE", "", nil); err != nil {
		t.Fatal(err)
	}
}

func TestGhPostReviewStub(t *testing.T) {
	old := ghPostReview
	defer func() { ghPostReview = old }()
	var gotSlug string
	var gotN int
	ghPostReview = func(dir, slug string, n int, payload []byte) ([]byte, error) {
		gotSlug, gotN = slug, n
		return []byte("{}"), nil
	}
	if _, err := ghPostReview("", "o/r", 3, nil); err != nil || gotSlug != "o/r" || gotN != 3 {
		t.Fatal("stub not used")
	}
}

func TestReviewDraftRemoveKeepsDraftsSavedMeanwhile(t *testing.T) {
	s := newReviewDraftStore(filepath.Join(t.TempDir(), "d.json"))
	key := reviewKey("/repo", 7)
	posted, _ := s.Save(key, ReviewDraft{Path: "a.go", Body: "one", Line: 1})
	ids := []string{posted.ID}
	// A draft saved while the review is being posted must survive the cleanup.
	late, _ := s.Save(key, ReviewDraft{Path: "b.go", Body: "two", Line: 2})

	if err := s.Remove(key, ids); err != nil {
		t.Fatal(err)
	}
	got := s.List(key)
	if len(got) != 1 || got[0].ID != late.ID {
		t.Fatalf("remaining drafts = %+v, want only the late one", got)
	}
}
