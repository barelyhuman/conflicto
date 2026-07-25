use super::color::{darken, hex_to_rgb, lighten, mix};
use super::{ColorScheme, UiVars};

fn get<'a>(colors: &'a [(&str, &str)], key: &str) -> Option<&'a str> {
    colors.iter().find(|(k, _)| *k == key).map(|(_, v)| *v)
}

pub fn derive_ui_vars(colors: &[(&str, &str)], scheme: ColorScheme) -> UiVars {
    let is_light = matches!(scheme, ColorScheme::Light);
    let bg = hex_to_rgb(
        get(colors, "editor.background"),
        if is_light { "#ffffff" } else { "#1e1e1e" },
    );
    let fg = hex_to_rgb(
        get(colors, "editor.foreground"),
        if is_light { "#000000" } else { "#cccccc" },
    );
    let sidebar = match get(colors, "sideBar.background").or_else(|| get(colors, "editorWidget.background"))
    {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => {
            if is_light {
                darken(bg, 0.03)
            } else {
                lighten(bg, 0.04)
            }
        }
    };
    let surface_fallback = if is_light {
        darken(bg, 0.04)
    } else {
        lighten(bg, 0.06)
    };
    let mut surface = match get(colors, "editorWidget.background").or_else(|| get(colors, "panel.background"))
    {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => surface_fallback,
    };
    if surface == bg || surface == sidebar {
        surface = if is_light {
            darken(sidebar, 0.04)
        } else {
            lighten(sidebar, 0.05)
        };
        if surface == sidebar || surface == bg {
            surface = if is_light {
                darken(bg, 0.06)
            } else {
                lighten(bg, 0.08)
            };
        }
    }
    let border = match get(colors, "editorWidget.border").or_else(|| get(colors, "panel.border")) {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => {
            if is_light {
                darken(bg, 0.12)
            } else {
                lighten(bg, 0.12)
            }
        }
    };
    let muted = match get(colors, "editorLineNumber.foreground") {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => mix(fg, bg, 0.45),
    };
    let accent = hex_to_rgb(
        get(colors, "focusBorder").or_else(|| get(colors, "button.background")),
        "#0078d4",
    );
    let accent_hover = lighten(accent, if is_light { 0.08 } else { 0.12 });
    let btn_bg = match get(colors, "button.secondaryBackground").or_else(|| get(colors, "input.background"))
    {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => {
            if is_light {
                darken(bg, 0.06)
            } else {
                lighten(bg, 0.1)
            }
        }
    };
    let btn_hover = if is_light {
        darken(btn_bg, 0.08)
    } else {
        lighten(btn_bg, 0.08)
    };
    let hover = match get(colors, "list.hoverBackground") {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => mix(bg, fg, if is_light { 0.06 } else { 0.08 }),
    };
    let active = match get(colors, "list.activeSelectionBackground") {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => mix(bg, fg, if is_light { 0.1 } else { 0.14 }),
    };
    let status_m = hex_to_rgb(
        get(colors, "gitDecoration.modifiedResourceForeground"),
        "#e2c08d",
    );
    let status_a = hex_to_rgb(
        get(colors, "gitDecoration.addedResourceForeground"),
        "#73c991",
    );
    let status_d = hex_to_rgb(
        get(colors, "gitDecoration.deletedResourceForeground"),
        "#f14c4c",
    );
    let status_r = match get(colors, "gitDecoration.renamedResourceForeground") {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => status_a,
    };
    let danger_border = hex_to_rgb(
        get(colors, "errorForeground").or_else(|| get(colors, "inputValidation.errorBorder")),
        "#f14c4c",
    );
    let danger_bg = mix(bg, danger_border, if is_light { 0.12 } else { 0.28 });
    let danger_fg = if is_light {
        darken(danger_border, 0.25)
    } else {
        lighten(danger_border, 0.35)
    };
    let ref_fg = match get(colors, "textLink.foreground") {
        Some(c) => hex_to_rgb(Some(c), "#000000"),
        None => accent_hover,
    };
    let ref_bg = mix(bg, accent, if is_light { 0.12 } else { 0.22 });

    UiVars {
        bg,
        bg_sidebar: sidebar,
        bg_surface: surface,
        bg_hover: hover,
        bg_active: active,
        border,
        text: fg,
        text_muted: muted,
        accent,
        accent_hover,
        btn_bg,
        btn_hover,
        btn_fg: [255, 255, 255],
        status_m,
        status_a,
        status_d,
        status_r,
        danger_bg,
        danger_border,
        danger_fg,
        ref_fg,
        ref_bg,
    }
}
