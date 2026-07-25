use std::path::{Path, PathBuf};

use conflicto_core::{
    get_commit_file_diff, get_file_diff, get_theme, layout_commit_graph, list_changes,
    list_commit_files, list_commits, load_preferences, load_recent_repos, remember_repo,
    remove_recent_repo, resolve_repo, save_preferences, stage_paths, unstage_paths,
    write_working_tree_file, AppPreferences, ChangeEntry, ChangeSide, ChangeStatus, ColorScheme,
    CommitFile, CommitInfo, FileDiff, GraphRow, HighlightPalette, RecentRepo, RepoInfo, ThemeId,
    UiVars, ViewMode,
};
use egui::{Color32, Key, Modifiers, RichText, ScrollArea, Sense, Ui};

use crate::diff_widget::{self, DiffScroll, DiffViewCache};

const SIDEBAR_W: f32 = 320.0;
const TOOLBAR_H: f32 = 42.0;
/// Leading inset so toolbar widgets clear native traffic lights (fullsize content).
#[cfg(target_os = "macos")]
const MAC_TRAFFIC_INSET_X: f32 = 76.0;
#[cfg(not(target_os = "macos"))]
const MAC_TRAFFIC_INSET_X: f32 = 0.0;

fn rgb(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

#[derive(Clone)]
struct Selection {
    path: String,
    side: ChangeSide,
}

pub struct ConflictoApp {
    prefs: AppPreferences,
    ui_vars: UiVars,
    hl_palette: HighlightPalette,
    repo: Option<RepoInfo>,
    recent: Vec<RecentRepo>,
    changes: Vec<ChangeEntry>,
    selection: Option<Selection>,
    diff: Option<FileDiff>,
    /// Editable buffer for unstaged modified side
    edit_buffer: String,
    dirty: bool,
    side_by_side: bool,
    view_mode: ViewMode,
    commits: Vec<CommitInfo>,
    graph_rows: Vec<GraphRow>,
    selected_commit: Option<String>,
    commit_files: Vec<CommitFile>,
    selected_commit_file: Option<String>,
    error: Option<String>,
    status: Option<String>,
    /// Linked scroll for side-by-side (and inline) diff panes
    diff_scroll: DiffScroll,
    /// Highlight + alignment cache (invalidated on content change)
    diff_cache: DiffViewCache,
}

impl ConflictoApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let prefs = load_preferences();
        let pack = get_theme(prefs.theme_id);
        let hl_palette = HighlightPalette::from_ui(&pack.ui, pack.scheme);
        let mut app = Self {
            prefs,
            ui_vars: pack.ui,
            hl_palette,
            repo: None,
            recent: load_recent_repos(),
            changes: Vec::new(),
            selection: None,
            diff: None,
            edit_buffer: String::new(),
            dirty: false,
            side_by_side: true,
            view_mode: ViewMode::Changes,
            commits: Vec::new(),
            graph_rows: Vec::new(),
            selected_commit: None,
            commit_files: Vec::new(),
            selected_commit_file: None,
            error: None,
            status: None,
            diff_scroll: DiffScroll::default(),
            diff_cache: DiffViewCache::default(),
        };
        app.apply_theme_visuals(&cc.egui_ctx);
        if let Some(path) = app.prefs.last_repo_path.clone() {
            if Path::new(&path).is_dir() {
                app.open_repo_path(&path);
            }
        }
        app
    }

    fn apply_theme_visuals(&self, ctx: &egui::Context) {
        let u = &self.ui_vars;
        let mut visuals = if matches!(get_theme(self.prefs.theme_id).scheme, ColorScheme::Light) {
            egui::Visuals::light()
        } else {
            egui::Visuals::dark()
        };
        visuals.panel_fill = rgb(u.bg);
        visuals.window_fill = rgb(u.bg);
        visuals.extreme_bg_color = rgb(u.bg_sidebar);
        visuals.faint_bg_color = rgb(u.bg_surface);
        visuals.widgets.noninteractive.bg_fill = rgb(u.btn_bg);
        visuals.widgets.inactive.bg_fill = rgb(u.btn_bg);
        visuals.widgets.hovered.bg_fill = rgb(u.btn_hover);
        visuals.widgets.active.bg_fill = rgb(u.bg_active);
        visuals.selection.bg_fill = rgb(u.bg_active);
        visuals.override_text_color = Some(rgb(u.text));
        visuals.widgets.noninteractive.fg_stroke.color = rgb(u.text);
        visuals.widgets.inactive.fg_stroke.color = rgb(u.text);
        ctx.set_visuals(visuals);
    }

    fn set_theme(&mut self, ctx: &egui::Context, id: ThemeId) {
        self.prefs.theme_id = id;
        let pack = get_theme(id);
        self.ui_vars = pack.ui.clone();
        self.hl_palette = HighlightPalette::from_ui(&pack.ui, pack.scheme);
        self.apply_theme_visuals(ctx);
        let _ = save_preferences(&self.prefs);
    }

    fn open_repo_dialog(&mut self) {
        if let Some(path) = rfd::FileDialog::new().pick_folder() {
            self.open_repo_path(&path.to_string_lossy());
        }
    }

    fn open_repo_path(&mut self, path: &str) {
        match resolve_repo(Path::new(path)) {
            Ok(info) => {
                self.prefs.last_repo_path = Some(info.root.clone());
                let _ = save_preferences(&self.prefs);
                self.recent = remember_repo(&info.root);
                self.repo = Some(info);
                self.error = None;
                self.selection = None;
                self.diff = None;
                self.edit_buffer.clear();
                self.dirty = false;
                self.selected_commit = None;
                self.commit_files.clear();
                self.selected_commit_file = None;
                self.refresh_all();
            }
            Err(e) => {
                self.error = Some(e.to_string());
            }
        }
    }

    fn refresh_all(&mut self) {
        let Some(repo) = self.repo.clone() else {
            return;
        };
        let root = PathBuf::from(&repo.root);
        match list_changes(&root) {
            Ok(changes) => {
                self.changes = changes;
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
        match list_commits(&root, None) {
            Ok(commits) => {
                self.graph_rows = layout_commit_graph(&commits);
                self.commits = commits;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
        // Refresh current diff if still valid
        if let Some(sel) = self.selection.clone() {
            if self
                .changes
                .iter()
                .any(|c| c.path == sel.path && c.side == sel.side)
            {
                self.load_change_diff(&sel);
            } else {
                self.selection = None;
                self.diff = None;
                self.edit_buffer.clear();
                self.dirty = false;
            }
        }
        if let Some(hash) = self.selected_commit.clone() {
            self.load_commit_files(&hash);
            if let Some(path) = self.selected_commit_file.clone() {
                self.load_commit_diff(&hash, &path);
            }
        }
        // Update branch label
        if let Ok(info) = resolve_repo(&root) {
            self.repo = Some(info);
        }
    }

    fn load_change_diff(&mut self, sel: &Selection) {
        let Some(repo) = &self.repo else { return };
        match get_file_diff(Path::new(&repo.root), &sel.path, sel.side) {
            Ok(diff) => {
                self.edit_buffer = diff.modified.clone();
                self.dirty = false;
                self.diff = Some(diff);
                self.diff_scroll.reset();
                self.diff_cache.reset();
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn select_change(&mut self, entry: &ChangeEntry) {
        if self.dirty {
            self.status = Some("Save or discard edits before switching files".into());
            return;
        }
        let sel = Selection {
            path: entry.path.clone(),
            side: entry.side,
        };
        self.selection = Some(sel.clone());
        self.selected_commit = None;
        self.selected_commit_file = None;
        self.load_change_diff(&sel);
    }

    fn load_commit_files(&mut self, hash: &str) {
        let Some(repo) = &self.repo else { return };
        match list_commit_files(Path::new(&repo.root), hash) {
            Ok(files) => {
                self.commit_files = files;
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn load_commit_diff(&mut self, hash: &str, path: &str) {
        let Some(repo) = &self.repo else { return };
        match get_commit_file_diff(Path::new(&repo.root), hash, path) {
            Ok(diff) => {
                self.edit_buffer = diff.modified.clone();
                self.dirty = false;
                self.diff = Some(diff);
                self.diff_scroll.reset();
                self.diff_cache.reset();
                self.selection = None;
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn save_edit(&mut self) {
        let Some(repo) = self.repo.clone() else { return };
        let Some(sel) = self.selection.clone() else { return };
        if sel.side != ChangeSide::Unstaged || !self.dirty {
            return;
        }
        match write_working_tree_file(Path::new(&repo.root), &sel.path, &self.edit_buffer) {
            Ok(()) => {
                self.dirty = false;
                self.status = Some(format!("Saved {}", sel.path));
                self.refresh_all();
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn can_edit(&self) -> bool {
        matches!(
            &self.selection,
            Some(sel) if sel.side == ChangeSide::Unstaged
        ) && self.diff.is_some()
    }

    fn stage_selected(&mut self, path: &str) {
        let Some(repo) = self.repo.clone() else { return };
        if let Err(e) = stage_paths(Path::new(&repo.root), &[path.to_string()]) {
            self.error = Some(e.to_string());
        } else {
            self.refresh_all();
        }
    }

    fn unstage_selected(&mut self, path: &str) {
        let Some(repo) = self.repo.clone() else { return };
        if let Err(e) = unstage_paths(Path::new(&repo.root), &[path.to_string()]) {
            self.error = Some(e.to_string());
        } else {
            self.refresh_all();
        }
    }
}

impl eframe::App for ConflictoApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let meta = Modifiers::MAC_CMD | Modifiers::CTRL;
        if ctx.input_mut(|i| i.consume_key(meta, Key::O)) {
            self.open_repo_dialog();
        }
        if ctx.input_mut(|i| i.consume_key(meta, Key::R)) {
            self.refresh_all();
        }
        if ctx.input_mut(|i| i.consume_key(meta, Key::S)) {
            self.save_edit();
        }

        let u = self.ui_vars.clone();

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(rgb(u.bg)))
            .show(ctx, |ui| {
                let full = ui.available_size();
                let main_w = (full.x - SIDEBAR_W).max(200.0);
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 0.0;
                    ui.allocate_ui_with_layout(
                        egui::vec2(main_w, full.y),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            egui::Frame::NONE
                                .fill(rgb(u.bg))
                                .show(ui, |ui| {
                                    ui.set_min_size(ui.available_size());
                                    self.ui_main(ui, &u);
                                });
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(SIDEBAR_W, full.y),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            egui::Frame::NONE
                                .fill(rgb(u.bg_sidebar))
                                .show(ui, |ui| {
                                    ui.set_min_size(ui.available_size());
                                    self.ui_sidebar(ui, &u);
                                });
                        },
                    );
                });
            });
    }
}

impl ConflictoApp {
    fn ui_sidebar(&mut self, ui: &mut Ui, u: &UiVars) {
        ui.set_min_size(ui.available_size());

        // Header
        egui::Frame::NONE
            .fill(rgb(u.bg_surface))
            .inner_margin(egui::Margin::symmetric(12, 8))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.set_height(TOOLBAR_H - 4.0);
                ui.horizontal(|ui| {
                    let label = self
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

                    egui::ComboBox::from_id_salt("repo_switcher")
                        .selected_text(RichText::new(&label).color(rgb(u.text)))
                        .width(220.0)
                        .show_ui(ui, |ui| {
                            if ui.button("Browse…").clicked() {
                                self.open_repo_dialog();
                            }
                            ui.separator();
                            let recent = self.recent.clone();
                            for r in recent {
                                ui.horizontal(|ui| {
                                    if ui.button(&r.name).clicked() {
                                        self.open_repo_path(&r.root);
                                    }
                                    if ui.small_button("×").clicked() {
                                        self.recent = remove_recent_repo(&r.root);
                                    }
                                });
                            }
                        });

                    if ui
                        .add(egui::Button::new("↻").fill(rgb(u.btn_bg)))
                        .on_hover_text("Refresh (⌘R)")
                        .clicked()
                    {
                        self.refresh_all();
                    }
                });
            });

        if let Some(repo) = &self.repo {
            ui.add_space(4.0);
            ui.add_space(0.0);
            egui::Frame::NONE
                .inner_margin(egui::Margin::symmetric(12, 8))
                .show(ui, |ui| {
                    ui.label(RichText::new(&repo.branch).strong().color(rgb(u.text)));
                    ui.label(
                        RichText::new(&repo.root)
                            .small()
                            .color(rgb(u.text_muted)),
                    );
                });
        } else {
            ui.add_space(8.0);
            ui.label(
                RichText::new("Open a git repository to get started.\n⌘O to browse.")
                    .color(rgb(u.text_muted)),
            );
        }

        ui.add_space(4.0);

        // Accordion: Changes
        let changes_open = self.view_mode == ViewMode::Changes;
        egui::Frame::NONE
            .fill(rgb(u.bg_surface))
            .inner_margin(egui::Margin::symmetric(12, 6))
            .show(ui, |ui| {
                let staged_n = self.changes.iter().filter(|c| c.side == ChangeSide::Staged).count();
                let unstaged_n = self
                    .changes
                    .iter()
                    .filter(|c| c.side == ChangeSide::Unstaged)
                    .count();
                let title = format!("CHANGES  {}|{}", staged_n, unstaged_n);
                if ui
                    .add(egui::Button::new(RichText::new(title).small().color(rgb(u.text))).fill(Color32::TRANSPARENT))
                    .clicked()
                {
                    self.view_mode = ViewMode::Changes;
                }
            });

        if changes_open {
            ScrollArea::vertical()
                .id_salt("changes_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    self.ui_change_section(ui, u, "STAGED", ChangeSide::Staged);
                    self.ui_change_section(ui, u, "WORKING TREE", ChangeSide::Unstaged);
                });
        }

        // Accordion: Graph
        egui::Frame::NONE
            .fill(rgb(u.bg_surface))
            .inner_margin(egui::Margin::symmetric(12, 6))
            .show(ui, |ui| {
                if ui
                    .add(
                        egui::Button::new(
                            RichText::new(format!("GRAPH  {}", self.commits.len()))
                                .small()
                                .color(rgb(u.text)),
                        )
                        .fill(Color32::TRANSPARENT),
                    )
                    .clicked()
                {
                    self.view_mode = ViewMode::Graph;
                }
            });

        if self.view_mode == ViewMode::Graph {
            let avail = ui.available_height();
            let list_h = (avail * 0.6).max(120.0);
            ScrollArea::vertical()
                .id_salt("graph_scroll")
                .max_height(list_h)
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    self.ui_graph_list(ui, u);
                });
            ui.separator();
            ScrollArea::vertical()
                .id_salt("commit_files_scroll")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    egui::Frame::NONE
                        .fill(rgb(u.bg_surface))
                        .show(ui, |ui| {
                            self.ui_commit_files(ui, u);
                        });
                });
        }
    }

    fn ui_change_section(&mut self, ui: &mut Ui, u: &UiVars, title: &str, side: ChangeSide) {
        let entries: Vec<ChangeEntry> = self
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
            let selected = self
                .selection
                .as_ref()
                .is_some_and(|s| s.path == entry.path && s.side == entry.side);
            let status_color = match entry.status {
                ChangeStatus::Modified => rgb(u.status_m),
                ChangeStatus::Added | ChangeStatus::Untracked => rgb(u.status_a),
                ChangeStatus::Deleted => rgb(u.status_d),
                ChangeStatus::Renamed | ChangeStatus::Copied => rgb(u.status_r),
            };
            let fill = if selected {
                rgb(u.bg_active)
            } else {
                Color32::TRANSPARENT
            };
            let response = egui::Frame::NONE
                .fill(fill)
                .inner_margin(egui::Margin::symmetric(8, 4))
                .show(ui, |ui| {
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
                                        self.stage_selected(&entry.path);
                                    }
                                }
                                ChangeSide::Staged => {
                                    if ui.small_button("−").on_hover_text("Unstage").clicked() {
                                        self.unstage_selected(&entry.path);
                                    }
                                }
                            }
                        });
                    });
                })
                .response
                .interact(Sense::click());
            if response.clicked() {
                self.select_change(&entry);
            }
        }
    }

    fn ui_graph_list(&mut self, ui: &mut Ui, u: &UiVars) {
        let rows = self.graph_rows.clone();
        for row in rows {
            let selected = self.selected_commit.as_deref() == Some(row.commit.hash.as_str());
            let fill = if selected {
                rgb(u.bg_active)
            } else {
                Color32::TRANSPARENT
            };
            let resp = egui::Frame::NONE
                .fill(fill)
                .inner_margin(egui::Margin::symmetric(8, 4))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        // Simple lane indicator
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
                        ui.label(
                            RichText::new(lane_str)
                                .monospace()
                                .small()
                                .color(rgb(u.accent)),
                        );
                        ui.vertical(|ui| {
                            ui.label(
                                RichText::new(&row.commit.subject)
                                    .color(rgb(u.text))
                                    .strong(),
                            );
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
                })
                .response
                .interact(Sense::click());
            if resp.clicked() {
                if self.dirty {
                    self.status = Some("Save or discard edits before switching".into());
                } else {
                    let hash = row.commit.hash.clone();
                    self.selected_commit = Some(hash.clone());
                    self.selection = None;
                    self.selected_commit_file = None;
                    self.diff = None;
                    self.load_commit_files(&hash);
                }
            }
        }
    }

    fn ui_commit_files(&mut self, ui: &mut Ui, u: &UiVars) {
        if self.selected_commit.is_none() {
            ui.label(RichText::new("Select a commit").small().color(rgb(u.text_muted)));
            return;
        }
        let files = self.commit_files.clone();
        for f in files {
            let selected = self.selected_commit_file.as_deref() == Some(f.path.as_str());
            let fill = if selected {
                rgb(u.bg_active)
            } else {
                Color32::TRANSPARENT
            };
            let status_color = match f.status {
                ChangeStatus::Modified => rgb(u.status_m),
                ChangeStatus::Added | ChangeStatus::Untracked => rgb(u.status_a),
                ChangeStatus::Deleted => rgb(u.status_d),
                ChangeStatus::Renamed | ChangeStatus::Copied => rgb(u.status_r),
            };
            let resp = egui::Frame::NONE
                .fill(fill)
                .inner_margin(egui::Margin::symmetric(8, 3))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(f.status.letter())
                                .monospace()
                                .color(status_color),
                        );
                        ui.label(RichText::new(&f.path).small().color(rgb(u.text)));
                    });
                })
                .response
                .interact(Sense::click());
            if resp.clicked() {
                if self.dirty {
                    self.status = Some("Save or discard edits before switching".into());
                } else if let Some(hash) = self.selected_commit.clone() {
                    self.selected_commit_file = Some(f.path.clone());
                    self.load_commit_diff(&hash, &f.path);
                }
            }
        }
    }

    fn ui_main(&mut self, ui: &mut Ui, u: &UiVars) {
        ui.set_min_size(ui.available_size());

        // Toolbar — leading inset clears macOS traffic lights when using fullsize content.
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
                    let path_label = self.diff.as_ref().map(|d| {
                        let side = if let Some(sel) = &self.selection {
                            match sel.side {
                                ChangeSide::Staged => "STAGED",
                                ChangeSide::Unstaged => "WORKING TREE",
                            }
                        } else if let Some(hash) = &self.selected_commit {
                            self.commits
                                .iter()
                                .find(|c| &c.hash == hash)
                                .map(|c| c.short_hash.as_str())
                                .unwrap_or("COMMIT")
                        } else {
                            ""
                        };
                        format!("{side}  {}", d.path)
                    });
                    if let Some(label) = path_label {
                        let mut text = label;
                        if self.dirty {
                            text.push_str("  •");
                        }
                        ui.label(
                            RichText::new(text)
                                .monospace()
                                .color(rgb(u.text)),
                        );
                    } else {
                        ui.label(RichText::new("Select a file to diff").color(rgb(u.text_muted)));
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let toggle_fill = if self.side_by_side {
                            rgb(u.bg_active)
                        } else {
                            rgb(u.btn_bg)
                        };
                        let label = if self.side_by_side {
                            "Side by Side"
                        } else {
                            "Inline"
                        };
                        if ui
                            .add(
                                egui::Button::new(RichText::new(label).color(rgb(u.text)))
                                    .fill(toggle_fill)
                                    .stroke(egui::Stroke::new(1.0, rgb(u.accent))),
                            )
                            .clicked()
                        {
                            self.side_by_side = !self.side_by_side;
                        }

                        egui::ComboBox::from_id_salt("theme_picker")
                            .selected_text(self.prefs.theme_id.label())
                            .show_ui(ui, |ui| {
                                for id in ThemeId::all() {
                                    if ui
                                        .selectable_label(
                                            self.prefs.theme_id == *id,
                                            id.label(),
                                        )
                                        .clicked()
                                    {
                                        self.set_theme(ui.ctx(), *id);
                                    }
                                }
                            });
                        ui.label(RichText::new("Theme").small().color(rgb(u.text_muted)));

                        if self.can_edit() && self.dirty && ui.button("Save").clicked() {
                            self.save_edit();
                        }
                    });
                });
            });

        if let Some(err) = &self.error {
            egui::Frame::NONE
                .fill(rgb(u.danger_bg))
                .stroke(egui::Stroke::new(1.0, rgb(u.danger_border)))
                .inner_margin(8.0)
                .show(ui, |ui| {
                    ui.label(RichText::new(err).color(rgb(u.danger_fg)));
                });
        }
        if let Some(status) = &self.status {
            ui.label(RichText::new(status).small().color(rgb(u.text_muted)));
        }

        ui.add_space(4.0);

        if self.diff.is_some() {
            self.ui_diff(ui, u);
        } else {
            ui.centered_and_justified(|ui| {
                ui.label(RichText::new("No diff selected").color(rgb(u.text_muted)));
            });
        }
    }

    fn ui_diff(&mut self, ui: &mut Ui, u: &UiVars) {
        let Some(diff) = self.diff.clone() else { return };
        let editable = self.can_edit();
        let palette = self.hl_palette.clone();
        let edit = if editable {
            Some(&mut self.edit_buffer)
        } else {
            None
        };

        let outcome = if self.side_by_side {
            diff_widget::show_side_by_side(
                ui,
                u,
                &palette,
                &diff.path,
                &diff.original,
                &diff.modified,
                edit,
                &mut self.diff_scroll,
                &mut self.diff_cache,
            )
        } else {
            diff_widget::show_inline(
                ui,
                u,
                &palette,
                &diff.path,
                &diff.original,
                &diff.modified,
                edit,
                &mut self.diff_scroll,
                &mut self.diff_cache,
            )
        };

        if outcome.buffer_changed {
            self.dirty = self.edit_buffer != diff.modified;
            self.status = None;
        }
    }
}