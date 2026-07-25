//! Diff pane: side-by-side / inline, linked scroll, minimap, editable unstaged lines.
//! Manual scroll + row virtualization so wheel events re-render the visible window.
//! Sticky line-number gutters stay fixed while text scrolls horizontally.

use std::cell::Cell;
use std::ops::Range;
use std::rc::Rc;
use std::time::Duration;

use conflicto_core::{
    apply_line_edits, get_theme, highlight_color, DiffLine, DiffViewCache, HighlightPalette,
    LineHighlights, LineKind, UiVars, DEFAULT_THEME_ID,
};
use gpui::prelude::*;
use gpui::*;

use super::minimap::{self, MINIMAP_W, ROW_HEIGHT};
use crate::color::{hsla3, rgb3, tint};

const GUTTER_W: f32 = 44.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Caret {
    row: usize,
    col: usize,
}

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
    /// Primary caret (also selection end).
    primary: Option<Caret>,
    /// Selection anchor; equals primary when collapsed.
    sel_anchor: Option<Caret>,
    /// Additional carets (Alt+click). Edits apply to all carets on a line when possible.
    extra_carets: Vec<Caret>,
    /// Document scroll offset in pixels (manual — drives virtualization).
    pub scroll_y: f32,
    /// Horizontal text scroll; gutters stay fixed.
    pub scroll_x: f32,
    viewport_h: Rc<Cell<f32>>,
    viewport_w: Rc<Cell<f32>>,
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
            primary: None,
            sel_anchor: None,
            extra_carets: Vec::new(),
            scroll_y: 0.0,
            scroll_x: 0.0,
            viewport_h: Rc::new(Cell::new(400.0)),
            viewport_w: Rc::new(Cell::new(600.0)),
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
            self.scroll_x = 0.0;
            self.primary = None;
            self.sel_anchor = None;
            self.extra_carets.clear();
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

    fn edit_lines(&self) -> &[DiffLine] {
        if self.side_by_side {
            &self.cache.right_lines
        } else {
            &self.cache.unified_lines
        }
    }

    fn edit_lines_mut(&mut self) -> &mut Vec<DiffLine> {
        if self.side_by_side {
            &mut self.cache.right_lines
        } else {
            &mut self.cache.unified_lines
        }
    }

    fn content_h(&self) -> f32 {
        (self.row_count() as f32 * ROW_HEIGHT).max(1.0)
    }

    fn max_scroll_y(&self) -> f32 {
        (self.content_h() - self.viewport_h.get().max(1.0)).max(0.0)
    }

    fn max_scroll_x(&self) -> f32 {
        // Soft cap; long lines can scroll a few screens of monospace text.
        let approx = self
            .edit_lines()
            .iter()
            .map(|l| l.text.chars().count())
            .max()
            .unwrap_or(0) as f32
            * 7.5;
        let view = (self.viewport_w.get() - GUTTER_W).max(1.0);
        (approx - view).max(0.0)
    }

    fn clamp_scroll(&mut self) {
        self.scroll_y = self.scroll_y.clamp(0.0, self.max_scroll_y());
        self.scroll_x = self.scroll_x.clamp(0.0, self.max_scroll_x());
    }

    fn set_caret(&mut self, caret: Caret, extend: bool) {
        self.primary = Some(caret);
        if !extend {
            self.sel_anchor = Some(caret);
        } else if self.sel_anchor.is_none() {
            self.sel_anchor = Some(caret);
        }
    }

    fn commit_lines(
        &mut self,
        cx: &mut Context<Self>,
        changed: bool,
        split: Option<(usize, usize)>,
        merge: Option<usize>,
    ) {
        let lines = self.edit_lines();
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
        if event.modifiers.shift {
            self.scroll_x = (self.scroll_x - f32::from(delta.y)).clamp(0.0, self.max_scroll_x());
        } else {
            self.scroll_y = (self.scroll_y - f32::from(delta.y)).clamp(0.0, self.max_scroll_y());
            self.scroll_x = (self.scroll_x - f32::from(delta.x)).clamp(0.0, self.max_scroll_x());
        }
        cx.notify();
    }

    fn select_all(&mut self, cx: &mut Context<Self>) {
        let lines = self.edit_lines();
        if lines.is_empty() {
            return;
        }
        let last = lines.len() - 1;
        let last_col = lines[last].text.chars().count();
        self.sel_anchor = Some(Caret { row: 0, col: 0 });
        self.primary = Some(Caret {
            row: last,
            col: last_col,
        });
        self.extra_carets.clear();
        cx.notify();
    }

    fn copy_selection(&self, cx: &mut Context<Self>) {
        let Some(text) = self.selected_text() else {
            return;
        };
        cx.write_to_clipboard(ClipboardItem::new_string(text));
    }

    fn selected_text(&self) -> Option<String> {
        let (Some(a), Some(b)) = (self.sel_anchor, self.primary) else {
            return None;
        };
        if a == b {
            return None;
        }
        let lines = self.edit_lines();
        let (start, end) = if (a.row, a.col) <= (b.row, b.col) {
            (a, b)
        } else {
            (b, a)
        };
        if start.row == end.row {
            let line = &lines.get(start.row)?.text;
            let s = char_byte(line, start.col);
            let e = char_byte(line, end.col);
            return Some(line[s..e].to_string());
        }
        let mut out = String::new();
        for row in start.row..=end.row {
            let line = &lines.get(row)?.text;
            if row == start.row {
                out.push_str(&line[char_byte(line, start.col)..]);
                out.push('\n');
            } else if row == end.row {
                out.push_str(&line[..char_byte(line, end.col)]);
            } else {
                out.push_str(line);
                out.push('\n');
            }
        }
        Some(out)
    }

    fn delete_selection(&mut self) -> bool {
        let (Some(a), Some(b)) = (self.sel_anchor, self.primary) else {
            return false;
        };
        if a == b {
            return false;
        }
        let (start, end) = if (a.row, a.col) <= (b.row, b.col) {
            (a, b)
        } else {
            (b, a)
        };
        // Restrict to single-line delete for edit-buffer integrity; multi-line → join via buffer rebuild.
        if start.row == end.row {
            let lines = self.edit_lines_mut();
            if start.row >= lines.len() {
                return false;
            }
            if !matches!(lines[start.row].kind, LineKind::Equal | LineKind::Insert) {
                return false;
            }
            let text = &mut lines[start.row].text;
            let s = char_byte(text, start.col);
            let e = char_byte(text, end.col);
            text.replace_range(s..e, "");
            self.primary = Some(start);
            self.sel_anchor = Some(start);
            self.extra_carets.clear();
            return true;
        }
        // Multi-line: replace selected span with empty by rebuilding from selected_text removal.
        let Some(selected) = self.selected_text() else {
            return false;
        };
        let buffer = self.edit_buffer.clone();
        if let Some(pos) = buffer.find(&selected) {
            let mut new_buf = buffer;
            new_buf.replace_range(pos..pos + selected.len(), "");
            self.edit_buffer = new_buf;
            self.cache
                .ensure(&self.path, &self.original, &self.edit_buffer);
            self.primary = Some(Caret {
                row: start.row,
                col: start.col,
            });
            self.sel_anchor = self.primary;
            self.extra_carets.clear();
            return true;
        }
        false
    }

    fn paste(&mut self, cx: &mut Context<Self>) {
        if !self.editable {
            return;
        }
        let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) else {
            return;
        };
        let first_line = text.lines().next().unwrap_or("").to_string();
        if self.delete_selection() {
            // already mutated lines or buffer
        }
        let Some(caret) = self.primary else {
            return;
        };
        let lines = self.edit_lines_mut();
        if caret.row >= lines.len() {
            return;
        }
        if !matches!(lines[caret.row].kind, LineKind::Equal | LineKind::Insert) {
            return;
        }
        let text_ref = &mut lines[caret.row].text;
        let byte = char_byte(text_ref, caret.col);
        text_ref.insert_str(byte, &first_line);
        let n = first_line.chars().count();
        self.primary = Some(Caret {
            row: caret.row,
            col: caret.col + n,
        });
        self.sel_anchor = self.primary;
        self.commit_lines(cx, true, None, None);
    }

    fn cut(&mut self, cx: &mut Context<Self>) {
        if !self.editable {
            self.copy_selection(cx);
            return;
        }
        self.copy_selection(cx);
        if self.delete_selection() {
            // If multi-line path already rebuilt buffer:
            if self.cache.right_lines.is_empty() && self.cache.unified_lines.is_empty() {
                // unreachable normally
            }
            cx.emit(DiffPaneEvent::BufferChanged(self.edit_buffer.clone()));
            self.commit_lines(cx, true, None, None);
        }
    }

    fn all_carets(&self) -> Vec<Caret> {
        let mut out = Vec::new();
        if let Some(p) = self.primary {
            out.push(p);
        }
        for c in &self.extra_carets {
            if !out.contains(c) {
                out.push(*c);
            }
        }
        out.sort_by(|a, b| b.row.cmp(&a.row).then(b.col.cmp(&a.col)));
        out
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let key = event.keystroke.key.as_str();
        let mods = &event.keystroke.modifiers;
        let chord = mods.control || mods.platform;
        let shift = mods.shift;

        if chord {
            match key {
                "a" => {
                    self.select_all(cx);
                    return;
                }
                "c" => {
                    self.copy_selection(cx);
                    return;
                }
                "x" => {
                    self.cut(cx);
                    return;
                }
                "v" => {
                    self.paste(cx);
                    return;
                }
                _ => return,
            }
        }

        if !self.editable {
            // Allow copy/select-all above; navigation still useful for selection.
            if matches!(key, "left" | "right" | "up" | "down" | "home" | "end") {
                // fall through with read-only caret moves if we have a caret
            } else {
                return;
            }
        }

        let Some(caret) = self.primary else {
            return;
        };

        if key == "left" {
            let mut c = caret;
            if c.col > 0 {
                c.col -= 1;
            } else if c.row > 0 {
                c.row -= 1;
                c.col = self
                    .edit_lines()
                    .get(c.row)
                    .map(|l| l.text.chars().count())
                    .unwrap_or(0);
            }
            self.set_caret(c, shift);
            cx.notify();
            return;
        }
        if key == "right" {
            let mut c = caret;
            let len = self
                .edit_lines()
                .get(c.row)
                .map(|l| l.text.chars().count())
                .unwrap_or(0);
            if c.col < len {
                c.col += 1;
            } else if c.row + 1 < self.row_count() {
                c.row += 1;
                c.col = 0;
            }
            self.set_caret(c, shift);
            cx.notify();
            return;
        }
        if key == "up" {
            let mut c = caret;
            if c.row > 0 {
                c.row -= 1;
                let len = self.edit_lines()[c.row].text.chars().count();
                c.col = c.col.min(len);
            }
            self.set_caret(c, shift);
            cx.notify();
            return;
        }
        if key == "down" {
            let mut c = caret;
            if c.row + 1 < self.row_count() {
                c.row += 1;
                let len = self.edit_lines()[c.row].text.chars().count();
                c.col = c.col.min(len);
            }
            self.set_caret(c, shift);
            cx.notify();
            return;
        }
        if key == "home" {
            self.set_caret(Caret { row: caret.row, col: 0 }, shift);
            cx.notify();
            return;
        }
        if key == "end" {
            let len = self
                .edit_lines()
                .get(caret.row)
                .map(|l| l.text.chars().count())
                .unwrap_or(0);
            self.set_caret(Caret { row: caret.row, col: len }, shift);
            cx.notify();
            return;
        }

        if !self.editable {
            return;
        }

        let lines = self.edit_lines();
        if caret.row >= lines.len() {
            return;
        }
        if !matches!(lines[caret.row].kind, LineKind::Equal | LineKind::Insert) {
            return;
        }

        if key == "enter" {
            let cc = caret.col;
            self.commit_lines(cx, false, Some((caret.row, cc)), None);
            self.set_caret(
                Caret {
                    row: caret.row + 1,
                    col: 0,
                },
                false,
            );
            self.extra_carets.clear();
            return;
        }
        if key == "backspace" {
            if self.delete_selection() {
                self.commit_lines(cx, true, None, None);
                return;
            }
            // Apply backspace to all carets (primary + extras), bottom-up.
            let carets = self.all_carets();
            let mut primary = caret;
            for c in carets {
                let lines = self.edit_lines_mut();
                if c.row >= lines.len() {
                    continue;
                }
                if !matches!(lines[c.row].kind, LineKind::Equal | LineKind::Insert) {
                    continue;
                }
                if c.col == 0 {
                    continue;
                }
                let text = &mut lines[c.row].text;
                let start = char_byte(text, c.col - 1);
                let end = char_byte(text, c.col);
                text.replace_range(start..end, "");
                if c == caret {
                    primary.col -= 1;
                }
            }
            self.primary = Some(primary);
            self.sel_anchor = Some(primary);
            // Adjust extra carets on same lines roughly.
            for c in &mut self.extra_carets {
                if c.col > 0 {
                    c.col -= 1;
                }
            }
            self.commit_lines(cx, true, None, None);
            return;
        }

        if key.len() == 1 {
            let ch = key.chars().next().unwrap();
            if ch.is_control() {
                return;
            }
            if self.delete_selection() {
                // selection cleared
            }
            let carets = self.all_carets();
            let mut primary = self.primary.unwrap_or(caret);
            // Insert bottom-up so columns on same line stay valid.
            for c in carets {
                let lines = self.edit_lines_mut();
                if c.row >= lines.len() {
                    continue;
                }
                if !matches!(lines[c.row].kind, LineKind::Equal | LineKind::Insert) {
                    continue;
                }
                let text = &mut lines[c.row].text;
                let byte = char_byte(text, c.col);
                text.insert(byte, ch);
                if c.row == primary.row && c.col <= primary.col {
                    primary.col += 1;
                }
            }
            for c in &mut self.extra_carets {
                c.col += 1;
            }
            self.primary = Some(primary);
            self.sel_anchor = Some(primary);
            self.commit_lines(cx, true, None, None);
        }
    }
}

fn char_byte(s: &str, col: usize) -> usize {
    s.char_indices()
        .nth(col)
        .map(|(i, _)| i)
        .unwrap_or(s.len())
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
        let primary = self.primary;
        let sel_anchor = self.sel_anchor;
        let extra_carets = self.extra_carets.clone();
        let palette = self.palette.clone();
        let left = self.cache.left_lines.clone();
        let right = self.cache.right_lines.clone();
        let unified = self.cache.unified_lines.clone();
        let left_hls = self.cache.left_line_hls.clone();
        let right_hls = self.cache.right_line_hls.clone();
        let unified_hls = self.cache.unified_line_hls.clone();
        let path = self.path.clone();
        let viewport_h = self.viewport_h.clone();
        let viewport_w = self.viewport_w.clone();
        let minimap_bounds = self.minimap_bounds.clone();
        let scroll_x = self.scroll_x;

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
                                let vw_cell = viewport_w.clone();
                                canvas(
                                    move |bounds, _, _| {
                                        vh_cell.set(f32::from(bounds.size.height));
                                        vw_cell.set(f32::from(bounds.size.width));
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
                                                    primary,
                                                    sel_anchor,
                                                    &extra_carets,
                                                    scroll_x,
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
                                                    primary,
                                                    sel_anchor,
                                                    &extra_carets,
                                                    scroll_x,
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
    primary: Option<Caret>,
    sel_anchor: Option<Caret>,
    extra_carets: &[Caret],
    scroll_x: f32,
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
            None,
            &[],
            scroll_x,
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
            primary,
            sel_anchor,
            extra_carets,
            scroll_x,
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
    primary: Option<Caret>,
    sel_anchor: Option<Caret>,
    extra_carets: &[Caret],
    scroll_x: f32,
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
        primary,
        sel_anchor,
        extra_carets,
        scroll_x,
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
    primary: Option<Caret>,
    sel_anchor: Option<Caret>,
    extra_carets: &[Caret],
    scroll_x: f32,
    cx: &mut Context<DiffPane>,
) -> impl IntoElement {
    let u = u.clone();
    let palette = palette.clone();
    let lines = lines.to_vec();
    let line_hls = line_hls.to_vec();
    let extra_carets = extra_carets.to_vec();

    div()
        .id(id)
        .flex()
        .flex_col()
        .flex_1()
        .min_w_0()
        .children(lines.into_iter().enumerate().map(|(local_i, line)| {
            let i = index_offset + local_i;
            let bg = hunk_bg_static(&u, line.kind);
            let can_edit_row =
                editable && matches!(line.kind, LineKind::Equal | LineKind::Insert);
            let gutter = line
                .line_no
                .map(|n| format!("{n:>4}"))
                .unwrap_or_else(|| "    ".into());
            let text = line.text.clone();
            let highlights = cached_highlights(line_hls.get(local_i), &text, &palette);
            let is_focus = primary.map(|c| c.row == i).unwrap_or(false);
            let caret_col = primary.filter(|c| c.row == i).map(|c| c.col);
            let sel = selection_range_for_row(sel_anchor, primary, i, text.chars().count());
            let has_extra = extra_carets.iter().any(|c| c.row == i);

            div()
                .id((id, i))
                .flex()
                .flex_row()
                .flex_shrink_0()
                .h(px(ROW_HEIGHT))
                .w_full()
                .bg(rgb3(bg))
                .when(is_focus || has_extra, |el| {
                    el.border_l_2().border_color(rgb3(u.accent))
                })
                .when(can_edit_row || editable, |el| {
                    let line_len = text.chars().count();
                    el.cursor_text().on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                            let caret = Caret {
                                row: i,
                                col: line_len,
                            };
                            if event.modifiers.alt {
                                if let Some(p) = this.primary {
                                    if p != caret && !this.extra_carets.contains(&caret) {
                                        this.extra_carets.push(caret);
                                    }
                                } else {
                                    this.primary = Some(caret);
                                    this.sel_anchor = Some(caret);
                                }
                            } else if event.modifiers.shift {
                                this.primary = Some(caret);
                                if this.sel_anchor.is_none() {
                                    this.sel_anchor = Some(caret);
                                }
                                this.extra_carets.clear();
                            } else {
                                this.primary = Some(caret);
                                this.sel_anchor = Some(caret);
                                this.extra_carets.clear();
                            }
                            window.focus(&this.focus_handle);
                            cx.notify();
                        }),
                    )
                })
                // Sticky gutter — does not follow scroll_x.
                .child(
                    div()
                        .w(px(GUTTER_W))
                        .flex_shrink_0()
                        .px_1()
                        .text_color(rgb3(u.text_muted))
                        .font_family("Menlo")
                        .bg(rgb3(bg))
                        .child(gutter),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .overflow_hidden()
                        .child(
                            div()
                                .ml(px(-scroll_x))
                                .px_1()
                                .child(render_editable_text(
                                    &text,
                                    highlights,
                                    caret_col,
                                    sel,
                                    can_edit_row && is_focus,
                                    &u,
                                )),
                        ),
                )
        }))
}

fn selection_range_for_row(
    anchor: Option<Caret>,
    primary: Option<Caret>,
    row: usize,
    line_len: usize,
) -> Option<Range<usize>> {
    let (Some(a), Some(b)) = (anchor, primary) else {
        return None;
    };
    if a == b {
        return None;
    }
    let (start, end) = if (a.row, a.col) <= (b.row, b.col) {
        (a, b)
    } else {
        (b, a)
    };
    if row < start.row || row > end.row {
        return None;
    }
    if start.row == end.row {
        return Some(start.col..end.col);
    }
    if row == start.row {
        return Some(start.col..line_len);
    }
    if row == end.row {
        return Some(0..end.col);
    }
    Some(0..line_len)
}

fn render_editable_text(
    text: &str,
    highlights: Vec<(Range<usize>, HighlightStyle)>,
    caret_col: Option<usize>,
    sel: Option<Range<usize>>,
    show_caret: bool,
    u: &UiVars,
) -> AnyElement {
    if let Some(sel) = sel.filter(|s| s.start != s.end) {
        let chars: Vec<char> = text.chars().collect();
        let mut parts: Vec<AnyElement> = Vec::new();
        let mut i = 0usize;
        while i < chars.len() {
            if i >= sel.start && i < sel.end {
                let mut chunk = String::new();
                while i < chars.len() && i < sel.end {
                    chunk.push(chars[i]);
                    i += 1;
                }
                parts.push(
                    div()
                        .bg(rgb3(u.accent))
                        .text_color(rgb3(u.btn_fg))
                        .child(chunk)
                        .into_any_element(),
                );
            } else {
                parts.push(div().child(chars[i].to_string()).into_any_element());
                i += 1;
            }
        }
        return div().flex().flex_row().children(parts).into_any_element();
    }

    let display = if show_caret {
        if let Some(col) = caret_col {
            let mut t = text.to_string();
            let byte = char_byte(&t, col);
            // Placeholder; real caret painted via overlay animation next to text is hard with StyledText,
            // so keep glyph + blink wrapper around whole line tip.
            t.insert(byte, '│');
            t
        } else {
            text.to_string()
        }
    } else if text.is_empty() {
        " ".into()
    } else {
        text.to_string()
    };

    if show_caret {
        div()
            .flex()
            .flex_row()
            .child(StyledText::new(display).with_highlights(highlights))
            .with_animation(
                "diff-caret-blink",
                Animation::new(Duration::from_millis(1060)).repeat(),
                |this, delta| {
                    if delta < 0.5 {
                        this.opacity(1.0)
                    } else {
                        this.opacity(0.85)
                    }
                },
            )
            .into_any_element()
    } else {
        StyledText::new(display)
            .with_highlights(highlights)
            .into_any_element()
    }
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
