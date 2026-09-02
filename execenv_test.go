package main

import "testing"

func TestMergePathEntriesDedupesAndPreservesOrder(t *testing.T) {
	got := mergePathEntries(
		"/opt/homebrew/bin:/usr/bin",
		"/usr/local/bin:/opt/homebrew/bin",
		"/bin",
	)
	want := "/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin"
	if got != want {
		t.Fatalf("mergePathEntries() = %q, want %q", got, want)
	}
}

func TestMergePathEntriesSkipsEmptySegments(t *testing.T) {
	got := mergePathEntries("", "::/usr/bin::", "/bin")
	want := "/usr/bin:/bin"
	if got != want {
		t.Fatalf("mergePathEntries() = %q, want %q", got, want)
	}
}

func TestEnsurePathInEnvReplacesPATH(t *testing.T) {
	t.Setenv("PATH", "/opt/homebrew/bin:/usr/bin")
	got := ensurePathInEnv([]string{"FOO=bar", "PATH=/usr/bin:/bin"})
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0] != "FOO=bar" {
		t.Fatalf("got[0] = %q", got[0])
	}
	if got[1] != "PATH=/opt/homebrew/bin:/usr/bin" {
		t.Fatalf("got[1] = %q", got[1])
	}
}
