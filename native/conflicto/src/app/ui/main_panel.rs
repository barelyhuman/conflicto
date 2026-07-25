use conflicto_core::{ChangeSide, ThemeId, UiVars};
use egui::{RichText, Ui};

use super::diff_pane;
use super::widgets::{rgb, MAC_TRAFFIC_INSET_X, TOOLBAR_H};
use crate::app::{ConflictoApp, DiffSource};

pub fn show(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars) {
    ui.set_min_size(ui.available_size());

    egui::Frame::NONE
        .fill(rgb(u.bg_surface))
        .inner_margin(egui::Margin {
            left: (12.0 + MAC_TRAFFIC_INSET_X) as i8,
            right: 12,
            top: 0,
            bottom: 0,
        })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_height(TOOLBAR_H);
            ui.horizontal_centered(|ui| {
                let path_label = app.session.diff.as_ref().map(|d| {
                    let side = match &app.session.source {
                        Some(DiffSource::Change { side, .. }) => match side {
                            ChangeSide::Staged => "STAGED",
                            ChangeSide::Unstaged => "WORKING TREE",
                        },
                        Some(DiffSource::Commit { hash, .. }) => app
                            .commits
                            .iter()
                            .find(|c| &c.hash == hash)
                            .map(|c| c.short_hash.as_str())
                            .unwrap_or("COMMIT"),
                        None => "",
                    };
                    format!("{side}  {}", d.path)
                });
                if let Some(label) = path_label {
                    let mut text = label;
                    if app.session.dirty {
                        text.push_str("  •");
                    }
                    ui.label(RichText::new(text).monospace().color(rgb(u.text)));
                } else {
                    ui.label(RichText::new("Select a file to diff").color(rgb(u.text_muted)));
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let label = if app.side_by_side {
                        "Side by Side"
                    } else {
                        "Inline"
                    };
                    let mut toggle = egui::Button::new(RichText::new(label).color(rgb(u.text)));
                    // Sticky selected look only; idle state inherits themed weak_bg_fill.
                    if app.side_by_side {
                        toggle = toggle
                            .fill(rgb(u.bg_active))
                            .stroke(egui::Stroke::new(1.0, rgb(u.accent)));
                    }
                    if ui.add(toggle).clicked() {
                        app.side_by_side = !app.side_by_side;
                    }

                    egui::ComboBox::from_id_salt("theme_picker")
                        .selected_text(app.prefs.theme_id.label())
                        .show_ui(ui, |ui| {
                            for id in ThemeId::all() {
                                if ui
                                    .selectable_label(app.prefs.theme_id == *id, id.label())
                                    .clicked()
                                {
                                    app.set_theme(ui.ctx(), *id);
                                }
                            }
                        });
                    ui.label(RichText::new("Theme").small().color(rgb(u.text_muted)));

                    if app.can_edit() && app.session.dirty && ui.button("Save").clicked() {
                        app.save_edit();
                    }
                });
            });
        });

    if let Some(err) = &app.error {
        egui::Frame::NONE
            .fill(rgb(u.danger_bg))
            .stroke(egui::Stroke::new(1.0, rgb(u.danger_border)))
            .inner_margin(8.0)
            .show(ui, |ui| {
                ui.label(RichText::new(err).color(rgb(u.danger_fg)));
            });
    }
    if let Some(status) = &app.status {
        ui.label(RichText::new(status).small().color(rgb(u.text_muted)));
    }

    ui.add_space(4.0);

    if app.session.diff.is_some() {
        diff_pane::show(ui, app, u);
    } else {
        ui.centered_and_justified(|ui| {
            ui.label(RichText::new("No diff selected").color(rgb(u.text_muted)));
        });
    }
}
