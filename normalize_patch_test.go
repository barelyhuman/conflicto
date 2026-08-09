package main

import (
	"strings"
	"testing"
)

func TestNormalizeGitHubPatch_WrapsHunkOnly(t *testing.T) {
	hunk := "@@ -1,2 +1,2 @@\n line\n-old\n+new\n"
	got := normalizeGitHubPatch("frontend/src/components/terminal/terminal.css", "M", hunk)
	if !strings.HasPrefix(got, "diff --git a/frontend/src/components/terminal/terminal.css b/frontend/src/components/terminal/terminal.css\n") {
		t.Fatalf("missing diff --git header:\n%s", got)
	}
	if !strings.Contains(got, "--- a/frontend/src/components/terminal/terminal.css\n") {
		t.Fatalf("missing --- header:\n%s", got)
	}
	if !strings.Contains(got, "+++ b/frontend/src/components/terminal/terminal.css\n") {
		t.Fatalf("missing +++ header:\n%s", got)
	}
	if !strings.Contains(got, hunk) {
		t.Fatalf("missing original hunk:\n%s", got)
	}
}

func TestNormalizeGitHubPatch_AddedUsesDevNull(t *testing.T) {
	got := normalizeGitHubPatch("new.txt", "A", "@@ -0,0 +1 @@\n+hi\n")
	if !strings.Contains(got, "--- /dev/null\n") {
		t.Fatalf("expected --- /dev/null:\n%s", got)
	}
	if !strings.Contains(got, "+++ b/new.txt\n") {
		t.Fatalf("expected +++ b/new.txt:\n%s", got)
	}
}

func TestNormalizeGitHubPatch_DeletedUsesDevNull(t *testing.T) {
	got := normalizeGitHubPatch("gone.txt", "D", "@@ -1 +0,0 @@\n-bye\n")
	if !strings.Contains(got, "--- a/gone.txt\n") {
		t.Fatalf("expected --- a/gone.txt:\n%s", got)
	}
	if !strings.Contains(got, "+++ /dev/null\n") {
		t.Fatalf("expected +++ /dev/null:\n%s", got)
	}
}

func TestNormalizeGitHubPatch_Idempotent(t *testing.T) {
	full := "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n"
	got := normalizeGitHubPatch("f", "M", full)
	if got != full {
		t.Fatalf("should leave full patches unchanged")
	}
}
