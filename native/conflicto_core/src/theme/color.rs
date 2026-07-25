//! Shared RGB color math for theme derive and highlight palettes.

pub fn parse_rgb(hex: &str) -> [u8; 3] {
    let h = normalize_hex(Some(hex), "#000000");
    let h = h.trim_start_matches('#');
    let r = u8::from_str_radix(&h.get(0..2).unwrap_or("00"), 16).unwrap_or(0);
    let g = u8::from_str_radix(&h.get(2..4).unwrap_or("00"), 16).unwrap_or(0);
    let b = u8::from_str_radix(&h.get(4..6).unwrap_or("00"), 16).unwrap_or(0);
    [r, g, b]
}

fn expand_short(short: &str) -> String {
    let b = short.as_bytes();
    format!(
        "#{}{}{}{}{}{}",
        b[1] as char, b[1] as char, b[2] as char, b[2] as char, b[3] as char, b[3] as char
    )
}

pub fn normalize_hex(color: Option<&str>, fallback: &str) -> String {
    let Some(c) = color.map(str::trim).filter(|s| !s.is_empty()) else {
        return fallback.to_string();
    };
    if let Some(rest) = c.strip_prefix('#') {
        if rest.len() == 3 {
            return expand_short(c);
        }
        return format!("#{}", &rest[..rest.len().min(6)]);
    }
    if c.len() == 6 && c.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return format!("#{c}");
    }
    if c.len() == 3 && c.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return expand_short(&format!("#{c}"));
    }
    fallback.to_string()
}

pub fn mix(a: [u8; 3], b: [u8; 3], t: f32) -> [u8; 3] {
    let t = t.clamp(0.0, 1.0);
    [
        (a[0] as f32 + (b[0] as f32 - a[0] as f32) * t).round() as u8,
        (a[1] as f32 + (b[1] as f32 - a[1] as f32) * t).round() as u8,
        (a[2] as f32 + (b[2] as f32 - a[2] as f32) * t).round() as u8,
    ]
}

pub fn lighten(c: [u8; 3], t: f32) -> [u8; 3] {
    mix(c, [255, 255, 255], t)
}

pub fn darken(c: [u8; 3], t: f32) -> [u8; 3] {
    mix(c, [0, 0, 0], t)
}

pub fn hex_to_rgb(color: Option<&str>, fallback: &str) -> [u8; 3] {
    parse_rgb(&normalize_hex(color, fallback))
}
