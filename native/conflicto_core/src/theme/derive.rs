use super::{ColorScheme, UiVars};

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

fn parse_rgb(hex: &str) -> [u8; 3] {
    let h = normalize_hex(Some(hex), "#000000");
    let h = h.trim_start_matches('#');
    let r = u8::from_str_radix(&h[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&h[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&h[4..6], 16).unwrap_or(0);
    [r, g, b]
}

fn to_hex(rgb: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2])
}

fn mix(a: &str, b: &str, t: f32) -> String {
    let ar = parse_rgb(a);
    let br = parse_rgb(b);
    let t = t.clamp(0.0, 1.0);
    to_hex([
        (ar[0] as f32 + (br[0] as f32 - ar[0] as f32) * t).round() as u8,
        (ar[1] as f32 + (br[1] as f32 - ar[1] as f32) * t).round() as u8,
        (ar[2] as f32 + (br[2] as f32 - ar[2] as f32) * t).round() as u8,
    ])
}

fn lighten(hex: &str, t: f32) -> String {
    mix(hex, "#ffffff", t)
}

fn darken(hex: &str, t: f32) -> String {
    mix(hex, "#000000", t)
}

fn get<'a>(colors: &'a [(&str, &str)], key: &str) -> Option<&'a str> {
    colors.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)
}

pub fn derive_ui_vars(colors: &[(&str, &str)], scheme: ColorScheme) -> UiVars {
    let is_light = matches!(scheme, ColorScheme::Light);
    let bg = normalize_hex(
        get(colors, "editor.background"),
        if is_light { "#ffffff" } else { "#1e1e1e" },
    );
    let fg = normalize_hex(
        get(colors, "editor.foreground"),
        if is_light { "#000000" } else { "#cccccc" },
    );
    let sidebar = normalize_hex(
        get(colors, "sideBar.background").or_else(|| get(colors, "editorWidget.background")),
        &if is_light {
            darken(&bg, 0.03)
        } else {
            lighten(&bg, 0.04)
        },
    );
    let surface_fallback = if is_light {
        darken(&bg, 0.04)
    } else {
        lighten(&bg, 0.06)
    };
    let mut surface = normalize_hex(
        get(colors, "editorWidget.background").or_else(|| get(colors, "panel.background")),
        &surface_fallback,
    );
    if surface.eq_ignore_ascii_case(&bg) || surface.eq_ignore_ascii_case(&sidebar) {
        surface = if is_light {
            darken(&sidebar, 0.04)
        } else {
            lighten(&sidebar, 0.05)
        };
        if surface.eq_ignore_ascii_case(&sidebar) || surface.eq_ignore_ascii_case(&bg) {
            surface = if is_light {
                darken(&bg, 0.06)
            } else {
                lighten(&bg, 0.08)
            };
        }
    }
    let border = normalize_hex(
        get(colors, "editorWidget.border").or_else(|| get(colors, "panel.border")),
        &if is_light {
            darken(&bg, 0.12)
        } else {
            lighten(&bg, 0.12)
        },
    );
    let muted = normalize_hex(
        get(colors, "editorLineNumber.foreground"),
        &mix(&fg, &bg, 0.45),
    );
    let accent = normalize_hex(
        get(colors, "focusBorder").or_else(|| get(colors, "button.background")),
        "#0078d4",
    );
    let accent_hover = lighten(&accent, if is_light { 0.08 } else { 0.12 });
    let btn_bg = normalize_hex(
        get(colors, "button.secondaryBackground").or_else(|| get(colors, "input.background")),
        &if is_light {
            darken(&bg, 0.06)
        } else {
            lighten(&bg, 0.1)
        },
    );
    let btn_hover = if is_light {
        darken(&btn_bg, 0.08)
    } else {
        lighten(&btn_bg, 0.08)
    };
    let hover = normalize_hex(
        get(colors, "list.hoverBackground"),
        &mix(&bg, &fg, if is_light { 0.06 } else { 0.08 }),
    );
    let active = normalize_hex(
        get(colors, "list.activeSelectionBackground"),
        &mix(&bg, &fg, if is_light { 0.1 } else { 0.14 }),
    );
    let status_m = normalize_hex(
        get(colors, "gitDecoration.modifiedResourceForeground"),
        "#e2c08d",
    );
    let status_a = normalize_hex(
        get(colors, "gitDecoration.addedResourceForeground"),
        "#73c991",
    );
    let status_d = normalize_hex(
        get(colors, "gitDecoration.deletedResourceForeground"),
        "#f14c4c",
    );
    let status_r = normalize_hex(
        get(colors, "gitDecoration.renamedResourceForeground"),
        &status_a,
    );
    let danger_border = normalize_hex(
        get(colors, "errorForeground").or_else(|| get(colors, "inputValidation.errorBorder")),
        "#f14c4c",
    );
    let danger_bg = mix(&bg, &danger_border, if is_light { 0.12 } else { 0.28 });
    let danger_fg = if is_light {
        darken(&danger_border, 0.25)
    } else {
        lighten(&danger_border, 0.35)
    };
    let ref_fg = normalize_hex(get(colors, "textLink.foreground"), &accent_hover);
    let ref_bg = mix(&bg, &accent, if is_light { 0.12 } else { 0.22 });

    UiVars {
        bg: parse_rgb(&bg),
        bg_sidebar: parse_rgb(&sidebar),
        bg_surface: parse_rgb(&surface),
        bg_hover: parse_rgb(&hover),
        bg_active: parse_rgb(&active),
        border: parse_rgb(&border),
        text: parse_rgb(&fg),
        text_muted: parse_rgb(&muted),
        accent: parse_rgb(&accent),
        accent_hover: parse_rgb(&accent_hover),
        btn_bg: parse_rgb(&btn_bg),
        btn_hover: parse_rgb(&btn_hover),
        btn_fg: parse_rgb("#ffffff"),
        status_m: parse_rgb(&status_m),
        status_a: parse_rgb(&status_a),
        status_d: parse_rgb(&status_d),
        status_r: parse_rgb(&status_r),
        danger_bg: parse_rgb(&danger_bg),
        danger_border: parse_rgb(&danger_border),
        danger_fg: parse_rgb(&danger_fg),
        ref_fg: parse_rgb(&ref_fg),
        ref_bg: parse_rgb(&ref_bg),
    }
}
