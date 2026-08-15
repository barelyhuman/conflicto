package main

import (
	"testing"
)

func TestSplitRepoSlug(t *testing.T) {
	owner, name, err := splitRepoSlug("barelyhuman/conflicto")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if owner != "barelyhuman" || name != "conflicto" {
		t.Fatalf("got owner=%s name=%s", owner, name)
	}

	_, _, err = splitRepoSlug("invalid")
	if err == nil {
		t.Fatal("expected error for invalid slug")
	}
}

func TestReviewActionFlag(t *testing.T) {
	flag, err := reviewActionFlag("approve")
	if err != nil || flag != "--approve" {
		t.Fatalf("approve: flag=%s err=%v", flag, err)
	}

	flag, err = reviewActionFlag("request_changes")
	if err != nil || flag != "--request-changes" {
		t.Fatalf("request_changes: flag=%s err=%v", flag, err)
	}

	flag, err = reviewActionFlag("comment")
	if err != nil || flag != "--comment" {
		t.Fatalf("comment: flag=%s err=%v", flag, err)
	}

	_, err = reviewActionFlag("ship-it")
	if err == nil {
		t.Fatal("expected error for invalid action")
	}
}

func TestParsePRReviewStateGraphQL(t *testing.T) {
	raw := []byte(`{
		"data": {
			"repository": {
				"pullRequest": {
					"id": "PR_kwDOThlW6s7_Z940",
					"reviewDecision": "APPROVED",
					"viewerLatestReview": {
						"state": "APPROVED",
						"submittedAt": "2026-08-14T14:40:19Z"
					}
				}
			}
		}
	}`)

	state, err := parsePRReviewStateGraphQL(10, raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.Number != 10 {
		t.Errorf("number: got %d", state.Number)
	}
	if state.PullRequestID != "PR_kwDOThlW6s7_Z940" {
		t.Errorf("pullRequestId: got %s", state.PullRequestID)
	}
	if state.ReviewDecision != "APPROVED" {
		t.Errorf("reviewDecision: got %s", state.ReviewDecision)
	}
	if state.ViewerReviewState != "APPROVED" {
		t.Errorf("viewerReviewState: got %s", state.ViewerReviewState)
	}
	if state.ViewerReviewSubmittedAt != "2026-08-14T14:40:19Z" {
		t.Errorf("viewerReviewSubmittedAt: got %s", state.ViewerReviewSubmittedAt)
	}
}

func TestParsePRReviewStateGraphQLMissingPR(t *testing.T) {
	raw := []byte(`{"data":{"repository":{"pullRequest":{"id":""}}}}`)
	_, err := parsePRReviewStateGraphQL(99, raw)
	if err == nil {
		t.Fatal("expected error for missing pull request")
	}
}

func TestParsePRFileViewedStatesGraphQL(t *testing.T) {
	raw := []byte(`{
		"data": {
			"repository": {
				"pullRequest": {
					"files": {
						"nodes": [
							{"path": "app.go", "viewerViewedState": "VIEWED"},
							{"path": "main.go", "viewerViewedState": "UNVIEWED"}
						],
						"pageInfo": {
							"hasNextPage": true,
							"endCursor": "cursor123"
						}
					}
				}
			}
		}
	}`)

	files, hasNext, cursor, err := parsePRFileViewedStatesGraphQL(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
	}
	if files[0].Path != "app.go" || files[0].ViewerViewedState != "VIEWED" {
		t.Errorf("first file: %+v", files[0])
	}
	if !hasNext || cursor != "cursor123" {
		t.Errorf("pagination: hasNext=%v cursor=%s", hasNext, cursor)
	}
}

func TestCheckGraphQLResponse(t *testing.T) {
	if err := checkGraphQLResponse([]byte(`{"data":{}}`)); err != nil {
		t.Fatalf("expected no error: %v", err)
	}

	err := checkGraphQLResponse([]byte(`{"errors":[{"message":"nope"}]}`))
	if err == nil || err.Error() != "nope" {
		t.Fatalf("expected graphql error, got %v", err)
	}
}
