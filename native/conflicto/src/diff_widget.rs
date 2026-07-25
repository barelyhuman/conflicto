//! Aligned diff panes with hunk chrome and optional line-based editing.

use conflicto_core::{
    highlight_color, highlight_source, HighlightPalette, HighlightSpan, UiVars,
};
use egui::text::{LayoutJob, TextFormat};
use egui::{
    text_edit::TextEditOutput, Color32, FontFamily, FontId, Key, RichText, ScrollArea, TextEdit,
    Ui,
};
use similar::{DiffOp, TextDiff};

pub const LINE_FONT: f32 = 13.0;
/// Fixed row height so left/right (and label vs TextEdit) stay vertically locked.
const ROW_HEIGHT: f32 = 20.0;
const ROW_PAD_X: f32 = 6.0;
/// Extra room after the longest glyph so the last character isn't flush to the edge.
const ROW_TRAIL_PAD: f32 = 12.0;

fn monospace_font() -> FontId {
    FontId::new(LINE_FONT, FontFamily::Monospace)
}

fn measure_text_width(ui: &Ui, text: &str) -> f32 {
    let font = monospace_font();
    ui.fonts(|f| {
        f.layout_no_wrap(text.to_owned(), font, Color32::WHITE)
            .size()
            .x
    })
}

/// Gutter + marker + spacing left of the code text.
fn gutter_chrome_width(ui: &Ui) -> f32 {
    // "1234" gutter + item spacing + marker + item spacing + leading pad
    measure_text_width(ui, "0000") + 8.0 + measure_text_width(ui, "−") + 8.0 + ROW_PAD_X
}

fn max_line_chars(lines: &[DiffLine]) -> usize {
    lines
        .iter()
        .map(|l| l.text.chars().count())
        .max()
        .unwrap_or(0)
}

fn content_width_from_chars(ui: &Ui, max_chars: usize, min_width: f32) -> f32 {
    let em = measure_text_width(ui, "M");
    (gutter_chrome_width(ui) + max_chars as f32 * em + ROW_TRAIL_PAD).max(min_width)
}

/// Visible row index range for virtualized painting (inclusive start, exclusive end).
fn row_window(scroll_y: f32, viewport_h: f32, row_count: usize) -> (usize, usize) {
    const OVERSCAN: usize = 8;
    if row_count == 0 {
        return (0, 0);
    }
    let first = ((scroll_y / ROW_HEIGHT).floor() as usize)
        .saturating_sub(OVERSCAN)
        .min(row_count);
    let visible = ((viewport_h / ROW_HEIGHT).ceil() as usize).saturating_add(1 + OVERSCAN * 2);
    let end = (first + visible).min(row_count);
    (first, end)
}

fn row_spacer(ui: &mut Ui, width: f32, rows: usize) {
    if rows == 0 {
        return;
    }
    ui.allocate_exact_size(
        egui::vec2(width, rows as f32 * ROW_HEIGHT),
        egui::Sense::hover(),
    );
}

fn build_unified(left: &[DiffLine], right: &[DiffLine]) -> Vec<DiffLine> {
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
        self.left_spans = highlight_source(path, original);
        self.right_spans = highlight_source(path, modified);
        self.left_starts = line_byte_starts(original);
        self.right_starts = line_byte_starts(modified);
        self.trailing = had_trailing_newline(modified);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    Equal,
    Delete,
    Insert,
    Gap,
}

#[derive(Clone)]
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

fn rgb(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

fn tint(bg: [u8; 3], accent: [u8; 3], amount: f32) -> Color32 {
    let t = amount.clamp(0.0, 1.0);
    Color32::from_rgb(
        (bg[0] as f32 + (accent[0] as f32 - bg[0] as f32) * t).round() as u8,
        (bg[1] as f32 + (accent[1] as f32 - bg[1] as f32) * t).round() as u8,
        (bg[2] as f32 + (accent[2] as f32 - bg[2] as f32) * t).round() as u8,
    )
}

pub fn line_fill(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Equal => rgb(u.bg),
        LineKind::Delete => tint(u.bg, u.status_d, 0.28),
        LineKind::Insert => tint(u.bg, u.status_a, 0.28),
        LineKind::Gap => tint(u.bg, u.text_muted, 0.08),
    }
}

pub fn line_text_color(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Delete => rgb(u.status_d),
        LineKind::Insert => rgb(u.status_a),
        LineKind::Gap => rgb(u.text_muted),
        LineKind::Equal => rgb(u.text),
    }
}

pub fn layout_job_highlighted(
    source: &str,
    spans: &[HighlightSpan],
    palette: &HighlightPalette,
    fallback: [u8; 3],
) -> LayoutJob {
    let font = FontId::new(LINE_FONT, FontFamily::Monospace);
    let mut job = LayoutJob::default();
    if source.is_empty() {
        return job;
    }
    if spans.is_empty() {
        job.append(
            source,
            0.0,
            TextFormat {
                font_id: font,
                color: rgb(fallback),
                ..Default::default()
            },
        );
        return job;
    }

    let mut cursor = 0usize;
    let mut ordered = spans.to_vec();
    ordered.sort_by_key(|s| s.range.start);
    for span in ordered {
        let start = span.range.start.min(source.len());
        let end = span.range.end.min(source.len());
        if start < cursor {
            continue;
        }
        if cursor < start {
            job.append(
                &source[cursor..start],
                0.0,
                TextFormat {
                    font_id: font.clone(),
                    color: rgb(fallback),
                    ..Default::default()
                },
            );
        }
        if start < end {
            job.append(
                &source[start..end],
                0.0,
                TextFormat {
                    font_id: font.clone(),
                    color: rgb(highlight_color(span.kind, palette)),
                    ..Default::default()
                },
            );
        }
        cursor = end;
    }
    if cursor < source.len() {
        job.append(
            &source[cursor..],
            0.0,
            TextFormat {
                font_id: font,
                color: rgb(fallback),
                ..Default::default()
            },
        );
    }
    job
}

fn line_spans_for(
    spans: &[HighlightSpan],
    line_start: usize,
    line_len: usize,
) -> Vec<HighlightSpan> {
    let line_end = line_start + line_len;
    spans
        .iter()
        .filter_map(|s| {
            let start = s.range.start.max(line_start);
            let end = s.range.end.min(line_end);
            if start >= end {
                return None;
            }
            Some(HighlightSpan {
                range: (start - line_start)..(end - line_start),
                kind: s.kind,
            })
        })
        .collect()
}

fn line_byte_starts(source: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (i, ch) in source.char_indices() {
        if ch == '\n' {
            starts.push(i + ch.len_utf8());
        }
    }
    starts
}

fn fallback_for_kind(kind: LineKind, u: &UiVars) -> [u8; 3] {
    match kind {
        LineKind::Equal => u.text,
        LineKind::Delete => u.status_d,
        LineKind::Insert => u.status_a,
        LineKind::Gap => u.text_muted,
    }
}

fn paint_gutter(ui: &mut Ui, line: &DiffLine, u: &UiVars) {
    let gutter = match line.line_no {
        Some(n) => format!("{n:>4}"),
        None => "    ".into(),
    };
    ui.label(
        RichText::new(gutter)
            .monospace()
            .size(LINE_FONT)
            .color(rgb(u.text_muted)),
    );
    let marker = match line.kind {
        LineKind::Delete => "−",
        LineKind::Insert => "+",
        LineKind::Equal | LineKind::Gap => " ",
    };
    ui.label(
        RichText::new(marker)
            .monospace()
            .size(LINE_FONT)
            .color(line_text_color(line.kind, u)),
    );
}

fn paint_readonly_text(
    ui: &mut Ui,
    line: &DiffLine,
    u: &UiVars,
    _full_source: &str,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
) {
    if line.kind == LineKind::Gap || (line.text.is_empty() && line.line_no.is_none()) {
        ui.label(
            RichText::new(" ")
                .monospace()
                .size(LINE_FONT)
                .color(rgb(u.text_muted)),
        );
        return;
    }
    let job = if let Some(n) = line.line_no {
        let start = line_starts.get(n - 1).copied().unwrap_or(0);
        let local = line_spans_for(spans, start, line.text.len());
        let mut job = layout_job_highlighted(
            &line.text,
            &local,
            palette,
            fallback_for_kind(line.kind, u),
        );
        // Never soft-wrap: wrapping would desync left/right row heights.
        job.wrap.max_width = f32::INFINITY;
        job
    } else {
        let mut job = layout_job_highlighted(
            &line.text,
            &[],
            palette,
            fallback_for_kind(line.kind, u),
        );
        job.wrap.max_width = f32::INFINITY;
        job
    };
    // No truncate — cell width is sized to the longest line so ScrollArea can pan.
    ui.label(job);
}

/// Paint one aligned row cell at a fixed height (hunk fill + gutter + body).
fn paint_row_cell(
    ui: &mut Ui,
    width: f32,
    line: &DiffLine,
    u: &UiVars,
    body: impl FnOnce(&mut Ui),
) {
    let fill = line_fill(line.kind, u);
    let (rect, _resp) = ui.allocate_exact_size(
        egui::vec2(width, ROW_HEIGHT),
        egui::Sense::hover(),
    );
    // Never expand clip past the ScrollArea viewport — wide rows must not paint into
    // the sibling pane.
    let clip = rect.intersect(ui.clip_rect());
    ui.painter().with_clip_rect(clip).rect_filled(rect, 0.0, fill);
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    child.set_clip_rect(clip);
    child.spacing_mut().item_spacing.x = 8.0;
    child.add_space(ROW_PAD_X);
    paint_gutter(&mut child, line, u);
    body(&mut child);
}

fn paint_readonly_cell(
    ui: &mut Ui,
    width: f32,
    line: &DiffLine,
    u: &UiVars,
    full_source: &str,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
) {
    paint_row_cell(ui, width, line, u, |ui| {
        paint_readonly_text(ui, line, u, full_source, spans, line_starts, palette);
    });
}

struct EditRowEvent {
    changed: bool,
    split_at: Option<usize>,
    merge: bool,
}

fn paint_editable_cell(
    ui: &mut Ui,
    width: f32,
    line: &mut DiffLine,
    u: &UiVars,
    spans: &[HighlightSpan],
    line_starts: &[usize],
    palette: &HighlightPalette,
    line_id: egui::Id,
) -> EditRowEvent {
    let kind = line.kind;
    let line_no = line.line_no;
    let mut event = EditRowEvent {
        changed: false,
        split_at: None,
        merge: false,
    };
    let fill = line_fill(kind, u);
    let (rect, _resp) = ui.allocate_exact_size(
        egui::vec2(width, ROW_HEIGHT),
        egui::Sense::hover(),
    );
    let clip = rect.intersect(ui.clip_rect());
    ui.painter().with_clip_rect(clip).rect_filled(rect, 0.0, fill);
    let mut child = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    child.set_clip_rect(clip);
    child.spacing_mut().item_spacing.x = 8.0;
    child.add_space(ROW_PAD_X);
    paint_gutter(&mut child, line, u);

    let mut layouter = |ui: &Ui, text: &str, _wrap_width: f32| {
        let local = if let Some(n) = line_no {
            let start = line_starts.get(n - 1).copied().unwrap_or(0);
            line_spans_for(spans, start, text.len())
        } else {
            Vec::new()
        };
        let mut job =
            layout_job_highlighted(text, &local, palette, fallback_for_kind(kind, u));
        job.wrap.max_width = f32::INFINITY;
        ui.fonts(|f| f.layout_job(job))
    };

    let text_w = measure_text_width(&child, &line.text).max(40.0);
    let edit_w = (rect.width() - gutter_chrome_width(&child)).max(text_w);

    let output: TextEditOutput = TextEdit::singleline(&mut line.text)
        .id(line_id)
        .frame(false)
        .margin(egui::Margin::ZERO)
        .desired_width(edit_w)
        .font(monospace_font())
        .text_color(rgb(fallback_for_kind(kind, u)))
        .layouter(&mut layouter)
        .clip_text(false)
        .show(&mut child);

    if output.response.changed() {
        event.changed = true;
    }
    if output.response.has_focus() && child.input(|i| i.key_pressed(Key::Enter)) {
        event.split_at = Some(
            output
                .cursor_range
                .map(|r| r.primary.ccursor.index)
                .unwrap_or_else(|| line.text.chars().count()),
        );
    }
    if output.response.has_focus() && child.input(|i| i.key_pressed(Key::Backspace)) {
        let at_start = output
            .cursor_range
            .map(|r| r.primary.ccursor.index == 0)
            .unwrap_or(false);
        if at_start {
            event.merge = true;
        }
    }
    event
}

fn apply_line_edits(
    lines: &[DiffLine],
    trailing: bool,
    changed: bool,
    split_at: Option<(usize, usize)>,
    merge_at: Option<usize>,
) -> Option<String> {
    if let Some((row_i, cc)) = split_at {
        let text = lines[row_i].text.clone();
        let (left, right) = split_at_char(&text, cc);
        let mut parts: Vec<String> = lines
            .iter()
            .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
            .map(|l| l.text.clone())
            .collect();
        let part_idx = lines[..row_i]
            .iter()
            .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
            .count();
        if part_idx < parts.len() {
            parts[part_idx] = left;
            parts.insert(part_idx + 1, right);
        }
        return Some(join_parts(&parts, trailing));
    }

    if let Some(row_i) = merge_at {
        let mut parts: Vec<String> = lines
            .iter()
            .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
            .map(|l| l.text.clone())
            .collect();
        let part_idx = lines[..row_i]
            .iter()
            .filter(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert))
            .count();
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

pub fn rebuild_buffer_from_lines(lines: &[DiffLine], had_trailing_newline: bool) -> String {
    let parts: Vec<&str> = lines
        .iter()
        .filter(|l| l.kind != LineKind::Gap && l.kind != LineKind::Delete)
        .map(|l| l.text.as_str())
        .collect();
    let mut out = parts.join("\n");
    if had_trailing_newline && !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    // Empty file
    if parts.is_empty() {
        return if had_trailing_newline {
            String::new()
        } else {
            String::new()
        };
    }
    out
}

fn had_trailing_newline(s: &str) -> bool {
    s.ends_with('\n')
}

fn split_at_char(s: &str, char_idx: usize) -> (String, String) {
    match s.char_indices().nth(char_idx) {
        Some((byte_i, _)) => (s[..byte_i].to_string(), s[byte_i..].to_string()),
        None => (s.to_string(), String::new()),
    }
}

fn join_parts(parts: &[String], trailing: bool) -> String {
    let mut out = parts.join("\n");
    if trailing && !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

pub struct DiffWidgetOutcome {
    pub buffer_changed: bool,
}

/// Linked scroll for side-by-side panes (both axes).
#[derive(Clone, Copy, Debug, Default)]
pub struct DiffScroll {
    pub x: f32,
    pub y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl DiffScroll {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

fn max_scroll_axis(content: f32, viewport: f32) -> f32 {
    (content - viewport).max(0.0)
}

fn finish_scroll_maxes(scroll: &mut DiffScroll, max_x: f32, max_y: f32) {
    scroll.max_x = max_x;
    scroll.max_y = max_y;
    if max_x > 0.0 {
        scroll.x = scroll.x.clamp(0.0, max_x);
    } else {
        scroll.x = scroll.x.max(0.0);
    }
    if max_y > 0.0 {
        scroll.y = scroll.y.clamp(0.0, max_y);
    } else {
        scroll.y = scroll.y.max(0.0);
    }
}

/// Show editable Equal/Insert rows (and read-only Delete/Gap). Returns new buffer if changed.
fn show_mixed_rows(
    ui: &mut Ui,
    lines: &mut Vec<DiffLine>,
    u: &UiVars,
    // Source+spans for delete rows (usually original)
    delete_src: &str,
    delete_spans: &[HighlightSpan],
    delete_starts: &[usize],
    // Spans for editable Equal/Insert rows (modified buffer)
    edit_spans: &[HighlightSpan],
    edit_starts: &[usize],
    palette: &HighlightPalette,
    trailing: bool,
    id_prefix: &str,
    scroll_y: f32,
    content_width: f32,
) -> Option<String> {
    let mut changed = false;
    let mut split_at: Option<(usize, usize)> = None;
    let mut merge_at: Option<usize> = None;

    let editable_idxs: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| matches!(l.kind, LineKind::Equal | LineKind::Insert))
        .map(|(i, _)| i)
        .collect();

    ui.set_max_width(ui.available_width());
    let width = content_width;
    let n = lines.len();
    let (first, end) = row_window(scroll_y, ui.clip_rect().height(), n);
    row_spacer(ui, width, first);

    for row_i in first..end {
        let kind = lines[row_i].kind;
        match kind {
            LineKind::Gap | LineKind::Delete => {
                let line = lines[row_i].clone();
                paint_readonly_cell(
                    ui,
                    width,
                    &line,
                    u,
                    delete_src,
                    delete_spans,
                    delete_starts,
                    palette,
                );
            }
            LineKind::Equal | LineKind::Insert => {
                let line_id = egui::Id::new((id_prefix, row_i));
                let event = paint_editable_cell(
                    ui,
                    width,
                    &mut lines[row_i],
                    u,
                    edit_spans,
                    edit_starts,
                    palette,
                    line_id,
                );
                if event.changed {
                    changed = true;
                }
                if let Some(cc) = event.split_at {
                    split_at = Some((row_i, cc));
                }
                if event.merge
                    && editable_idxs
                        .iter()
                        .position(|&i| i == row_i)
                        .is_some_and(|p| p > 0)
                {
                    merge_at = Some(row_i);
                }
            }
        }
    }

    row_spacer(ui, width, n.saturating_sub(end));
    apply_line_edits(lines, trailing, changed, split_at, merge_at)
}

pub fn show_side_by_side(
    ui: &mut Ui,
    u: &UiVars,
    palette: &HighlightPalette,
    path: &str,
    original: &str,
    baseline_modified: &str,
    edit_buffer: Option<&mut String>,
    scroll: &mut DiffScroll,
    cache: &mut DiffViewCache,
) -> DiffWidgetOutcome {
    let editable = edit_buffer.is_some();
    let modified_snapshot = edit_buffer
        .as_ref()
        .map(|b| (*b).clone())
        .unwrap_or_else(|| baseline_modified.to_string());

    cache.ensure(path, original, &modified_snapshot);
    let trailing = cache.trailing;

    let mut right_lines = cache.right_lines.clone();
    let left_lines = &cache.left_lines;
    debug_assert_eq!(left_lines.len(), right_lines.len());

    let mut changed = false;
    let mut split_at: Option<(usize, usize)> = None;
    let mut merge_at: Option<usize> = None;

    let editable_idxs: Vec<usize> = right_lines
        .iter()
        .enumerate()
        .filter(|(_, l)| matches!(l.kind, LineKind::Equal | LineKind::Insert))
        .map(|(i, _)| i)
        .collect();

    let total = ui.available_size();
    let half_w = (total.x * 0.5).max(80.0);
    let label_h = 20.0;
    let viewport_h = (total.y - label_h).max(1.0);
    let content_h = left_lines.len() as f32 * ROW_HEIGHT;
    let est_max_y = (content_h - viewport_h).max(0.0);
    let ceiling_y = scroll.max_y.max(est_max_y);
    let ceiling_x = scroll.max_x;

    let panes_rect = egui::Rect::from_min_size(ui.cursor().min, total);
    if ui.rect_contains_pointer(panes_rect) {
        let delta = ui.input_mut(|i| {
            let d = i.smooth_scroll_delta;
            i.smooth_scroll_delta = egui::Vec2::ZERO;
            d
        });
        if delta != egui::Vec2::ZERO {
            scroll.x = (scroll.x - delta.x).clamp(0.0, ceiling_x.max(0.0));
            scroll.y = (scroll.y - delta.y).clamp(0.0, ceiling_y.max(0.0));
        }
    }

    let offset = egui::vec2(scroll.x, scroll.y);
    let mut measured_max_x = 0.0_f32;
    let mut measured_max_y = 0.0_f32;
    let mut drove = false;

    let shared_w = content_width_from_chars(ui, cache.max_line_chars, half_w);
    let (first, end) = row_window(scroll.y, viewport_h, left_lines.len());

    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;

        ui.allocate_ui_with_layout(
            egui::vec2(half_w, total.y),
            egui::Layout::top_down(egui::Align::Min),
            |ui| {
                egui::Frame::NONE.fill(rgb(u.bg)).show(ui, |ui| {
                    ui.set_min_size(ui.available_size());
                    ui.set_clip_rect(ui.max_rect());
                    ui.label(
                        RichText::new("Original")
                            .small()
                            .color(rgb(u.text_muted)),
                    );
                    let left_out = ScrollArea::both()
                        .id_salt("diff_left")
                        .scroll_offset(offset)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.set_max_width(ui.available_width());
                            ui.spacing_mut().item_spacing.y = 0.0;
                            row_spacer(ui, shared_w, first);
                            for line in &left_lines[first..end] {
                                paint_readonly_cell(
                                    ui,
                                    shared_w,
                                    line,
                                    u,
                                    original,
                                    &cache.left_spans,
                                    &cache.left_starts,
                                    palette,
                                );
                            }
                            row_spacer(ui, shared_w, left_lines.len().saturating_sub(end));
                        });
                    measured_max_x = measured_max_x.max(max_scroll_axis(
                        left_out.content_size.x,
                        left_out.inner_rect.width(),
                    ));
                    measured_max_y = measured_max_y.max(max_scroll_axis(
                        left_out.content_size.y,
                        left_out.inner_rect.height(),
                    ));
                    if (left_out.state.offset - offset).length() > 0.5 {
                        scroll.x = left_out.state.offset.x;
                        scroll.y = left_out.state.offset.y;
                        drove = true;
                    }
                });
            },
        );

        ui.allocate_ui_with_layout(
            egui::vec2(half_w, total.y),
            egui::Layout::top_down(egui::Align::Min),
            |ui| {
                egui::Frame::NONE.fill(rgb(u.bg)).show(ui, |ui| {
                    ui.set_min_size(ui.available_size());
                    ui.set_clip_rect(ui.max_rect());
                    ui.label(
                        RichText::new(if editable {
                            "Working Tree (editable)"
                        } else {
                            "Modified"
                        })
                        .small()
                        .color(rgb(u.text_muted)),
                    );
                    let right_offset = if drove {
                        egui::vec2(scroll.x, scroll.y)
                    } else {
                        offset
                    };
                    let right_out = ScrollArea::both()
                        .id_salt("diff_right")
                        .scroll_offset(right_offset)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.set_max_width(ui.available_width());
                            ui.spacing_mut().item_spacing.y = 0.0;
                            row_spacer(ui, shared_w, first);
                            for row_i in first..end {
                                if editable {
                                    match right_lines[row_i].kind {
                                        LineKind::Gap | LineKind::Delete => {
                                            let line = right_lines[row_i].clone();
                                            paint_readonly_cell(
                                                ui,
                                                shared_w,
                                                &line,
                                                u,
                                                original,
                                                &cache.left_spans,
                                                &cache.left_starts,
                                                palette,
                                            );
                                        }
                                        LineKind::Equal | LineKind::Insert => {
                                            let line_id = egui::Id::new(("sxs_edit", row_i));
                                            let event = paint_editable_cell(
                                                ui,
                                                shared_w,
                                                &mut right_lines[row_i],
                                                u,
                                                &cache.right_spans,
                                                &cache.right_starts,
                                                palette,
                                                line_id,
                                            );
                                            if event.changed {
                                                changed = true;
                                            }
                                            if let Some(cc) = event.split_at {
                                                split_at = Some((row_i, cc));
                                            }
                                            if event.merge
                                                && editable_idxs
                                                    .iter()
                                                    .position(|&i| i == row_i)
                                                    .is_some_and(|p| p > 0)
                                            {
                                                merge_at = Some(row_i);
                                            }
                                        }
                                    }
                                } else {
                                    paint_readonly_cell(
                                        ui,
                                        shared_w,
                                        &right_lines[row_i],
                                        u,
                                        &modified_snapshot,
                                        &cache.right_spans,
                                        &cache.right_starts,
                                        palette,
                                    );
                                }
                            }
                            row_spacer(ui, shared_w, right_lines.len().saturating_sub(end));
                        });
                    measured_max_x = measured_max_x.max(max_scroll_axis(
                        right_out.content_size.x,
                        right_out.inner_rect.width(),
                    ));
                    measured_max_y = measured_max_y.max(max_scroll_axis(
                        right_out.content_size.y,
                        right_out.inner_rect.height(),
                    ));
                    if (right_out.state.offset - right_offset).length() > 0.5 {
                        scroll.x = right_out.state.offset.x;
                        scroll.y = right_out.state.offset.y;
                        drove = true;
                    }
                });
            },
        );
    });

    finish_scroll_maxes(scroll, measured_max_x, measured_max_y);
    if drove {
        ui.ctx().request_repaint();
    }

    let new_buffer = apply_line_edits(&right_lines, trailing, changed, split_at, merge_at);

    let mut buffer_changed = false;
    if let (Some(buf), Some(edit)) = (new_buffer, edit_buffer) {
        if buf != *edit {
            *edit = buf;
            buffer_changed = true;
        }
    }

    DiffWidgetOutcome { buffer_changed }
}

pub fn show_inline(
    ui: &mut Ui,
    u: &UiVars,
    palette: &HighlightPalette,
    path: &str,
    original: &str,
    baseline_modified: &str,
    edit_buffer: Option<&mut String>,
    scroll: &mut DiffScroll,
    cache: &mut DiffViewCache,
) -> DiffWidgetOutcome {
    let editable = edit_buffer.is_some();
    let modified_snapshot = edit_buffer
        .as_ref()
        .map(|b| (*b).clone())
        .unwrap_or_else(|| baseline_modified.to_string());

    cache.ensure(path, original, &modified_snapshot);
    let trailing = cache.trailing;

    if editable {
        ui.label(
            RichText::new("Working Tree (editable)")
                .small()
                .color(rgb(u.text_muted)),
        );
    }

    let content_w = content_width_from_chars(ui, cache.max_line_chars, ui.available_width());
    let mut new_buffer: Option<String> = None;
    let out = ScrollArea::both()
        .id_salt("diff_inline")
        .scroll_offset(egui::vec2(scroll.x, scroll.y))
        .auto_shrink([false, false])
        .show(ui, |ui| {
            ui.set_clip_rect(ui.clip_rect());
            ui.set_max_width(ui.available_width());
            ui.spacing_mut().item_spacing.y = 0.0;
            if editable {
                let mut lines = cache.unified_lines.clone();
                if let Some(buf) = show_mixed_rows(
                    ui,
                    &mut lines,
                    u,
                    original,
                    &cache.left_spans,
                    &cache.left_starts,
                    &cache.right_spans,
                    &cache.right_starts,
                    palette,
                    trailing,
                    "inline_edit",
                    scroll.y,
                    content_w,
                ) {
                    new_buffer = Some(buf);
                }
            } else {
                let n = cache.unified_lines.len();
                let (first, end) = row_window(scroll.y, ui.clip_rect().height(), n);
                row_spacer(ui, content_w, first);
                for line in &cache.unified_lines[first..end] {
                    let (src, spans, starts) = match line.kind {
                        LineKind::Delete => {
                            (original, &cache.left_spans as &[_], &cache.left_starts as &[_])
                        }
                        _ => (
                            modified_snapshot.as_str(),
                            &cache.right_spans as &[_],
                            &cache.right_starts as &[_],
                        ),
                    };
                    paint_readonly_cell(ui, content_w, line, u, src, spans, starts, palette);
                }
                row_spacer(ui, content_w, n.saturating_sub(end));
            }
        });
    scroll.x = out.state.offset.x;
    scroll.y = out.state.offset.y;
    finish_scroll_maxes(
        scroll,
        max_scroll_axis(out.content_size.x, out.inner_rect.width()),
        max_scroll_axis(out.content_size.y, out.inner_rect.height()),
    );

    let mut buffer_changed = false;
    if let (Some(buf), Some(edit)) = (new_buffer, edit_buffer) {
        if buf != *edit {
            *edit = buf;
            buffer_changed = true;
        }
    }

    DiffWidgetOutcome { buffer_changed }
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
        // Replace of equal length pairs delete↔insert without gap rows
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

    #[test]
    fn finish_scroll_clamps_both_axes() {
        let mut scroll = DiffScroll {
            x: 80.0,
            y: 150.0,
            ..DiffScroll::default()
        };
        finish_scroll_maxes(&mut scroll, 50.0, 200.0);
        assert!((scroll.x - 50.0).abs() < 0.01);
        assert!((scroll.y - 150.0).abs() < 0.01);
        assert!((scroll.max_x - 50.0).abs() < 0.01);
        assert!((scroll.max_y - 200.0).abs() < 0.01);
    }

    #[test]
    fn finish_scroll_does_not_wipe_when_max_unknown() {
        let mut scroll = DiffScroll {
            x: 10.0,
            y: 40.0,
            ..DiffScroll::default()
        };
        finish_scroll_maxes(&mut scroll, 0.0, 0.0);
        assert!((scroll.x - 10.0).abs() < 0.01);
        assert!((scroll.y - 40.0).abs() < 0.01);
    }

    #[test]
    fn max_scroll_axis_non_negative() {
        assert!((max_scroll_axis(100.0, 40.0) - 60.0).abs() < 0.01);
        assert!((max_scroll_axis(40.0, 100.0) - 0.0).abs() < 0.01);
    }

    #[test]
    fn row_window_respects_bounds() {
        let (first, end) = row_window(0.0, 100.0, 1000);
        assert_eq!(first, 0);
        assert!(end > first);
        assert!(end <= 1000);

        let (first, end) = row_window(500.0, 40.0, 100);
        assert!(first < end);
        assert!(end <= 100);
    }

    #[test]
    fn diff_cache_skips_rebuild_on_hit() {
        let mut cache = DiffViewCache::default();
        cache.ensure("a.rs", "fn a() {}\n", "fn a() {}\nfn b() {}\n");
        let spans_ptr = cache.right_spans.as_ptr();
        let n = cache.right_lines.len();
        cache.ensure("a.rs", "fn a() {}\n", "fn a() {}\nfn b() {}\n");
        assert_eq!(cache.right_lines.len(), n);
        assert_eq!(cache.right_spans.as_ptr(), spans_ptr);

        cache.ensure("a.rs", "fn a() {}\n", "fn a() {}\nfn b() {}\nfn c() {}\n");
        assert_ne!(cache.right_spans.as_ptr(), spans_ptr);
    }
}
