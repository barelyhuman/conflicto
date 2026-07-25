//! Document overview strip: change markers + viewport thumb + click-to-scroll.

use conflicto_core::{DiffLine, LineKind, UiVars};
use egui::{Color32, Sense, Ui};

use super::edit::{rgb, tint};
use super::scroll::{DiffScroll, ROW_HEIGHT};

pub const MINIMAP_W: f32 = 12.0;

/// Kind to show on the minimap for one aligned row (SxS).
fn marker_kind_sxs(left: LineKind, right: LineKind) -> Option<LineKind> {
    match (left, right) {
        (LineKind::Delete, _) | (_, LineKind::Delete) => Some(LineKind::Delete),
        (LineKind::Insert, _) | (_, LineKind::Insert) => Some(LineKind::Insert),
        _ => None,
    }
}

fn marker_color(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Delete => rgb(u.status_d),
        LineKind::Insert => rgb(u.status_a),
        LineKind::Gap => tint(u.bg, u.text_muted, 0.35),
        LineKind::Equal => Color32::TRANSPARENT,
    }
}

/// Paint a right-edge minimap and update `scroll.y` on click/drag.
///
/// `lines` drives markers (unified for inline). For side-by-side pass either side
/// with the same length as the other; use [`show_sxs`] instead when both sides exist.
pub fn show(
    ui: &mut Ui,
    u: &UiVars,
    lines: &[DiffLine],
    scroll: &mut DiffScroll,
    viewport_h: f32,
) {
    let n = lines.len();
    let content_h = (n as f32 * ROW_HEIGHT).max(1.0);
    let height = ui.available_height().max(1.0);
    let (rect, response) = ui.allocate_exact_size(egui::vec2(MINIMAP_W, height), Sense::click_and_drag());

    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 0.0, rgb(u.bg_surface));

    if n > 0 {
        let row_h = (rect.height() / n as f32).max(1.0);
        // Draw change markers as runs for fewer draw calls.
        let mut i = 0usize;
        while i < n {
            let kind = match lines[i].kind {
                LineKind::Delete | LineKind::Insert => lines[i].kind,
                _ => {
                    i += 1;
                    continue;
                }
            };
            let start = i;
            i += 1;
            while i < n && lines[i].kind == kind {
                i += 1;
            }
            let y0 = rect.top() + start as f32 * row_h;
            let y1 = rect.top() + i as f32 * row_h;
            let marker = egui::Rect::from_min_max(
                egui::pos2(rect.left() + 2.0, y0),
                egui::pos2(rect.right() - 2.0, y1.max(y0 + 1.0)),
            );
            painter.rect_filled(marker, 0.0, marker_color(kind, u));
        }
    }

    // Viewport thumb — outline only so change markers stay visible underneath.
    let max_y = scroll.max_y.max((content_h - viewport_h).max(0.0));
    let thumb_h = if content_h > 0.0 {
        (viewport_h / content_h * rect.height()).clamp(8.0, rect.height())
    } else {
        rect.height()
    };
    let thumb_t = if max_y > 0.0 {
        scroll.y / max_y * (rect.height() - thumb_h).max(0.0)
    } else {
        0.0
    };
    let thumb = egui::Rect::from_min_size(
        egui::pos2(rect.left(), rect.top() + thumb_t),
        egui::vec2(rect.width(), thumb_h),
    );
    painter.rect_stroke(
        thumb,
        0.0,
        egui::Stroke::new(1.0, tint(u.bg, u.text, 0.45)),
        egui::StrokeKind::Inside,
    );

    if response.clicked() || response.dragged() {
        if let Some(pos) = response.interact_pointer_pos() {
            let frac = ((pos.y - rect.top()) / rect.height()).clamp(0.0, 1.0);
            // Center viewport on click.
            let target = frac * content_h - viewport_h * 0.5;
            scroll.y = target.clamp(0.0, max_y.max(0.0));
            ui.ctx().request_repaint();
        }
    }
}

/// Side-by-side minimap: markers from either pane's change kinds.
pub fn show_sxs(
    ui: &mut Ui,
    u: &UiVars,
    left: &[DiffLine],
    right: &[DiffLine],
    scroll: &mut DiffScroll,
    viewport_h: f32,
) {
    let n = left.len().min(right.len());
    // Build a lightweight kind list for the shared helper path.
    let mut kinds: Vec<DiffLine> = Vec::with_capacity(n);
    for i in 0..n {
        let kind = marker_kind_sxs(left[i].kind, right[i].kind).unwrap_or(LineKind::Equal);
        kinds.push(DiffLine {
            text: String::new(),
            kind,
            line_no: None,
        });
    }
    show(ui, u, &kinds, scroll, viewport_h);
}
