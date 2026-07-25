use conflicto_core::{
    apply_line_edits, DiffLine, HighlightPalette, HighlightSpan, LineKind, UiVars,
};
use egui::{RichText, ScrollArea, Ui};

use super::cache::DiffViewCache;
use super::edit::{rgb, write_back_edit, RowEditPass};
use super::paint::{paint_editable_cell, paint_readonly_cell};
use super::scroll::{
    content_width_from_chars, finish_scroll_maxes, row_spacer, row_window, sync_linked_scroll,
    DiffScroll,
};

pub struct DiffWidgetOutcome {
    pub buffer_changed: bool,
}

fn snapshot_modified(edit_buffer: Option<&String>, baseline: &str) -> String {
    edit_buffer
        .cloned()
        .unwrap_or_else(|| baseline.to_string())
}

/// Show editable Equal/Insert rows (and read-only Delete/Gap). Returns new buffer if changed.
pub fn show_mixed_rows(
    ui: &mut Ui,
    lines: &mut Vec<DiffLine>,
    u: &UiVars,
    delete_spans: &[HighlightSpan],
    delete_starts: &[usize],
    edit_spans: &[HighlightSpan],
    edit_starts: &[usize],
    palette: &HighlightPalette,
    trailing: bool,
    id_prefix: &str,
    scroll_y: f32,
    content_width: f32,
) -> Option<String> {
    let mut pass = RowEditPass::default();

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
                let can_merge = editable_idxs
                    .iter()
                    .position(|&i| i == row_i)
                    .is_some_and(|p| p > 0);
                pass.absorb(row_i, event, can_merge);
            }
        }
    }

    row_spacer(ui, width, n.saturating_sub(end));
    apply_line_edits(
        lines,
        trailing,
        pass.changed,
        pass.split_at,
        pass.merge_at,
    )
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
    let modified_snapshot = snapshot_modified(edit_buffer.as_deref(), baseline_modified);

    cache.ensure(path, original, &modified_snapshot);
    let trailing = cache.trailing;

    let left_lines = &cache.left_lines;
    debug_assert_eq!(left_lines.len(), cache.right_lines.len());

    let total = ui.available_size();
    let half_w = (total.x * 0.5).max(80.0);
    let label_h = 20.0;
    let viewport_h = (total.y - label_h).max(1.0);
    let content_h = left_lines.len() as f32 * super::scroll::ROW_HEIGHT;
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
    let mut new_buffer: Option<String> = None;

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
                                    &cache.left_spans,
                                    &cache.left_starts,
                                    palette,
                                );
                            }
                            row_spacer(ui, shared_w, left_lines.len().saturating_sub(end));
                        });
                    if sync_linked_scroll(
                        scroll,
                        left_out.state.offset,
                        offset,
                        left_out.content_size,
                        left_out.inner_rect,
                        &mut measured_max_x,
                        &mut measured_max_y,
                    ) {
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
                            if editable {
                                let mut right_lines = cache.right_lines.clone();
                                if let Some(buf) = show_mixed_rows(
                                    ui,
                                    &mut right_lines,
                                    u,
                                    &cache.left_spans,
                                    &cache.left_starts,
                                    &cache.right_spans,
                                    &cache.right_starts,
                                    palette,
                                    trailing,
                                    "sxs_edit",
                                    scroll.y,
                                    shared_w,
                                ) {
                                    new_buffer = Some(buf);
                                }
                            } else {
                                row_spacer(ui, shared_w, first);
                                for line in &cache.right_lines[first..end] {
                                    paint_readonly_cell(
                                        ui,
                                        shared_w,
                                        line,
                                        u,
                                        &cache.right_spans,
                                        &cache.right_starts,
                                        palette,
                                    );
                                }
                                row_spacer(
                                    ui,
                                    shared_w,
                                    cache.right_lines.len().saturating_sub(end),
                                );
                            }
                        });
                    if sync_linked_scroll(
                        scroll,
                        right_out.state.offset,
                        right_offset,
                        right_out.content_size,
                        right_out.inner_rect,
                        &mut measured_max_x,
                        &mut measured_max_y,
                    ) {
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

    DiffWidgetOutcome {
        buffer_changed: write_back_edit(edit_buffer, new_buffer),
    }
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
    let modified_snapshot = snapshot_modified(edit_buffer.as_deref(), baseline_modified);

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
                    let (spans, starts) = match line.kind {
                        LineKind::Delete => (&cache.left_spans as &[_], &cache.left_starts as &[_]),
                        _ => (&cache.right_spans as &[_], &cache.right_starts as &[_]),
                    };
                    paint_readonly_cell(ui, content_w, line, u, spans, starts, palette);
                }
                row_spacer(ui, content_w, n.saturating_sub(end));
            }
        });
    scroll.x = out.state.offset.x;
    scroll.y = out.state.offset.y;
    finish_scroll_maxes(
        scroll,
        super::scroll::max_scroll_axis(out.content_size.x, out.inner_rect.width()),
        super::scroll::max_scroll_axis(out.content_size.y, out.inner_rect.height()),
    );

    DiffWidgetOutcome {
        buffer_changed: write_back_edit(edit_buffer, new_buffer),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use conflicto_core::{join_parts, rebuild_buffer_from_lines, split_at_char, LineKind};

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
        assert!((crate::diff_widget::scroll::max_scroll_axis(100.0, 40.0) - 60.0).abs() < 0.01);
        assert!((crate::diff_widget::scroll::max_scroll_axis(40.0, 100.0) - 0.0).abs() < 0.01);
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

    #[test]
    fn rebuild_still_works_from_core() {
        let lines = vec![
            DiffLine {
                text: "keep".into(),
                kind: LineKind::Equal,
                line_no: Some(1),
            },
            DiffLine {
                text: "add".into(),
                kind: LineKind::Insert,
                line_no: Some(2),
            },
        ];
        assert_eq!(rebuild_buffer_from_lines(&lines, true), "keep\nadd\n");
        let (l, r) = split_at_char("hello", 2);
        assert_eq!(l, "he");
        assert_eq!(r, "llo");
        assert_eq!(
            join_parts(&["he".into(), "llo".into()], true),
            "he\nllo\n"
        );
    }
}
