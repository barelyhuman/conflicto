//! Cached highlight + alignment so scroll frames skip tree-sitter and re-diff.

use std::ops::Range;

use crate::diff::{
    aligned_diff_lines, build_unified, had_trailing_newline, line_byte_starts, DiffLine, LineKind,
};
use crate::highlight::{highlight_source, HighlightKind, HighlightSpan};

/// Per-line syntax ranges relative to that line's text (byte offsets).
pub type LineHighlights = Vec<(Range<usize>, HighlightKind)>;

#[derive(Default, Clone)]
pub struct DiffViewCache {
    path: String,
    original: String,
    modified: String,
    pub left_lines: Vec<DiffLine>,
    pub right_lines: Vec<DiffLine>,
    pub unified_lines: Vec<DiffLine>,
    pub left_spans: Vec<HighlightSpan>,
    pub right_spans: Vec<HighlightSpan>,
    pub left_starts: Vec<usize>,
    pub right_starts: Vec<usize>,
    /// Projected highlight runs for each aligned left/right/unified row.
    pub left_line_hls: Vec<LineHighlights>,
    pub right_line_hls: Vec<LineHighlights>,
    pub unified_line_hls: Vec<LineHighlights>,
    pub trailing: bool,
    pub max_line_chars: usize,
}

impl DiffViewCache {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Rebuild when path/content change; no-op on cache hit.
    pub fn ensure(&mut self, path: &str, original: &str, modified: &str) {
        if self.path == path && self.original == original && self.modified == modified {
            return;
        }
        self.path = path.to_owned();
        self.original = original.to_owned();
        self.modified = modified.to_owned();

        let (left, right) = aligned_diff_lines(original, modified);
        self.max_line_chars = max_line_chars(&left).max(max_line_chars(&right));
        self.unified_lines = build_unified(&left, &right);
        self.left_lines = left;
        self.right_lines = right;
        let mut left_spans = highlight_source(path, original);
        let mut right_spans = highlight_source(path, modified);
        left_spans.sort_by_key(|s| s.range.start);
        right_spans.sort_by_key(|s| s.range.start);
        self.left_spans = left_spans;
        self.right_spans = right_spans;
        self.left_starts = line_byte_starts(original);
        self.right_starts = line_byte_starts(modified);
        self.trailing = had_trailing_newline(modified);

        self.left_line_hls =
            project_line_highlights(&self.left_lines, &self.left_spans, &self.left_starts);
        self.right_line_hls =
            project_line_highlights(&self.right_lines, &self.right_spans, &self.right_starts);
        self.unified_line_hls = self
            .unified_lines
            .iter()
            .map(|line| match line.kind {
                LineKind::Delete => project_one_line(line, &self.left_spans, &self.left_starts),
                LineKind::Insert | LineKind::Equal => {
                    project_one_line(line, &self.right_spans, &self.right_starts)
                }
                LineKind::Gap => Vec::new(),
            })
            .collect();
    }
}

fn max_line_chars(lines: &[DiffLine]) -> usize {
    lines
        .iter()
        .map(|l| l.text.chars().count())
        .max()
        .unwrap_or(0)
}

fn project_line_highlights(
    lines: &[DiffLine],
    spans: &[HighlightSpan],
    starts: &[usize],
) -> Vec<LineHighlights> {
    lines
        .iter()
        .map(|line| project_one_line(line, spans, starts))
        .collect()
}

fn project_one_line(
    line: &DiffLine,
    spans: &[HighlightSpan],
    starts: &[usize],
) -> LineHighlights {
    let Some(ln) = line.line_no else {
        return Vec::new();
    };
    if ln == 0 || ln > starts.len() {
        return Vec::new();
    }
    let start = starts[ln - 1];
    let end = start + line.text.len();
    let mut out = Vec::new();
    for sp in spans {
        if sp.range.end <= start || sp.range.start >= end {
            continue;
        }
        let lo = sp.range.start.max(start) - start;
        let hi = sp.range.end.min(end) - start;
        if lo < hi && hi <= line.text.len() && line.text.is_char_boundary(lo) && line.text.is_char_boundary(hi)
        {
            out.push((lo..hi, sp.kind));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_caches_line_highlights_for_rust() {
        let mut cache = DiffViewCache::default();
        cache.ensure(
            "main.rs",
            "fn a() {}\n",
            "fn a() {}\nfn b() {}\n",
        );
        assert!(!cache.right_line_hls.is_empty());
        assert!(cache.right_line_hls.iter().any(|h| !h.is_empty()));
        // Cache hit: no panic / same lengths
        let n = cache.right_line_hls.len();
        cache.ensure("main.rs", "fn a() {}\n", "fn a() {}\nfn b() {}\n");
        assert_eq!(cache.right_line_hls.len(), n);
    }
}
