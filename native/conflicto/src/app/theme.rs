use conflicto_core::{ColorScheme, UiVars};

use super::ui::widgets::rgb;

pub fn apply_theme_visuals(ctx: &egui::Context, u: &UiVars, color_scheme: ColorScheme) {
    let mut visuals = if matches!(color_scheme, ColorScheme::Light) {
        egui::Visuals::light()
    } else {
        egui::Visuals::dark()
    };
    visuals.panel_fill = rgb(u.bg);
    visuals.window_fill = rgb(u.bg);
    visuals.window_stroke = egui::Stroke::new(1.0, rgb(u.border));
    visuals.extreme_bg_color = rgb(u.bg_sidebar);
    visuals.faint_bg_color = rgb(u.bg_surface);
    visuals.selection.bg_fill = rgb(u.bg_active);
    visuals.override_text_color = Some(rgb(u.text));

    // Buttons and ComboBoxes paint with weak_bg_fill (not bg_fill).
    let border = egui::Stroke::new(1.0, rgb(u.border));
    let accent_stroke = egui::Stroke::new(1.0, rgb(u.accent));
    for w in [
        &mut visuals.widgets.noninteractive,
        &mut visuals.widgets.inactive,
    ] {
        w.bg_fill = rgb(u.btn_bg);
        w.weak_bg_fill = rgb(u.btn_bg);
        w.bg_stroke = border;
        w.fg_stroke.color = rgb(u.text);
    }
    visuals.widgets.hovered.bg_fill = rgb(u.btn_hover);
    visuals.widgets.hovered.weak_bg_fill = rgb(u.btn_hover);
    visuals.widgets.hovered.bg_stroke = accent_stroke;
    visuals.widgets.hovered.fg_stroke.color = rgb(u.text);

    visuals.widgets.active.bg_fill = rgb(u.bg_active);
    visuals.widgets.active.weak_bg_fill = rgb(u.bg_active);
    visuals.widgets.active.bg_stroke = accent_stroke;
    visuals.widgets.active.fg_stroke.color = rgb(u.text);

    visuals.widgets.open.bg_fill = rgb(u.btn_hover);
    visuals.widgets.open.weak_bg_fill = rgb(u.btn_hover);
    visuals.widgets.open.bg_stroke = accent_stroke;
    visuals.widgets.open.fg_stroke.color = rgb(u.text);

    ctx.set_visuals(visuals);
}
