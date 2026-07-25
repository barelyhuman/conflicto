use conflicto_core::{GraphRow, UiVars};
use egui::{RichText, Ui};

use super::widgets::{rgb, selectable_row};
use crate::app::{ConflictoApp, DiffSource};

fn lane_label(row: &GraphRow) -> String {
    let mut lane_str = String::new();
    for i in 0..row.lane_count.min(8) {
        if i == row.lane {
            lane_str.push('●');
        } else if row.active_lanes.contains(&i) {
            lane_str.push('│');
        } else {
            lane_str.push(' ');
        }
    }
    lane_str
}

pub fn show_list(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars) {
    let rows = app.graph_rows.clone();
    for row in rows {
        let selected = app.selected_commit.as_deref() == Some(row.commit.hash.as_str());
        let resp = selectable_row(ui, selected, u, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(lane_label(&row))
                        .monospace()
                        .small()
                        .color(rgb(u.accent)),
                );
                ui.vertical(|ui| {
                    ui.label(RichText::new(&row.commit.subject).color(rgb(u.text)).strong());
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(&row.commit.short_hash)
                                .monospace()
                                .small()
                                .color(rgb(u.text_muted)),
                        );
                        ui.label(
                            RichText::new(&row.commit.author)
                                .small()
                                .color(rgb(u.text_muted)),
                        );
                        for r in &row.commit.refs {
                            ui.label(
                                RichText::new(r.as_str())
                                    .small()
                                    .color(rgb(u.ref_fg))
                                    .background_color(rgb(u.ref_bg)),
                            );
                        }
                    });
                });
            });
        });
        if resp.clicked() {
            if !app.guard_dirty() {
                continue;
            }
            let hash = row.commit.hash.clone();
            app.selected_commit = Some(hash.clone());
            app.session.clear();
            app.load_commit_files(&hash);
        }
    }
}

pub fn show_commit_files(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars) {
    if app.selected_commit.is_none() {
        ui.label(RichText::new("Select a commit").small().color(rgb(u.text_muted)));
        return;
    }
    let files = app.commit_files.clone();
    for f in files {
        let selected = matches!(
            &app.session.source,
            Some(DiffSource::Commit { path, .. }) if path == &f.path
        );
        let status_color = rgb(f.status.ui_color(u));
        let resp = selectable_row(ui, selected, u, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(f.status.letter())
                        .monospace()
                        .color(status_color),
                );
                ui.label(RichText::new(&f.path).small().color(rgb(u.text)));
            });
        });
        if resp.clicked() {
            if !app.guard_dirty() {
                continue;
            }
            if let Some(hash) = app.selected_commit.clone() {
                app.load_commit_diff(&hash, &f.path, f.old_path.as_deref());
            }
        }
    }
}
