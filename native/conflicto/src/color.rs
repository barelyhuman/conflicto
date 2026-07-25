//! GPUI color helpers from core `[u8; 3]` tokens.

use gpui::{Hsla, Rgba, rgb};

pub fn rgb3(c: [u8; 3]) -> Rgba {
    rgb(((c[0] as u32) << 16) | ((c[1] as u32) << 8) | (c[2] as u32))
}

pub fn hsla3(c: [u8; 3]) -> Hsla {
    rgb3(c).into()
}

pub fn tint(base: [u8; 3], overlay: [u8; 3], t: f32) -> [u8; 3] {
    let t = t.clamp(0.0, 1.0);
    [
        ((base[0] as f32) * (1.0 - t) + (overlay[0] as f32) * t) as u8,
        ((base[1] as f32) * (1.0 - t) + (overlay[1] as f32) * t) as u8,
        ((base[2] as f32) * (1.0 - t) + (overlay[2] as f32) * t) as u8,
    ]
}
