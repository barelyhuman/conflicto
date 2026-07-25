use conflicto_core::UiVars;
use egui::{Color32, RichText, Sense, Ui};

pub const SIDEBAR_W: f32 = 320.0;
pub const TOOLBAR_H: f32 = 42.0;
/// Leading inset so toolbar widgets clear native traffic lights (fullsize content).
#[cfg(target_os = "macos")]
pub const MAC_TRAFFIC_INSET_X: f32 = 76.0;
#[cfg(not(target_os = "macos"))]
pub const MAC_TRAFFIC_INSET_X: f32 = 0.0;

pub fn rgb(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

pub fn selectable_row(
    ui: &mut Ui,
    selected: bool,
    u: &UiVars,
    add_contents: impl FnOnce(&mut Ui),
) -> egui::Response {
    let fill = if selected {
        rgb(u.bg_active)
    } else {
        Color32::TRANSPARENT
    };
    egui::Frame::NONE
        .fill(fill)
        .inner_margin(egui::Margin::symmetric(8, 4))
        .show(ui, add_contents)
        .response
        .interact(Sense::click())
}

pub fn accordion_header(ui: &mut Ui, u: &UiVars, title: impl Into<String>) -> bool {
    let mut clicked = false;
    egui::Frame::NONE
        .fill(rgb(u.bg_surface))
        .inner_margin(egui::Margin::symmetric(12, 6))
        .show(ui, |ui| {
            if ui
                .add(
                    egui::Button::new(RichText::new(title.into()).small().color(rgb(u.text)))
                        .fill(Color32::TRANSPARENT),
                )
                .clicked()
            {
                clicked = true;
            }
        });
    clicked
}
