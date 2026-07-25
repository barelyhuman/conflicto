use std::path::Path;

use conflicto_core::{remove_recent_repo, ChangeSide, UiVars};
use egui::{RichText, ScrollArea, Ui};

use super::changes;
use super::graph;
use super::widgets::{accordion_header, rgb};
use crate::app::{ConflictoApp, ViewMode};

pub fn show(ui: &mut Ui, app: &mut ConflictoApp, u: &UiVars) {
    ui.set_min_size(ui.available_size());

    // Match the 42px chrome strip: 6px vertical margin → ~30px controls.
    const CONTROL_H: f32 = 30.0;
    egui::Frame::NONE
        .fill(rgb(u.bg_surface))
        .inner_margin(egui::Margin::symmetric(12, 6))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_height(CONTROL_H);
            ui.spacing_mut().button_padding = egui::vec2(10.0, 4.0);
            ui.spacing_mut().interact_size.y = CONTROL_H;
            ui.horizontal(|ui| {
                let label = app
                    .repo
                    .as_ref()
                    .map(|r| {
                        Path::new(&r.root)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("repo")
                            .to_string()
                    })
                    .unwrap_or_else(|| "Open repo…".into());

                let refresh_size = egui::vec2(CONTROL_H, CONTROL_H);
                let combo_w = (ui.available_width() - ui.spacing().item_spacing.x - refresh_size.x)
                    .max(80.0);

                egui::ComboBox::from_id_salt("repo_switcher")
                    .selected_text(RichText::new(&label).color(rgb(u.text)))
                    .width(combo_w)
                    .show_ui(ui, |ui| {
                        ui.set_min_width(combo_w);
                        if ui
                            .add_sized(
                                [ui.available_width(), ui.spacing().interact_size.y],
                                egui::SelectableLabel::new(false, "Browse…"),
                            )
                            .clicked()
                        {
                            app.open_repo_dialog();
                        }
                        ui.separator();
                        let recent = app.recent.clone();
                        let current_root = app.repo.as_ref().map(|repo| repo.root.clone());
                        for r in recent {
                            ui.horizontal(|ui| {
                                let selected =
                                    current_root.as_ref().is_some_and(|root| root == &r.root);
                                let x_w = ui.spacing().interact_size.y;
                                let name_w =
                                    (ui.available_width() - x_w - ui.spacing().item_spacing.x)
                                        .max(40.0);
                                if ui
                                    .add_sized(
                                        [name_w, ui.spacing().interact_size.y],
                                        egui::SelectableLabel::new(selected, &r.name),
                                    )
                                    .clicked()
                                {
                                    app.open_repo_path(&r.root);
                                }
                                if ui
                                    .add(
                                        egui::Button::new("×")
                                            .frame(false)
                                            .min_size(egui::vec2(x_w, x_w)),
                                    )
                                    .on_hover_text("Remove from recent")
                                    .clicked()
                                {
                                    app.recent = remove_recent_repo(&r.root);
                                }
                            });
                        }
                    });

                if ui
                    .add(
                        egui::Button::new(RichText::new("↻").size(18.0)).min_size(refresh_size),
                    )
                    .on_hover_text("Refresh (⌘R)")
                    .clicked()
                {
                    app.refresh_all();
                }
            });
        });

    if let Some(repo) = &app.repo {
        ui.add_space(4.0);
        egui::Frame::NONE
            .inner_margin(egui::Margin::symmetric(12, 8))
            .show(ui, |ui| {
                ui.label(RichText::new(&repo.branch).strong().color(rgb(u.text)));
                ui.label(RichText::new(&repo.root).small().color(rgb(u.text_muted)));
            });
    } else {
        ui.add_space(8.0);
        ui.label(
            RichText::new("Open a git repository to get started.\n⌘O to browse.")
                .color(rgb(u.text_muted)),
        );
    }

    ui.add_space(4.0);

    let changes_open = app.view_mode == ViewMode::Changes;
    let staged_n = app
        .changes
        .iter()
        .filter(|c| c.side == ChangeSide::Staged)
        .count();
    let unstaged_n = app
        .changes
        .iter()
        .filter(|c| c.side == ChangeSide::Unstaged)
        .count();
    if accordion_header(ui, u, format!("CHANGES  {staged_n}|{unstaged_n}")) {
        app.view_mode = ViewMode::Changes;
    }

    if changes_open {
        ScrollArea::vertical()
            .id_salt("changes_scroll")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                changes::show_section(ui, app, u, "STAGED", ChangeSide::Staged);
                changes::show_section(ui, app, u, "WORKING TREE", ChangeSide::Unstaged);
            });
    }

    if accordion_header(ui, u, format!("GRAPH  {}", app.commits.len())) {
        app.view_mode = ViewMode::Graph;
    }

    if app.view_mode == ViewMode::Graph {
        let avail = ui.available_height();
        let list_h = (avail * 0.6).max(120.0);
        ScrollArea::vertical()
            .id_salt("graph_scroll")
            .max_height(list_h)
            .auto_shrink([false, false])
            .show(ui, |ui| {
                graph::show_list(ui, app, u);
            });
        ui.separator();
        ScrollArea::vertical()
            .id_salt("commit_files_scroll")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                egui::Frame::NONE.fill(rgb(u.bg_surface)).show(ui, |ui| {
                    graph::show_commit_files(ui, app, u);
                });
            });
    }
}
