use std::path::{Path, PathBuf};

use conflicto_core::{
    get_commit_file_diff, get_file_diff, get_theme, layout_commit_graph, list_changes,
    list_commit_files, list_commits, load_preferences, load_recent_repos, remember_repo,
    remove_recent_repo, resolve_repo, save_preferences, stage_paths, unstage_paths,
    write_working_tree_file, AppPreferences, ChangeEntry, ChangeSide, ChangeStatus, ColorScheme,
    CommitFile, CommitInfo, FileDiff, GraphRow, RecentRepo, RepoInfo, ThemeId, UiVars, ViewMode,
};
use egui::{Color32, FontFamily, FontId, Key, Modifiers, RichText, ScrollArea, Sense, Ui};
use similar::{ChangeTag, DiffOp, TextDiff};

const SIDEBAR_W: f32 = 320.0;
const TOOLBAR_H: f32 = 42.0;
const LINE_FONT: f32 = 13.0;

fn rgb(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

fn tint(bg: [u8; 3], accent: [u8; 3], amount: f32) -> Color32 {
    let t = amount.clamp(0.0, 1.0);
    Color32::from_rgb(
        (bg[0] as f32 + (accent[0] as f32 - bg[0] as f32) * t).round() as u8,
        (bg[1] as f32 + (accent[1] as f32 - bg[1] as f32) * t).round() as u8,
        (bg[2] as f32 + (accent[2] as f32 - bg[2] as f32) * t).round() as u8,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LineKind {
    Equal,
    Delete,
    Insert,
    Gap,
}

#[derive(Clone)]
struct DiffLine {
    text: String,
    kind: LineKind,
    /// 1-based line number in that side's file; None for gap rows
    line_no: Option<usize>,
}

fn aligned_diff_lines(old: &str, new: &str) -> (Vec<DiffLine>, Vec<DiffLine>) {
    let diff = TextDiff::from_lines(old, new);
    let mut left = Vec::new();
    let mut right = Vec::new();
    let mut old_no = 1usize;
    let mut new_no = 1usize;

    for op in diff.ops() {
        match *op {
            DiffOp::Equal { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text: text.clone(),
                        kind: LineKind::Equal,
                        line_no: Some(old_no),
                    });
                    right.push(DiffLine {
                        text,
                        kind: LineKind::Equal,
                        line_no: Some(new_no),
                    });
                    old_no += 1;
                    new_no += 1;
                }
            }
            DiffOp::Delete { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text,
                        kind: LineKind::Delete,
                        line_no: Some(old_no),
                    });
                    right.push(DiffLine {
                        text: String::new(),
                        kind: LineKind::Gap,
                        line_no: None,
                    });
                    old_no += 1;
                }
            }
            DiffOp::Insert { .. } => {
                for change in diff.iter_changes(op) {
                    let text = change.to_string_lossy().trim_end_matches('\n').to_string();
                    left.push(DiffLine {
                        text: String::new(),
                        kind: LineKind::Gap,
                        line_no: None,
                    });
                    right.push(DiffLine {
                        text,
                        kind: LineKind::Insert,
                        line_no: Some(new_no),
                    });
                    new_no += 1;
                }
            }
            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                let old_slice = &diff.old_slices()[old_index..old_index + old_len];
                let new_slice = &diff.new_slices()[new_index..new_index + new_len];
                let max = old_len.max(new_len);
                for i in 0..max {
                    if i < old_len {
                        left.push(DiffLine {
                            text: old_slice[i].trim_end_matches('\n').to_string(),
                            kind: LineKind::Delete,
                            line_no: Some(old_no),
                        });
                        old_no += 1;
                    } else {
                        left.push(DiffLine {
                            text: String::new(),
                            kind: LineKind::Gap,
                            line_no: None,
                        });
                    }
                    if i < new_len {
                        right.push(DiffLine {
                            text: new_slice[i].trim_end_matches('\n').to_string(),
                            kind: LineKind::Insert,
                            line_no: Some(new_no),
                        });
                        new_no += 1;
                    } else {
                        right.push(DiffLine {
                            text: String::new(),
                            kind: LineKind::Gap,
                            line_no: None,
                        });
                    }
                }
            }
        }
    }

    (left, right)
}

fn line_fill(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Equal => Color32::TRANSPARENT,
        LineKind::Delete => tint(u.bg, u.status_d, 0.28),
        LineKind::Insert => tint(u.bg, u.status_a, 0.28),
        LineKind::Gap => tint(u.bg, u.text_muted, 0.08),
    }
}

fn line_text_color(kind: LineKind, u: &UiVars) -> Color32 {
    match kind {
        LineKind::Delete => rgb(u.status_d),
        LineKind::Insert => rgb(u.status_a),
        LineKind::Gap => rgb(u.text_muted),
        LineKind::Equal => rgb(u.text),
    }
}

fn render_diff_lines(ui: &mut Ui, lines: &[DiffLine], u: &UiVars) {
    ui.spacing_mut().item_spacing.y = 0.0;
    for line in lines {
        let fill = line_fill(line.kind, u);
        egui::Frame::NONE
            .fill(fill)
            .inner_margin(egui::Margin::symmetric(6, 1))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 8.0;
                    let gutter = match line.line_no {
                        Some(n) => format!("{n:>4}"),
                        None => "    ".into(),
                    };
                    ui.label(
                        RichText::new(gutter)
                            .monospace()
                            .size(LINE_FONT)
                            .color(rgb(u.text_muted)),
                    );
                    let marker = match line.kind {
                        LineKind::Delete => "−",
                        LineKind::Insert => "+",
                        LineKind::Equal => " ",
                        LineKind::Gap => " ",
                    };
                    ui.label(
                        RichText::new(marker)
                            .monospace()
                            .size(LINE_FONT)
                            .color(line_text_color(line.kind, u)),
                    );
                    ui.label(
                        RichText::new(&line.text)
                            .monospace()
                            .size(LINE_FONT)
                            .color(line_text_color(line.kind, u)),
                    );
                });
            });
    }
}

#[derive(Clone)]
struct Selection {
    path: String,
    side: ChangeSide,
}

pub struct ConflictoApp {
    prefs: AppPreferences,
    ui_vars: UiVars,
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
}

impl ConflictoApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let prefs = load_preferences();
        let pack = get_theme(prefs.theme_id);
        let mut app = Self {
            prefs,
            ui_vars: pack.ui,
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
        self.ui_vars = get_theme(id).ui;
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

        egui::SidePanel::right("sidebar")
            .exact_width(SIDEBAR_W)
            .resizable(false)
            .frame(egui::Frame::NONE.fill(rgb(u.bg_sidebar)))
            .show(ctx, |ui| {
                self.ui_sidebar(ui, &u);
            });

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(rgb(u.bg)))
            .show(ctx, |ui| {
                self.ui_main(ui, &u);
            });
    }
}

impl ConflictoApp {
    fn ui_sidebar(&mut self, ui: &mut Ui, u: &UiVars) {
        ui.set_min_height(ui.available_height());

        // Header
        egui::Frame::NONE
            .fill(rgb(u.bg_surface))
            .inner_margin(egui::Margin::symmetric(12, 8))
            .show(ui, |ui| {
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
        // Toolbar
        egui::Frame::NONE
            .fill(rgb(u.bg_surface))
            .inner_margin(egui::Margin {
                left: 80,
                right: 12,
                top: 0,
                bottom: 0,
            })
            .show(ui, |ui| {
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
        let original = diff.original.clone();
        let modified = if editable {
            self.edit_buffer.clone()
        } else {
            diff.modified.clone()
        };
        let (left_lines, right_lines) = aligned_diff_lines(&original, &modified);

        if self.side_by_side {
            ui.columns(2, |cols| {
                cols[0].label(
                    RichText::new("Original")
                        .small()
                        .color(rgb(u.text_muted)),
                );
                ScrollArea::both()
                    .id_salt("diff_left")
                    .auto_shrink([false, false])
                    .show(&mut cols[0], |ui| {
                        render_diff_lines(ui, &left_lines, u);
                    });

                cols[1].horizontal(|ui| {
                    ui.label(
                        RichText::new(if editable {
                            "Working Tree (editable)"
                        } else {
                            "Modified"
                        })
                        .small()
                        .color(rgb(u.text_muted)),
                    );
                });

                if editable {
                    // Colored preview + editable buffer under it.
                    let preview_h = (cols[1].available_height() * 0.45).max(120.0);
                    ScrollArea::both()
                        .id_salt("diff_right_preview")
                        .max_height(preview_h)
                        .auto_shrink([false, false])
                        .show(&mut cols[1], |ui| {
                            render_diff_lines(ui, &right_lines, u);
                        });
                    cols[1].label(
                        RichText::new("Edit")
                            .small()
                            .color(rgb(u.text_muted)),
                    );
                    ScrollArea::both()
                        .id_salt("diff_right_edit")
                        .auto_shrink([false, false])
                        .show(&mut cols[1], |ui| {
                            let response = ui.add(
                                egui::TextEdit::multiline(&mut self.edit_buffer)
                                    .code_editor()
                                    .desired_width(f32::INFINITY)
                                    .font(FontId::new(LINE_FONT, FontFamily::Monospace))
                                    .text_color(rgb(u.text)),
                            );
                            if response.changed() {
                                self.dirty = self.edit_buffer != diff.modified;
                                self.status = None;
                            }
                        });
                } else {
                    ScrollArea::both()
                        .id_salt("diff_right")
                        .auto_shrink([false, false])
                        .show(&mut cols[1], |ui| {
                            render_diff_lines(ui, &right_lines, u);
                        });
                }
            });
        } else {
            ScrollArea::both()
                .id_salt("diff_inline")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.spacing_mut().item_spacing.y = 0.0;
                    let text_diff = TextDiff::from_lines(&original, &modified);
                    for change in text_diff.iter_all_changes() {
                        let (prefix, kind) = match change.tag() {
                            ChangeTag::Delete => ("− ", LineKind::Delete),
                            ChangeTag::Insert => ("+ ", LineKind::Insert),
                            ChangeTag::Equal => ("  ", LineKind::Equal),
                        };
                        let fill = line_fill(kind, u);
                        let color = line_text_color(kind, u);
                        let text = change.to_string_lossy();
                        egui::Frame::NONE
                            .fill(fill)
                            .inner_margin(egui::Margin::symmetric(6, 1))
                            .show(ui, |ui| {
                                ui.set_width(ui.available_width());
                                ui.label(
                                    RichText::new(format!("{prefix}{text}"))
                                        .monospace()
                                        .size(LINE_FONT)
                                        .color(color),
                                );
                            });
                    }

                    if editable {
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new("Edit working tree")
                                .small()
                                .color(rgb(u.text_muted)),
                        );
                        let response = ui.add(
                            egui::TextEdit::multiline(&mut self.edit_buffer)
                                .code_editor()
                                .desired_width(f32::INFINITY)
                                .desired_rows(16)
                                .font(FontId::new(LINE_FONT, FontFamily::Monospace))
                                .text_color(rgb(u.text)),
                        );
                        if response.changed() {
                            self.dirty = self.edit_buffer != diff.modified;
                        }
                    }
                });
        }
    }
}
