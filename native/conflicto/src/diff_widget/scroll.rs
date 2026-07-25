use egui::Ui;

use super::paint::{gutter_chrome_width, measure_text_width};

pub const LINE_FONT: f32 = 13.0;
/// Fixed row height so left/right (and label vs TextEdit) stay vertically locked.
pub const ROW_HEIGHT: f32 = 20.0;
pub const ROW_PAD_X: f32 = 6.0;
/// Extra room after the longest glyph so the last character isn't flush to the edge.
const ROW_TRAIL_PAD: f32 = 12.0;

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

pub fn content_width_from_chars(ui: &Ui, max_chars: usize, min_width: f32) -> f32 {
    let em = measure_text_width(ui, "M");
    (gutter_chrome_width(ui) + max_chars as f32 * em + ROW_TRAIL_PAD).max(min_width)
}

/// Visible row index range for virtualized painting (inclusive start, exclusive end).
pub fn row_window(scroll_y: f32, viewport_h: f32, row_count: usize) -> (usize, usize) {
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

pub fn row_spacer(ui: &mut Ui, width: f32, rows: usize) {
    if rows == 0 {
        return;
    }
    ui.allocate_exact_size(
        egui::vec2(width, rows as f32 * ROW_HEIGHT),
        egui::Sense::hover(),
    );
}

pub fn max_scroll_axis(content: f32, viewport: f32) -> f32 {
    (content - viewport).max(0.0)
}

pub fn finish_scroll_maxes(scroll: &mut DiffScroll, max_x: f32, max_y: f32) {
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

/// Apply ScrollArea output to linked scroll; returns true if this pane drove a change.
pub fn sync_linked_scroll(
    scroll: &mut DiffScroll,
    out_offset: egui::Vec2,
    intended: egui::Vec2,
    content_size: egui::Vec2,
    inner_rect: egui::Rect,
    measured_max_x: &mut f32,
    measured_max_y: &mut f32,
) -> bool {
    *measured_max_x = measured_max_x.max(max_scroll_axis(content_size.x, inner_rect.width()));
    *measured_max_y = measured_max_y.max(max_scroll_axis(content_size.y, inner_rect.height()));
    if (out_offset - intended).length() > 0.5 {
        scroll.x = out_offset.x;
        scroll.y = out_offset.y;
        true
    } else {
        false
    }
}
