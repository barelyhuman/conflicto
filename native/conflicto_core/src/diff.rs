//! Pure aligned-diff data: line kinds, alignment, buffer rebuild, line edits.

use similar::{DiffOp, TextDiff};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LineKind {
    Equal,
    Delete,
    Insert,
    Gap,
}

#[derive(Clone, Debug)]
pub struct DiffLine {
    pub text: String,
    pub kind: LineKind,
    pub line_no: Option<usize>,
}

pub fn aligned_diff_lines(old: &str, new: &str) -> (Vec<DiffLine>, Vec<DiffLine>) {
    let diff = TextDiff::from_lines(old, new);
    let mut left = Vec::new();
    let mut right = Vec::new();
    let mut old_no = 1usize;
    let mut new_no = 1usize;

    for op in diff.ops() {
        match *op {
            DiffOp::Equal { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text: text.clone(),
                        kind: LineKind::Equal,
                        line_no: Some(old_no),
                    });
                    right.push(DiffLine {
                        text,
                        kind: LineKind::Equal,
                        line_no: Some(new_no),
                    });
                    old_no += 1;
                    new_no += 1;
                }
            }
            DiffOp::Delete { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text,
                        kind: LineKind::Delete,
                        line_no: Some(old_no),
                    });
                    right.push(DiffLine {
                        text: String::new(),
                        kind: LineKind::Gap,
                        line_no: None,
                    });
                    old_no += 1;
                }
            }
            DiffOp::Insert { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text: String::new(),
                        kind: LineKind::Gap,
                        line_no: None,
                    });
                    right.push(DiffLine {
                        text,
                        kind: LineKind::Insert,
                        line_no: Some(new_no),
                    });
                    new_no += 1;
                }
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let old_slice = &diff.old_slices()[old_index..old_index + old_len];
                let new_slice = &diff.new_slices()[new_index..new_index + new_len];
                let max = old_len.max(new_len);
                for i in 0..max {
                    if i < old_len {
                        left.push(DiffLine {
                            text: old_slice[i].trim_end_matches('\n').to_string(),
                            kind: LineKind::Delete,
                            line_no: Some(old_no),
                        });
                        old_no += 1;
                    } else {
                        left.push(DiffLine {
                            text: String::new(),
                            kind: LineKind::Gap,
                            line_no: None,
                        });
                    }
                    if i < new_len {
                        right.push(DiffLine {
                            text: new_slice[i].trim_end_matches('\n').to_string(),
                            kind: LineKind::Insert,
                            line_no: Some(new_no),
                        });
                        new_no += 1;
                    } else {
                        right.push(DiffLine {
                            text: String::new(),
                            kind: LineKind::Gap,
                            line_no: None,
                        });
                    }
                }
            }
        }
    }

    (left, right)
}

pub fn build_unified(left: &[DiffLine], right: &[DiffLine]) -> Vec<DiffLine> {
    let mut unified = Vec::new();
    for (l, r) in left.iter().zip(right.iter()) {
        match (l.kind, r.kind) {
            (LineKind::Delete, LineKind::Gap) => unified.push(l.clone()),
            (LineKind::Gap, LineKind::Insert) => unified.push(r.clone()),
            (LineKind::Equal, LineKind::Equal) => unified.push(r.clone()),
            (LineKind::Delete, LineKind::Insert) => {
                unified.push(l.clone());
                unified.push(r.clone());
            }
            _ => {
                if l.kind != LineKind::Gap {
                    unified.push(l.clone());
                }
                if r.kind != LineKind::Gap
                    && !(l.kind == LineKind::Equal && r.kind == LineKind::Equal)
                    && !(l.kind == r.kind && l.text == r.text)
                {
                    unified.push(r.clone());
                }
            }
        }
    }
    unified
}

pub fn had_trailing_newline(s: &str) -> bool {
    s.ends_with('\n')
}

pub fn line_byte_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (i, ch) in source.char_indices() {
        if ch == '\n' {
            starts.push(i + ch.len_utf8());
        }
    }
    starts
}

pub fn rebuild_buffer_from_lines(lines: &[DiffLine], had_trailing_newline: bool) -> String {
    let parts: Vec<&str> = lines
        .iter()
        .filter(|l| l.kind != LineKind::Gap && l.kind != LineKind::Delete)
        .map(|l| l.text.as_str())
        .collect();
    if parts.is_empty() {
        return String::new();
    }
    let mut out = parts.join("\n");
    if had_trailing_newline && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

fn editable_parts(lines: &[DiffLine]) -> Vec<String> {
    lines
        .iter()
        .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
        .map(|l| l.text.clone())
        .collect()
}

fn editable_part_index(lines: &[DiffLine], row_i: usize) -> usize {
    lines[..row_i]
        .iter()
        .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
        .count()
}

pub fn split_at_char(s: &str, char_idx: usize) -> (String, String) {
    match s.char_indices().nth(char_idx) {
        Some((byte_i, _)) => (s[..byte_i].to_string(), s[byte_i..].to_string()),
        None => (s.to_string(), String::new()),
    }
}

pub fn join_parts(parts: &[String], trailing: bool) -> String {
    let mut out = parts.join("\n");
    if trailing && !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

pub fn apply_line_edits(
    lines: &[DiffLine],
    trailing: bool,
    changed: bool,
    split_at: Option<(usize, usize)>,
    merge_at: Option<usize>,
) -> Option<String> {
    if let Some((row_i, cc)) = split_at {
        let text = lines[row_i].text.clone();
        let (left, right) = split_at_char(&text, cc);
        let mut parts = editable_parts(lines);
        let part_idx = editable_part_index(lines, row_i);
        if part_idx < parts.len() {
            parts[part_idx] = left;
            parts.insert(part_idx + 1, right);
        }
        return Some(join_parts(&parts, trailing));
    }

    if let Some(row_i) = merge_at {
        let mut parts = editable_parts(lines);
        let part_idx = editable_part_index(lines, row_i);
        if part_idx > 0 && part_idx < parts.len() {
            let cur = parts.remove(part_idx);
            parts[part_idx - 1].push_str(&cur);
            return Some(join_parts(&parts, trailing));
        }
    }

    if changed {
        Some(rebuild_buffer_from_lines(lines, trailing))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligned_marks_delete_insert_and_equal() {
        let (left, right) = aligned_diff_lines("a\nb\n", "a\nc\n");
        assert_eq!(left.len(), right.len());
        assert!(left.iter().any(|l| l.kind == LineKind::Delete && l.text == "b"));
        assert!(right.iter().any(|l| l.kind == LineKind::Insert && l.text == "c"));
        assert!(left.iter().any(|l| l.kind == LineKind::Equal && l.text == "a"));
        assert_eq!(
            left.iter().filter(|l| l.kind == LineKind::Delete).count(),
            right.iter().filter(|l| l.kind == LineKind::Insert).count()
        );
    }

    #[test]
    fn rebuild_skips_gaps_and_deletes() {
        let lines = vec![
            DiffLine {
                text: "keep".into(),
                kind: LineKind::Equal,
                line_no: Some(1),
            },
            DiffLine {
                text: String::new(),
                kind: LineKind::Gap,
                line_no: None,
            },
            DiffLine {
                text: "gone".into(),
                kind: LineKind::Delete,
                line_no: Some(2),
            },
            DiffLine {
                text: "add".into(),
                kind: LineKind::Insert,
                line_no: Some(2),
            },
        ];
        assert_eq!(rebuild_buffer_from_lines(&lines, true), "keep\nadd\n");
        assert_eq!(rebuild_buffer_from_lines(&lines, false), "keep\nadd");
    }

    #[test]
    fn split_and_join_roundtrip_line_ops() {
        let (left, right) = split_at_char("hello", 2);
        assert_eq!(left, "he");
        assert_eq!(right, "llo");
        let parts = vec!["he".into(), "llo".into(), "world".into()];
        assert_eq!(join_parts(&parts, true), "he\nllo\nworld\n");
    }
}
