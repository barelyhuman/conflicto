//! Padded / filled chrome containers.

use egui::{Color32, Ui};

use super::tokens::Insets;

/// Optional fill behind a padded region.
#[derive(Debug, Clone, Copy)]
pub struct Background {
    pub fill: Color32,
}

impl Background {
    pub fn fill(fill: Color32) -> Self {
        Self { fill }
    }
}

/// Run `add` inside a framed region with insets and optional fill.
pub fn container(
    ui: &mut Ui,
    insets: Insets,
    background: Option<Background>,
    add: impl FnOnce(&mut Ui),
) {
    let mut frame = egui::Frame::NONE.inner_margin(insets.to_egui());
    if let Some(bg) = background {
        frame = frame.fill(bg.fill);
    }
    frame.show(ui, |ui| {
        ui.set_width(ui.available_width());
        add(ui);
    });
}
