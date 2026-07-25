use conflicto_core::{
    aligned_diff_lines, build_unified, had_trailing_newline, highlight_source, line_byte_starts,
    DiffLine, HighlightSpan,
};

/// Cached highlight + alignment so scroll frames skip tree-sitter and re-diff.
#[derive(Default)]
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
    }
}

fn max_line_chars(lines: &[DiffLine]) -> usize {
    lines
        .iter()
        .map(|l| l.text.chars().count())
        .max()
        .unwrap_or(0)
}
