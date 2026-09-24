package connectors

import "strings"

// normalizeGitHubPatch wraps a GitHub pull-files "patch" (often hunk-only) in a
// synthetic unified diff header so Pierre processFile({ isGitDiff: true }) can parse it.
func normalizeGitHubPatch(path, status, patch string) string {
	if strings.HasPrefix(patch, "diff --git") {
		return patch
	}

	oldPath := "a/" + path
	newPath := "b/" + path
	switch strings.ToUpper(status) {
	case "A", "ADDED":
		oldPath = "/dev/null"
	case "D", "REMOVED", "DELETED":
		newPath = "/dev/null"
	}

	var b strings.Builder
	b.WriteString("diff --git a/")
	b.WriteString(path)
	b.WriteString(" b/")
	b.WriteString(path)
	b.WriteByte('\n')
	b.WriteString("--- ")
	b.WriteString(oldPath)
	b.WriteByte('\n')
	b.WriteString("+++ ")
	b.WriteString(newPath)
	b.WriteByte('\n')
	b.WriteString(patch)
	if !strings.HasSuffix(patch, "\n") {
		b.WriteByte('\n')
	}
	return b.String()
}
