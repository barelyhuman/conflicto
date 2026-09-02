package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// PRReviewState mirrors GitHub pull request review metadata for the authenticated viewer.
type PRReviewState struct {
	Number                  int    `json:"number"`
	PullRequestID           string `json:"pullRequestId"`
	ReviewDecision          string `json:"reviewDecision"`
	ViewerReviewState       string `json:"viewerReviewState"`
	ViewerReviewSubmittedAt string `json:"viewerReviewSubmittedAt"`
}

// PRFileViewedState is the per-file viewed state for the authenticated viewer.
type PRFileViewedState struct {
	Path              string `json:"path"`
	ViewerViewedState string `json:"viewerViewedState"`
}

const prFilesGraphQLPageSize = 100

// GetPRReviewState fetches aggregate and viewer-specific review state for a pull request.
func (a *App) GetPRReviewState(number int) (PRReviewState, error) {
	if a.git == nil || !a.git.IsRepo() {
		return PRReviewState{}, fmt.Errorf("no git repository")
	}

	owner, name, err := a.repoOwnerName()
	if err != nil {
		a.emitPRReviewError("PR Review State Error", err.Error())
		return PRReviewState{}, err
	}

	query := `query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      id
      reviewDecision
      viewerLatestReview { state submittedAt }
    }
  }
}`

	out, err := a.runGHGraphQL(query, map[string]string{
		"owner": owner,
		"name":  name,
	}, map[string]int{"pr": number})
	if err != nil {
		a.emitPRReviewError("PR Review State Error", err.Error())
		return PRReviewState{}, err
	}

	state, err := parsePRReviewStateGraphQL(number, out)
	if err != nil {
		a.emitPRReviewError("PR Review State Parse Error", err.Error())
		return PRReviewState{}, err
	}

	a.EmitEvent("prReviewStateUpdated", state)
	return state, nil
}

// GetPRFileViewedStates returns viewed/unviewed/dismissed state for each file in a pull request.
func (a *App) GetPRFileViewedStates(number int) ([]PRFileViewedState, error) {
	if a.git == nil || !a.git.IsRepo() {
		return nil, fmt.Errorf("no git repository")
	}

	owner, name, err := a.repoOwnerName()
	if err != nil {
		a.emitPRReviewError("PR Viewed State Error", err.Error())
		return nil, err
	}

	files, err := a.fetchPRFileViewedStates(owner, name, number)
	if err != nil {
		a.emitPRReviewError("PR Viewed State Error", err.Error())
		return nil, err
	}

	payload := map[string]interface{}{
		"number": number,
		"files":  files,
	}
	a.EmitEvent("prFileViewedStateUpdated", payload)
	return files, nil
}

// MarkPRFileViewed marks a pull request file as viewed for the authenticated viewer.
func (a *App) MarkPRFileViewed(number int, path string) error {
	return a.mutatePRFileViewed(number, path, true)
}

// UnmarkPRFileViewed clears the viewed marker for a pull request file.
func (a *App) UnmarkPRFileViewed(number int, path string) error {
	return a.mutatePRFileViewed(number, path, false)
}

// SubmitPRReview submits an approval, change request, or review comment via gh pr review.
// action must be one of: approve, request-changes, comment (underscores are accepted).
func (a *App) SubmitPRReview(number int, action string, body string) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	flag, err := reviewActionFlag(action)
	if err != nil {
		a.emitPRReviewError("PR Review Submit Error", err.Error())
		return err
	}

	args := []string{"pr", "review", fmt.Sprintf("%d", number), flag}
	if strings.TrimSpace(body) != "" {
		args = append(args, "-b", body)
	}

	cmd := exec.Command("gh", args...)
	cmd.Dir = a.git.path
	if out, err := cmd.CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		a.emitPRReviewError("PR Review Submit Error", msg)
		return fmt.Errorf("gh pr review failed: %s", msg)
	}

	_, err = a.GetPRReviewState(number)
	return err
}

func (a *App) mutatePRFileViewed(number int, path string, mark bool) error {
	if a.git == nil || !a.git.IsRepo() {
		return fmt.Errorf("no git repository")
	}

	path = strings.TrimSpace(path)
	if path == "" {
		err := fmt.Errorf("file path is required")
		a.emitPRReviewError("PR Viewed State Error", err.Error())
		return err
	}

	prID, err := a.getPRNodeID(number)
	if err != nil {
		a.emitPRReviewError("PR Viewed State Error", err.Error())
		return err
	}

	mutationName := "unmarkFileAsViewed"
	if mark {
		mutationName = "markFileAsViewed"
	}

	query := fmt.Sprintf(`mutation($path: String!, $pullRequestId: ID!) {
  %s(input: {path: $path, pullRequestId: $pullRequestId}) {
    pullRequest { id }
  }
}`, mutationName)

	_, err = a.runGHGraphQL(query, map[string]string{
		"path":          path,
		"pullRequestId": prID,
	}, nil)
	if err != nil {
		a.emitPRReviewError("PR Viewed State Error", err.Error())
		return err
	}

	_, err = a.GetPRFileViewedStates(number)
	return err
}

func (a *App) fetchPRFileViewedStates(owner, name string, number int) ([]PRFileViewedState, error) {
	query := `query($owner: String!, $name: String!, $pr: Int!, $pageSize: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      files(first: $pageSize, after: $cursor) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

	files := make([]PRFileViewedState, 0)
	cursor := ""
	for page := 0; page < 30; page++ {
		stringVars := map[string]string{
			"owner": owner,
			"name":  name,
		}
		if cursor != "" {
			stringVars["cursor"] = cursor
		}

		out, err := a.runGHGraphQL(query, stringVars, map[string]int{
			"pr":       number,
			"pageSize": prFilesGraphQLPageSize,
		})
		if err != nil {
			return nil, err
		}

		pageFiles, hasNext, endCursor, err := parsePRFileViewedStatesGraphQL(out)
		if err != nil {
			return nil, err
		}
		files = append(files, pageFiles...)

		if !hasNext || endCursor == "" {
			break
		}
		cursor = endCursor
		if len(files) >= 3000 {
			break
		}
	}

	return files, nil
}

func (a *App) getPRNodeID(number int) (string, error) {
	cmd := exec.Command("gh", "pr", "view", fmt.Sprintf("%d", number), "--json", "id", "--jq", ".id")
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to resolve pull request id for #%d", number)
	}
	id := strings.TrimSpace(string(out))
	if id == "" {
		return "", fmt.Errorf("pull request #%d has no GraphQL id", number)
	}
	return id, nil
}

func (a *App) repoOwnerName() (owner, name string, err error) {
	slug, err := a.git.GetRepoSlug()
	if err != nil {
		return "", "", err
	}
	return splitRepoSlug(slug)
}

func (a *App) runGHGraphQL(query string, stringVars map[string]string, intVars map[string]int) ([]byte, error) {
	args := []string{"api", "graphql", "-f", "query=" + query}
	for key, value := range stringVars {
		args = append(args, "-f", key+"="+value)
	}
	for key, value := range intVars {
		args = append(args, "-F", key+"="+strconv.Itoa(value))
	}

	cmd := exec.Command("gh", args...)
	cmd.Dir = a.git.path
	out, err := cmd.Output()
	if err != nil {
		if len(out) > 0 {
			return nil, fmt.Errorf("%s", strings.TrimSpace(string(out)))
		}
		return nil, err
	}

	if err := checkGraphQLResponse(out); err != nil {
		return nil, err
	}
	return out, nil
}

func (a *App) emitPRReviewError(title, message string) {
	a.EmitEvent("error", map[string]string{
		"title":   title,
		"message": message,
	})
}

func splitRepoSlug(slug string) (owner, name string, err error) {
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("invalid repo slug %q", slug)
	}
	return parts[0], parts[1], nil
}

func reviewActionFlag(action string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(action))
	normalized = strings.ReplaceAll(normalized, "_", "-")
	switch normalized {
	case "approve":
		return "--approve", nil
	case "request-changes":
		return "--request-changes", nil
	case "comment":
		return "--comment", nil
	default:
		return "", fmt.Errorf("invalid review action %q (expected approve, request-changes, or comment)", action)
	}
}

func checkGraphQLResponse(out []byte) error {
	var envelope struct {
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(out, &envelope); err != nil {
		return fmt.Errorf("failed to parse GraphQL response: %w", err)
	}
	if len(envelope.Errors) == 0 {
		return nil
	}
	messages := make([]string, 0, len(envelope.Errors))
	for _, gqlErr := range envelope.Errors {
		if gqlErr.Message != "" {
			messages = append(messages, gqlErr.Message)
		}
	}
	if len(messages) == 0 {
		return fmt.Errorf("graphql request failed")
	}
	return fmt.Errorf("%s", strings.Join(messages, "; "))
}

func parsePRReviewStateGraphQL(number int, out []byte) (PRReviewState, error) {
	var payload struct {
		Data struct {
			Repository struct {
				PullRequest struct {
					ID                 string `json:"id"`
					ReviewDecision     string `json:"reviewDecision"`
					ViewerLatestReview *struct {
						State       string `json:"state"`
						SubmittedAt string `json:"submittedAt"`
					} `json:"viewerLatestReview"`
				} `json:"pullRequest"`
			} `json:"repository"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &payload); err != nil {
		return PRReviewState{}, err
	}

	pr := payload.Data.Repository.PullRequest
	if pr.ID == "" {
		return PRReviewState{}, fmt.Errorf("pull request #%d not found", number)
	}

	state := PRReviewState{
		Number:                  number,
		PullRequestID:           pr.ID,
		ReviewDecision:          pr.ReviewDecision,
		ViewerReviewState:       "",
		ViewerReviewSubmittedAt: "",
	}
	if pr.ViewerLatestReview != nil {
		state.ViewerReviewState = pr.ViewerLatestReview.State
		state.ViewerReviewSubmittedAt = pr.ViewerLatestReview.SubmittedAt
	}
	return state, nil
}

func parsePRFileViewedStatesGraphQL(out []byte) ([]PRFileViewedState, bool, string, error) {
	var payload struct {
		Data struct {
			Repository struct {
				PullRequest struct {
					Files struct {
						Nodes    []PRFileViewedState `json:"nodes"`
						PageInfo struct {
							HasNextPage bool   `json:"hasNextPage"`
							EndCursor   string `json:"endCursor"`
						} `json:"pageInfo"`
					} `json:"files"`
				} `json:"pullRequest"`
			} `json:"repository"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &payload); err != nil {
		return nil, false, "", err
	}

	files := payload.Data.Repository.PullRequest.Files.Nodes
	return files, payload.Data.Repository.PullRequest.Files.PageInfo.HasNextPage,
		payload.Data.Repository.PullRequest.Files.PageInfo.EndCursor, nil
}
