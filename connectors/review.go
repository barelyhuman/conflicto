package connectors

import "time"

// ReviewConnector loads pull-request-style reviews and diffs from a forge
// (GitHub today; GitLab, etc. later) without tying conflicto's core to one CLI.
type ReviewConnector interface {
	ID() string
	DisplayName() string

	// DetectHost reports whether the connector's tooling is installed and usable.
	DetectHost() HostStatus

	// MatchRepo returns true when this connector should handle reviews for repoPath.
	MatchRepo(repoPath string) bool

	ListReviews(repoPath string, limit int, search string) ([]Review, error)
	LoadReviewFiles(repoPath string, number int) (ReviewSnapshot, error)
	ReviewFileList(repoPath string, number int) ([]ReviewFileSummary, error)
	FileDiff(repoPath string, number int, path string) (FileDiff, error)
	ListCommentsRaw(repoPath string, number int) (string, error)
	PostComment(repoPath string, number int, req PostCommentRequest) error
	Checkout(repoPath string, number int) error
	CreateReview(repoPath string, req CreateReviewRequest) (string, error)
	ReviewHeadOID(repoPath string, number int) (string, error)

	// InvalidateReviewCache drops cached file lists for repoPath (all PRs if number is 0).
	InvalidateReviewCache(repoPath string, number int)

	// ClearRepoCache removes all cached reviews for a repository (e.g. on project switch).
	ClearRepoCache(repoPath string)

	// UISlots returns mount points this connector fills. active is true when this
	// connector is the resolved review source for repoPath.
	UISlots(repoPath string, active bool) []UISlot
}

// HostStatus is emitted to the UI (today mapped to ghStatusChanged).
type HostStatus struct {
	ConnectorID string
	Installed   bool
	Version     string
	User        string
	Error       string
}

// Review is a forge-agnostic pull request summary.
type Review struct {
	Number     int
	Title      string
	Author     string
	BaseBranch string
}

// ReviewFileSummary is a changed file without patch payload (for file trees).
type ReviewFileSummary struct {
	Path   string
	Status string
}

// ReviewFile includes patch data when loaded from the API.
type ReviewFile struct {
	Path      string
	Status    string
	Additions int
	Deletions int
	Patch     string
}

// ReviewSnapshot is a cached load of one review's files and head commit.
type ReviewSnapshot struct {
	Number    int
	HeadSHA   string
	Files     []ReviewFile
	FetchedAt time.Time
}

// FileDiff is the minimal diff payload for the diff viewer.
type FileDiff struct {
	Path  string
	Patch string
}

// PostCommentRequest is a line-anchored review comment.
type PostCommentRequest struct {
	Path      string
	Body      string
	Line      int
	Side      string
	StartLine int
	StartSide string
	HeadSHA   string
}

// CreateReviewRequest opens a new review from the current branch.
type CreateReviewRequest struct {
	Title      string
	Body       string
	BaseBranch string
	Draft      bool
}
