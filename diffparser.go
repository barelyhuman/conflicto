package main

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
)

// Hunk represents a single hunk in a unified diff
type Hunk struct {
	OldStart  int        `json:"oldStart"`
	OldCount  int        `json:"oldCount"`
	NewStart  int        `json:"newStart"`
	NewCount  int        `json:"newCount"`
	Header    string     `json:"header"`
	Lines     []DiffLine `json:"lines"`
}

// ParsedDiff is the result of parsing a unified diff
type ParsedDiff struct {
	Lines     []DiffLine `json:"lines"`     // flat list for backward compat
	Hunks     []Hunk     `json:"hunks"`      // hunk groups for rendering
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
}

// ParseUnifiedDiff parses a unified diff output into structured data.
// It is a pure function: no I/O, no external dependencies.
func ParseUnifiedDiff(input []byte) (*ParsedDiff, error) {
	if len(input) == 0 {
		return &ParsedDiff{
			Lines: []DiffLine{},
			Hunks: []Hunk{},
		}, nil
	}

	scanner := bufio.NewScanner(strings.NewReader(string(input)))
	result := &ParsedDiff{
		Lines: []DiffLine{},
		Hunks: []Hunk{},
	}

	var currentHunk *Hunk
	var oldLineNo, newLineNo int

	for scanner.Scan() {
		line := scanner.Text()

		// Hunk header
		if strings.HasPrefix(line, "@@") {
			if currentHunk != nil {
				result.Hunks = append(result.Hunks, *currentHunk)
			}

			hunk, err := parseHunkHeader(line)
			if err != nil {
				return nil, err
			}
			currentHunk = &hunk
			oldLineNo = hunk.OldStart
			newLineNo = hunk.NewStart
			continue
		}

		// Skip diff metadata lines
		if isDiffMetaLine(line) {
			continue
		}

		if currentHunk == nil {
			continue // lines before first hunk header
		}

		if len(line) == 0 {
			continue
		}

		prefix := line[0]
		content := line[1:]

		switch prefix {
		case ' ':
			oldLN := oldLineNo
			newLN := newLineNo
			dl := DiffLine{
				Type:      "context",
				OldLineNo: &oldLN,
				NewLineNo: &newLN,
				Content:   content,
			}
			currentHunk.Lines = append(currentHunk.Lines, dl)
			result.Lines = append(result.Lines, dl)
			oldLineNo++
			newLineNo++
		case '+':
			newLN := newLineNo
			dl := DiffLine{
				Type:      "add",
				NewLineNo: &newLN,
				Content:   content,
			}
			currentHunk.Lines = append(currentHunk.Lines, dl)
			result.Lines = append(result.Lines, dl)
			newLineNo++
			result.Additions++
		case '-':
			oldLN := oldLineNo
			dl := DiffLine{
				Type:      "remove",
				OldLineNo: &oldLN,
				Content:   content,
			}
			currentHunk.Lines = append(currentHunk.Lines, dl)
			result.Lines = append(result.Lines, dl)
			oldLineNo++
			result.Deletions++
		}
	}

	if currentHunk != nil {
		result.Hunks = append(result.Hunks, *currentHunk)
	}

	return result, scanner.Err()
}

func isDiffMetaLine(line string) bool {
	return strings.HasPrefix(line, "diff --git") ||
		strings.HasPrefix(line, "index ") ||
		strings.HasPrefix(line, "--- ") ||
		strings.HasPrefix(line, "+++ ") ||
		strings.HasPrefix(line, `\`) ||
		strings.HasPrefix(line, "new file mode") ||
		strings.HasPrefix(line, "deleted file mode") ||
		strings.HasPrefix(line, "similarity index") ||
		strings.HasPrefix(line, "rename from") ||
		strings.HasPrefix(line, "rename to") ||
		strings.HasPrefix(line, "Binary files")
}

func parseHunkHeader(line string) (Hunk, error) {
	start := strings.Index(line, "@@")
	if start == -1 {
		return Hunk{}, fmt.Errorf("invalid hunk header: %s", line)
	}

	end := strings.Index(line[start+2:], "@@")
	if end == -1 {
		return Hunk{}, fmt.Errorf("invalid hunk header: %s", line)
	}

	ranges := strings.TrimSpace(line[start+2 : start+2+end])
	parts := strings.Fields(ranges)
	if len(parts) < 2 {
		return Hunk{}, fmt.Errorf("invalid hunk ranges: %s", ranges)
	}

	hunk := Hunk{Header: line}

	// Parse old range: -start,count or -start
	oldPart := parts[0]
	if !strings.HasPrefix(oldPart, "-") {
		return Hunk{}, fmt.Errorf("old range must start with '-': %s", oldPart)
	}
	oldPart = oldPart[1:]
	oldFields := strings.Split(oldPart, ",")
	oldStart, err := strconv.Atoi(oldFields[0])
	if err != nil {
		return Hunk{}, fmt.Errorf("invalid old start: %v", err)
	}
	hunk.OldStart = oldStart
	if len(oldFields) > 1 {
		oldCount, err := strconv.Atoi(oldFields[1])
		if err != nil {
			return Hunk{}, fmt.Errorf("invalid old count: %v", err)
		}
		hunk.OldCount = oldCount
	} else {
		hunk.OldCount = 1
	}

	// Parse new range: +start,count or +start
	newPart := parts[1]
	if !strings.HasPrefix(newPart, "+") {
		return Hunk{}, fmt.Errorf("new range must start with '+': %s", newPart)
	}
	newPart = newPart[1:]
	newFields := strings.Split(newPart, ",")
	newStart, err := strconv.Atoi(newFields[0])
	if err != nil {
		return Hunk{}, fmt.Errorf("invalid new start: %v", err)
	}
	hunk.NewStart = newStart
	if len(newFields) > 1 {
		newCount, err := strconv.Atoi(newFields[1])
		if err != nil {
			return Hunk{}, fmt.Errorf("invalid new count: %v", err)
		}
		hunk.NewCount = newCount
	} else {
		hunk.NewCount = 1
	}

	return hunk, nil
}
