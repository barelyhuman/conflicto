use std::path::Path;

use conflicto_core::{ChangeEntry, ChangeSide, UiVars};
use egui::{RichText, Ui};

use super::widgets::{rgb, selectable_row};
use crate::app::{ConflictoApp, DiffSource};

pub fn show_section(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars, title: &str, side: ChangeSide) {
    let entries: Vec<ChangeEntry> = app
        .changes
        .iter()
        .filter(|c| c.side == side)
        .cloned()
        .collect();
    ui.label(
        RichText::new(format!("{}  {}", title, entries.len()))
            .small()
            .color(rgb(u.text_muted)),
    );
    if entries.is_empty() {
        ui.add_space(4.0);
        ui.label(RichText::new("None").small().color(rgb(u.text_muted)));
        return;
    }
    for entry in entries {
        let selected = matches!(
            &app.session.source,
            Some(DiffSource::Change { path, side: s, .. })
                if path == &entry.path && *s == entry.side
        );
        let status_color = rgb(entry.status.ui_color(u));
        let response = selectable_row(ui, selected, u, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(entry.status.letter())
                        .monospace()
                        .color(status_color),
                );
                ui.add_space(4.0);
                let name = Path::new(&entry.path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&entry.path);
                ui.label(RichText::new(name).color(rgb(u.text)));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    match side {
                        ChangeSide::Unstaged => {
                            if ui.small_button("+").on_hover_text("Stage").clicked() {
                                app.stage_selected(&entry.path);
                            }
                        }
                        ChangeSide::Staged => {
                            if ui.small_button("−").on_hover_text("Unstage").clicked() {
                                app.unstage_selected(&entry.path);
                            }
                        }
                    }
                });
            });
        });
        if response.clicked() {
            app.select_change(&entry);
        }
    }
}
