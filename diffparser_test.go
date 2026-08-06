package main

import (
	"testing"
)

func TestParseUnifiedDiff_NewFile(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/file.txt
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(diff.Hunks) != 1 {
		t.Fatalf("expected 1 hunk, got %d", len(diff.Hunks))
	}

	hunk := diff.Hunks[0]
	if hunk.OldStart != 0 || hunk.OldCount != 0 {
		t.Errorf("expected oldStart=0, oldCount=0, got %d, %d", hunk.OldStart, hunk.OldCount)
	}
	if hunk.NewStart != 1 || hunk.NewCount != 3 {
		t.Errorf("expected newStart=1, newCount=3, got %d, %d", hunk.NewStart, hunk.NewCount)
	}

	if diff.Additions != 3 {
		t.Errorf("expected 3 additions, got %d", diff.Additions)
	}
	if diff.Deletions != 0 {
		t.Errorf("expected 0 deletions, got %d", diff.Deletions)
	}

	if len(diff.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(diff.Lines))
	}

	for i, line := range diff.Lines {
		if line.Type != "add" {
			t.Errorf("line %d expected type 'add', got '%s'", i, line.Type)
		}
		if line.NewLineNo == nil || *line.NewLineNo != i+1 {
			t.Errorf("line %d expected newLineNo %d, got %v", i, i+1, line.NewLineNo)
		}
		if line.OldLineNo != nil {
			t.Errorf("line %d expected nil oldLineNo, got %v", i, line.OldLineNo)
		}
	}
}

func TestParseUnifiedDiff_DeletedFile(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
deleted file mode 100644
index abc1234..0000000
--- a/file.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if diff.Additions != 0 {
		t.Errorf("expected 0 additions, got %d", diff.Additions)
	}
	if diff.Deletions != 3 {
		t.Errorf("expected 3 deletions, got %d", diff.Deletions)
	}

	if len(diff.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(diff.Lines))
	}

	for i, line := range diff.Lines {
		if line.Type != "remove" {
			t.Errorf("line %d expected type 'remove', got '%s'", i, line.Type)
		}
		if line.OldLineNo == nil || *line.OldLineNo != i+1 {
			t.Errorf("line %d expected oldLineNo %d, got %v", i, i+1, line.OldLineNo)
		}
		if line.NewLineNo != nil {
			t.Errorf("line %d expected nil newLineNo, got %v", i, line.NewLineNo)
		}
	}
}

func TestParseUnifiedDiff_ModifiedFileWithHunks(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 line 1
-line 2
+line 2 modified
 line 3
 line 4
 line 5
@@ -10,5 +10,5 @@
 line 10
 line 11
-line 12
+line 12 modified
 line 13
 line 14
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(diff.Hunks) != 2 {
		t.Fatalf("expected 2 hunks, got %d", len(diff.Hunks))
	}

	// First hunk
	h1 := diff.Hunks[0]
	if h1.OldStart != 1 || h1.OldCount != 5 {
		t.Errorf("h1 expected oldStart=1, oldCount=5, got %d, %d", h1.OldStart, h1.OldCount)
	}
	if h1.NewStart != 1 || h1.NewCount != 5 {
		t.Errorf("h1 expected newStart=1, newCount=5, got %d, %d", h1.NewStart, h1.NewCount)
	}

	// Second hunk
	h2 := diff.Hunks[1]
	if h2.OldStart != 10 || h2.OldCount != 5 {
		t.Errorf("h2 expected oldStart=10, oldCount=5, got %d, %d", h2.OldStart, h2.OldCount)
	}
	if h2.NewStart != 10 || h2.NewCount != 5 {
		t.Errorf("h2 expected newStart=10, newCount=5, got %d, %d", h2.NewStart, h2.NewCount)
	}

	if diff.Additions != 2 {
		t.Errorf("expected 2 additions, got %d", diff.Additions)
	}
	if diff.Deletions != 2 {
		t.Errorf("expected 2 deletions, got %d", diff.Deletions)
	}

	if len(diff.Lines) != 12 {
		t.Fatalf("expected 12 lines, got %d", len(diff.Lines))
	}
}

func TestParseUnifiedDiff_ContextOnly(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
 line 2
 line 3
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if diff.Additions != 0 {
		t.Errorf("expected 0 additions, got %d", diff.Additions)
	}
	if diff.Deletions != 0 {
		t.Errorf("expected 0 deletions, got %d", diff.Deletions)
	}

	if len(diff.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(diff.Lines))
	}

	for i, line := range diff.Lines {
		if line.Type != "context" {
			t.Errorf("line %d expected type 'context', got '%s'", i, line.Type)
		}
		if line.OldLineNo == nil || *line.OldLineNo != i+1 {
			t.Errorf("line %d expected oldLineNo %d, got %v", i, i+1, line.OldLineNo)
		}
		if line.NewLineNo == nil || *line.NewLineNo != i+1 {
			t.Errorf("line %d expected newLineNo %d, got %v", i, i+1, line.NewLineNo)
		}
	}
}

func TestParseUnifiedDiff_Empty(t *testing.T) {
	diff, err := ParseUnifiedDiff([]byte{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(diff.Hunks) != 0 {
		t.Errorf("expected 0 hunks, got %d", len(diff.Hunks))
	}
	if len(diff.Lines) != 0 {
		t.Errorf("expected 0 lines, got %d", len(diff.Lines))
	}
}

func TestParseUnifiedDiff_WithNoNewline(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 line 1
-line 2
+line 2 changed
\ No newline at end of file
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(diff.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(diff.Lines))
	}

	if diff.Additions != 1 {
		t.Errorf("expected 1 addition, got %d", diff.Additions)
	}
	if diff.Deletions != 1 {
		t.Errorf("expected 1 deletion, got %d", diff.Deletions)
	}
}

func TestParseUnifiedDiff_SingleLineHunk(t *testing.T) {
	input := `diff --git a/file.txt b/file.txt
index abc1234..def5678 100644
--- a/file.txt
+++ b/file.txt
@@ -5 +5 @@
-line 5
+line 5 modified
`

	diff, err := ParseUnifiedDiff([]byte(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(diff.Hunks) != 1 {
		t.Fatalf("expected 1 hunk, got %d", len(diff.Hunks))
	}

	hunk := diff.Hunks[0]
	if hunk.OldStart != 5 || hunk.OldCount != 1 {
		t.Errorf("expected oldStart=5, oldCount=1, got %d, %d", hunk.OldStart, hunk.OldCount)
	}
	if hunk.NewStart != 5 || hunk.NewCount != 1 {
		t.Errorf("expected newStart=5, newCount=1, got %d, %d", hunk.NewStart, hunk.NewCount)
	}
}
