//! Diff pane: side-by-side / inline, linked scroll, minimap, editable unstaged lines.
//! Manual scroll + row virtualization so wheel events re-render the visible window.

use std::cell::Cell;
use std::ops::Range;
use std::rc::Rc;

use conflicto_core::{
    apply_line_edits, get_theme, highlight_color, DiffLine, DiffViewCache, HighlightPalette,
    LineHighlights, LineKind, UiVars, DEFAULT_THEME_ID,
};
use gpui::prelude::*;
use gpui::*;

use super::minimap::{self, MINIMAP_W, ROW_HEIGHT};
use crate::color::{hsla3, rgb3, tint};

pub struct DiffPane {
    pub cache: DiffViewCache,
    pub side_by_side: bool,
    pub editable: bool,
    pub edit_buffer: String,
    pub path: String,
    pub original: String,
    pub baseline_modified: String,
    pub ui: UiVars,
    pub palette: HighlightPalette,
    pub focus_handle: FocusHandle,
    pub focused_row: Option<usize>,
    pub cursor: usize,
    /// Document scroll offset in pixels (manual — drives virtualization).
    pub scroll_y: f32,
    viewport_h: Rc<Cell<f32>>,
    minimap_bounds: Rc<Cell<Bounds<Pixels>>>,
}

pub enum DiffPaneEvent {
    BufferChanged(String),
}

impl DiffPane {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let pack = get_theme(DEFAULT_THEME_ID);
        Self {
            cache: DiffViewCache::default(),
            side_by_side: true,
            editable: false,
            edit_buffer: String::new(),
            path: String::new(),
            original: String::new(),
            baseline_modified: String::new(),
            ui: pack.ui.clone(),
            palette: HighlightPalette::from_ui(&pack.ui, pack.scheme),
            focus_handle: cx.focus_handle(),
            focused_row: None,
            cursor: 0,
            scroll_y: 0.0,
            viewport_h: Rc::new(Cell::new(400.0)),
            minimap_bounds: Rc::new(Cell::new(Bounds::default())),
        }
    }

    pub fn bind(
        &mut self,
        path: &str,
        original: &str,
        baseline_modified: &str,
        edit_buffer: Option<&str>,
        editable: bool,
        side_by_side: bool,
        ui: &UiVars,
        palette: &HighlightPalette,
    ) {
        let path_changed = self.path != path;
        self.path = path.to_string();
        self.original = original.to_string();
        self.baseline_modified = baseline_modified.to_string();
        self.editable = editable;
        self.side_by_side = side_by_side;
        self.ui = ui.clone();
        self.palette = palette.clone();
        if let Some(buf) = edit_buffer {
            if self.edit_buffer != buf {
                self.edit_buffer = buf.to_string();
            }
        } else {
            self.edit_buffer = baseline_modified.to_string();
        }
        self.cache.ensure(path, original, &self.edit_buffer);
        if path_changed {
            self.scroll_y = 0.0;
            self.focused_row = None;
            self.cursor = 0;
        }
        self.clamp_scroll();
    }

    fn row_count(&self) -> usize {
        if self.side_by_side {
            self.cache.left_lines.len()
        } else {
            self.cache.unified_lines.len()
        }
    }

    fn content_h(&self) -> f32 {
        (self.row_count() as f32 * ROW_HEIGHT).max(1.0)
    }

    fn max_scroll_y(&self) -> f32 {
        (self.content_h() - self.viewport_h.get().max(1.0)).max(0.0)
    }

    fn clamp_scroll(&mut self) {
        let max = self.max_scroll_y();
        self.scroll_y = self.scroll_y.clamp(0.0, max);
    }

    fn commit_lines(
        &mut self,
        cx: &mut Context<Self>,
        changed: bool,
        split: Option<(usize, usize)>,
        merge: Option<usize>,
    ) {
        let lines = if self.side_by_side {
            &self.cache.right_lines
        } else {
            &self.cache.unified_lines
        };
        if let Some(new_buf) = apply_line_edits(lines, self.cache.trailing, changed, split, merge)
        {
            self.edit_buffer = new_buf.clone();
            self.cache
                .ensure(&self.path, &self.original, &self.edit_buffer);
            cx.emit(DiffPaneEvent::BufferChanged(new_buf));
            cx.notify();
        }
    }

    fn on_scroll_wheel(
        &mut self,
        event: &ScrollWheelEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let delta = event.delta.pixel_delta(px(ROW_HEIGHT));
        self.scroll_y = (self.scroll_y - f32::from(delta.y)).clamp(0.0, self.max_scroll_y());
        cx.notify();
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        if !self.editable {
            return;
        }
        let Some(row) = self.focused_row else {
            return;
        };
        let lines = if self.side_by_side {
            &mut self.cache.right_lines
        } else {
            &mut self.cache.unified_lines
        };
        if row >= lines.len() {
            return;
        }
        if !matches!(lines[row].kind, LineKind::Equal | LineKind::Insert) {
            return;
        }

        let key = &event.keystroke.key;
        if key == "enter" {
            let cc = self.cursor;
            self.commit_lines(cx, false, Some((row, cc)), None);
            self.focused_row = Some(row + 1);
            self.cursor = 0;
            return;
        }
        if key == "backspace" {
            if self.cursor == 0 {
                let can_merge = lines[..row]
                    .iter()
                    .any(|l| matches!(l.kind, LineKind::Equal | LineKind::Insert));
                if can_merge {
                    self.commit_lines(cx, false, None, Some(row));
                }
            } else {
                let text = &mut lines[row].text;
                if let Some((byte_i, _)) = text.char_indices().nth(self.cursor - 1) {
                    let end = text
                        .char_indices()
                        .nth(self.cursor)
                        .map(|(i, _)| i)
                        .unwrap_or(text.len());
                    text.replace_range(byte_i..end, "");
                    self.cursor -= 1;
                    self.commit_lines(cx, true, None, None);
                }
            }
            return;
        }
        if key.len() == 1
            && !event.keystroke.modifiers.control
            && !event.keystroke.modifiers.platform
        {
            let ch = key.chars().next().unwrap();
            if !ch.is_control() {
                let text = &mut lines[row].text;
                let byte_i = text
                    .char_indices()
                    .nth(self.cursor)
                    .map(|(i, _)| i)
                    .unwrap_or(text.len());
                text.insert(byte_i, ch);
                self.cursor += 1;
                self.commit_lines(cx, true, None, None);
            }
        }
    }
}

impl EventEmitter<DiffPaneEvent> for DiffPane {}

impl Focusable for DiffPane {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for DiffPane {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let u = self.ui.clone();
        let side_by_side = self.side_by_side;
        let editable = self.editable;
        let focused_row = self.focused_row;
        let cursor = self.cursor;
        let palette = self.palette.clone();
        let left = self.cache.left_lines.clone();
        let right = self.cache.right_lines.clone();
        let unified = self.cache.unified_lines.clone();
        let left_hls = self.cache.left_line_hls.clone();
        let right_hls = self.cache.right_line_hls.clone();
        let unified_hls = self.cache.unified_line_hls.clone();
        let path = self.path.clone();
        let viewport_h = self.viewport_h.clone();
        let minimap_bounds = self.minimap_bounds.clone();

        let row_count = if side_by_side {
            left.len()
        } else {
            unified.len()
        };
        let content_h = (row_count as f32 * ROW_HEIGHT).max(1.0);
        let vh = viewport_h.get().max(1.0);
        let max_y = (content_h - vh).max(0.0);
        let scroll_y = self.scroll_y.clamp(0.0, max_y);
        let (first, end) = row_window(scroll_y, vh, row_count);
        let marker_lines = if side_by_side {
            minimap::sxs_marker_lines(&left, &right)
        } else {
            unified.clone()
        };
        let ui_for_map = u.clone();

        div()
            .id("diff-pane")
            .track_focus(&self.focus_handle)
            .flex()
            .flex_col()
            .size_full()
            .bg(rgb3(u.bg))
            .text_color(rgb3(u.text))
            .font_family("Menlo")
            .text_sm()
            .on_key_down(cx.listener(Self::on_key_down))
            .child(
                div()
                    .flex()
                    .h(px(28.))
                    .items_center()
                    .px_3()
                    .bg(rgb3(u.bg_surface))
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb3(u.text_muted))
                            .child(if path.is_empty() {
                                SharedString::from("Select a file to diff")
                            } else {
                                SharedString::from(path)
                            }),
                    )
                    .when(editable, |el| {
                        el.child(
                            div()
                                .ml_2()
                                .text_xs()
                                .text_color(rgb3(u.accent))
                                .child("editable"),
                        )
                    }),
            )
            .child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .w_full()
                    .child(
                        div()
                            .id("diff-viewport")
                            .flex_1()
                            .min_w_0()
                            .min_h_0()
                            .h_full()
                            .overflow_hidden()
                            .on_scroll_wheel(cx.listener(Self::on_scroll_wheel))
                            .child({
                                let vh_cell = viewport_h.clone();
                                canvas(
                                    move |bounds, _, _| {
                                        // Only the editor viewport owns scroll metrics.
                                        vh_cell.set(f32::from(bounds.size.height));
                                    },
                                    |_bounds, _, _, _| {},
                                )
                                .absolute()
                                .size_full()
                            })
                            .child(
                                div()
                                    .w_full()
                                    .h_full()
                                    .relative()
                                    .child(
                                        div()
                                            .absolute()
                                            .top(px(first as f32 * ROW_HEIGHT - scroll_y))
                                            .left_0()
                                            .right_0()
                                            .child(if side_by_side {
                                                sxs_content(
                                                    &left[first..end],
                                                    &right[first..end],
                                                    &left_hls[first..end.min(left_hls.len())],
                                                    &right_hls[first..end.min(right_hls.len())],
                                                    first,
                                                    &u,
                                                    &palette,
                                                    editable,
                                                    focused_row,
                                                    cursor,
                                                    cx,
                                                )
                                                .into_any_element()
                                            } else {
                                                inline_content(
                                                    &unified[first..end],
                                                    &unified_hls[first..end.min(unified_hls.len())],
                                                    first,
                                                    &u,
                                                    &palette,
                                                    editable,
                                                    focused_row,
                                                    cursor,
                                                    cx,
                                                )
                                                .into_any_element()
                                            }),
                                    ),
                            ),
                    )
                    .child({
                        let markers = marker_lines;
                        let mb = minimap_bounds.clone();
                        div()
                            .id("minimap")
                            .w(px(MINIMAP_W))
                            .h_full()
                            .flex_shrink_0()
                            .cursor_pointer()
                            .child(
                                canvas(
                                    {
                                        let mb = mb.clone();
                                        move |bounds, _, _| {
                                            mb.set(bounds);
                                            bounds
                                        }
                                    },
                                    {
                                        let ui_for_map = ui_for_map.clone();
                                        move |bounds, _, window, _| {
                                            minimap::paint_minimap(
                                                window,
                                                bounds,
                                                &ui_for_map,
                                                &markers,
                                                scroll_y,
                                                vh,
                                            );
                                        }
                                    },
                                )
                                .size_full(),
                            )
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(move |this, event: &MouseDownEvent, _window, cx| {
                                    let bounds = this.minimap_bounds.get();
                                    let n = this.row_count();
                                    let vh = this.viewport_h.get().max(1.0);
                                    this.scroll_y = minimap::scroll_y_from_minimap_click(
                                        bounds,
                                        event.position.y,
                                        n,
                                        vh,
                                    );
                                    cx.notify();
                                }),
                            )
                    }),
            )
    }
}

fn row_window(scroll_y: f32, viewport_h: f32, row_count: usize) -> (usize, usize) {
    const OVERSCAN: usize = 12;
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

fn sxs_content(
    left: &[DiffLine],
    right: &[DiffLine],
    left_hls: &[LineHighlights],
    right_hls: &[LineHighlights],
    index_offset: usize,
    u: &UiVars,
    palette: &HighlightPalette,
    editable: bool,
    focused_row: Option<usize>,
    cursor: usize,
    cx: &mut Context<DiffPane>,
) -> impl IntoElement {
    let n = left.len().min(right.len());
    div()
        .flex()
        .flex_row()
        .w_full()
        .child(pane_column(
            "left",
            &left[..n],
            &left_hls[..n.min(left_hls.len())],
            index_offset,
            u,
            palette,
            false,
            None,
            0,
            cx,
        ))
        .child(div().w(px(1.)).bg(rgb3(u.border)))
        .child(pane_column(
            "right",
            &right[..n],
            &right_hls[..n.min(right_hls.len())],
            index_offset,
            u,
            palette,
            editable,
            focused_row,
            cursor,
            cx,
        ))
}

fn inline_content(
    lines: &[DiffLine],
    hls: &[LineHighlights],
    index_offset: usize,
    u: &UiVars,
    palette: &HighlightPalette,
    editable: bool,
    focused_row: Option<usize>,
    cursor: usize,
    cx: &mut Context<DiffPane>,
) -> impl IntoElement {
    pane_column(
        "inline",
        lines,
        hls,
        index_offset,
        u,
        palette,
        editable,
        focused_row,
        cursor,
        cx,
    )
}

fn pane_column(
    id: &'static str,
    lines: &[DiffLine],
    line_hls: &[LineHighlights],
    index_offset: usize,
    u: &UiVars,
    palette: &HighlightPalette,
    editable: bool,
    focused_row: Option<usize>,
    cursor: usize,
    cx: &mut Context<DiffPane>,
) -> impl IntoElement {
    let u = u.clone();
    let palette = palette.clone();
    let lines = lines.to_vec();
    let line_hls = line_hls.to_vec();

    div()
        .id(id)
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .children(lines.into_iter().enumerate().map(|(local_i, line)| {
            let i = index_offset + local_i;
            let bg = hunk_bg_static(&u, line.kind);
            let is_focus = focused_row == Some(i);
            let can_edit_row =
                editable && matches!(line.kind, LineKind::Equal | LineKind::Insert);
            let gutter = line
                .line_no
                .map(|n| format!("{n:>4}"))
                .unwrap_or_else(|| "    ".into());
            let text = line.text.clone();
            let highlights = cached_highlights(line_hls.get(local_i), &text, &palette);

            div()
                .id((id, i))
                .flex()
                .flex_row()
                .flex_shrink_0()
                .h(px(ROW_HEIGHT))
                .w_full()
                .bg(rgb3(bg))
                .when(is_focus, |el| el.border_l_2().border_color(rgb3(u.accent)))
                .when(can_edit_row, |el| {
                    el.cursor_text().on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, _e, window, cx| {
                            this.focused_row = Some(i);
                            this.cursor = this
                                .cache
                                .right_lines
                                .get(i)
                                .map(|l| l.text.chars().count())
                                .unwrap_or(0);
                            window.focus(&this.focus_handle);
                            cx.notify();
                        }),
                    )
                })
                .child(
                    div()
                        .w(px(44.))
                        .px_1()
                        .text_color(rgb3(u.text_muted))
                        .font_family("Menlo")
                        .child(gutter),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .px_1()
                        .overflow_hidden()
                        .child({
                            let display = if is_focus && can_edit_row {
                                let mut t = text.clone();
                                let byte = t
                                    .char_indices()
                                    .nth(cursor)
                                    .map(|(b, _)| b)
                                    .unwrap_or(t.len());
                                t.insert(byte, '│');
                                t
                            } else if text.is_empty() {
                                " ".into()
                            } else {
                                text
                            };
                            StyledText::new(display).with_highlights(highlights)
                        }),
                )
        }))
}

fn hunk_bg_static(u: &UiVars, kind: LineKind) -> [u8; 3] {
    match kind {
        LineKind::Delete => tint(u.bg, u.status_d, 0.22),
        LineKind::Insert => tint(u.bg, u.status_a, 0.22),
        LineKind::Gap => tint(u.bg, u.text_muted, 0.08),
        LineKind::Equal => u.bg,
    }
}

fn cached_highlights(
    hls: Option<&LineHighlights>,
    text: &str,
    palette: &HighlightPalette,
) -> Vec<(Range<usize>, HighlightStyle)> {
    let Some(hls) = hls else {
        return Vec::new();
    };
    hls.iter()
        .filter(|(range, _)| {
            range.end <= text.len()
                && text.is_char_boundary(range.start)
                && text.is_char_boundary(range.end)
        })
        .map(|(range, kind)| {
            (
                range.clone(),
                HighlightStyle::from(hsla3(highlight_color(*kind, palette))),
            )
        })
        .collect()
}
