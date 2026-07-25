//! Document overview strip: change markers + viewport thumb + click-to-scroll.

use conflicto_core::{DiffLine, LineKind, UiVars};
use gpui::*;

use crate::color::{hsla3, rgb3, tint};

pub const MINIMAP_W: f32 = 12.0;
pub const ROW_HEIGHT: f32 = 20.0;

fn marker_kind_sxs(left: LineKind, right: LineKind) -> Option<LineKind> {
    match (left, right) {
        (LineKind::Delete, _) | (_, LineKind::Delete) => Some(LineKind::Delete),
        (LineKind::Insert, _) | (_, LineKind::Insert) => Some(LineKind::Insert),
        _ => None,
    }
}

fn marker_rgb(kind: LineKind, u: &UiVars) -> [u8; 3] {
    match kind {
        LineKind::Delete => u.status_d,
        LineKind::Insert => u.status_a,
        LineKind::Gap => tint(u.bg, u.text_muted, 0.35),
        LineKind::Equal => u.bg_surface,
    }
}

pub fn sxs_marker_lines(left: &[DiffLine], right: &[DiffLine]) -> Vec<DiffLine> {
    let n = left.len().min(right.len());
    let mut kinds = Vec::with_capacity(n);
    for i in 0..n {
        let kind = marker_kind_sxs(left[i].kind, right[i].kind).unwrap_or(LineKind::Equal);
        kinds.push(DiffLine {
            text: String::new(),
            kind,
            line_no: None,
        });
    }
    kinds
}

/// Map document Y (pixels at ROW_HEIGHT) → minimap Y within `bounds`.
fn doc_y_to_minimap(doc_y: f32, content_h: f32, map_h: f32) -> f32 {
    if content_h <= 0.0 {
        return 0.0;
    }
    (doc_y / content_h * map_h).clamp(0.0, map_h)
}

/// Paint minimap into `bounds`.
///
/// Markers and the viewport thumb share one scale: document pixels → minimap
/// height, so they stay aligned with the editor scroll position.
pub fn paint_minimap(
    window: &mut Window,
    bounds: Bounds<Pixels>,
    u: &UiVars,
    lines: &[DiffLine],
    scroll_y: f32,
    viewport_h: f32,
) {
    window.paint_quad(fill(bounds, rgb3(u.bg_surface)));

    let n = lines.len();
    if n == 0 {
        return;
    }
    let content_h = (n as f32 * ROW_HEIGHT).max(1.0);
    let map_h: f32 = bounds.size.height.into();
    let origin_y: f32 = bounds.origin.y.into();

    // Sub-pixel row height is required when n > map_h; never floor to 1px or
    // markers drift toward the bottom of the strip.
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
        let y0 = origin_y + doc_y_to_minimap(start as f32 * ROW_HEIGHT, content_h, map_h);
        let y1 = origin_y + doc_y_to_minimap(i as f32 * ROW_HEIGHT, content_h, map_h);
        let marker = Bounds {
            origin: point(bounds.origin.x + px(2.), px(y0)),
            size: size(
                bounds.size.width - px(4.),
                px((y1 - y0).max(1.0)),
            ),
        };
        window.paint_quad(fill(marker, rgb3(marker_rgb(kind, u))));
    }

    let thumb_h = doc_y_to_minimap(viewport_h, content_h, map_h).clamp(8.0, map_h);
    let thumb_t = doc_y_to_minimap(scroll_y, content_h, map_h).min(map_h - thumb_h);
    let thumb = Bounds {
        origin: point(bounds.origin.x, bounds.origin.y + px(thumb_t)),
        size: size(bounds.size.width, px(thumb_h)),
    };
    window.paint_quad(outline(
        thumb,
        hsla3(tint(u.bg, u.text, 0.45)),
        BorderStyle::default(),
    ));
}

pub fn scroll_y_from_minimap_click(
    bounds: Bounds<Pixels>,
    click_y: Pixels,
    line_count: usize,
    viewport_h: f32,
) -> f32 {
    let content_h = (line_count as f32 * ROW_HEIGHT).max(1.0);
    let map_h: f32 = bounds.size.height.into();
    let origin_y: f32 = bounds.origin.y.into();
    let click: f32 = click_y.into();
    let frac = ((click - origin_y) / map_h).clamp(0.0, 1.0);
    let max_y = (content_h - viewport_h).max(0.0);
    (frac * content_h - viewport_h * 0.5).clamp(0.0, max_y)
}
