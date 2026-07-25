mod theme;
mod ui;

use std::path::{Path, PathBuf};

use conflicto_core::{
    get_commit_file_diff, get_file_diff, get_theme, layout_commit_graph, list_changes,
    list_commit_files, list_commits, load_preferences, load_recent_repos, remember_repo,
    resolve_repo, save_preferences, stage_paths, unstage_paths, write_working_tree_file,
    AppPreferences, ChangeEntry, ChangeSide, ColorScheme, CommitFile, CommitInfo, FileDiff,
    GraphRow, HighlightPalette, RecentRepo, RepoInfo, ThemeId, UiVars,
};
use egui::{Key, Modifiers};

use crate::diff_widget::{DiffScroll, DiffViewCache};

use ui::widgets::{rgb, SIDEBAR_W};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum ViewMode {
    #[default]
    Changes,
    Graph,
}

#[derive(Clone)]
enum DiffSource {
    Change {
        path: String,
        side: ChangeSide,
        old_path: Option<String>,
    },
    Commit {
        hash: String,
        path: String,
        old_path: Option<String>,
    },
}

#[derive(Default)]
struct DiffSession {
    source: Option<DiffSource>,
    diff: Option<FileDiff>,
    edit_buffer: String,
    dirty: bool,
    scroll: DiffScroll,
    cache: DiffViewCache,
}

impl DiffSession {
    fn reset_view(&mut self) {
        self.scroll.reset();
        self.cache.reset();
    }

    fn clear(&mut self) {
        self.source = None;
        self.diff = None;
        self.edit_buffer.clear();
        self.dirty = false;
        self.reset_view();
    }

    fn apply_loaded(&mut self, source: DiffSource, diff: FileDiff) {
        self.edit_buffer = diff.modified.clone();
        self.dirty = false;
        self.diff = Some(diff);
        self.source = Some(source);
        self.reset_view();
    }
}

pub struct ConflictoApp {
    prefs: AppPreferences,
    ui_vars: UiVars,
    color_scheme: ColorScheme,
    hl_palette: HighlightPalette,
    repo: Option<RepoInfo>,
    recent: Vec<RecentRepo>,
    changes: Vec<ChangeEntry>,
    session: DiffSession,
    side_by_side: bool,
    view_mode: ViewMode,
    commits: Vec<CommitInfo>,
    graph_rows: Vec<GraphRow>,
    /// Commit whose files are listed (may be set without an open DiffSource).
    selected_commit: Option<String>,
    commit_files: Vec<CommitFile>,
    error: Option<String>,
    status: Option<String>,
}

impl ConflictoApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let prefs = load_preferences();
        let pack = get_theme(prefs.theme_id);
        let hl_palette = HighlightPalette::from_ui(&pack.ui, pack.scheme);
        let mut app = Self {
            prefs,
            ui_vars: pack.ui,
            color_scheme: pack.scheme,
            hl_palette,
            repo: None,
            recent: load_recent_repos(),
            changes: Vec::new(),
            session: DiffSession::default(),
            side_by_side: true,
            view_mode: ViewMode::Changes,
            commits: Vec::new(),
            graph_rows: Vec::new(),
            selected_commit: None,
            commit_files: Vec::new(),
            error: None,
            status: None,
        };
        theme::apply_theme_visuals(&cc.egui_ctx, &app.ui_vars, app.color_scheme);
        if let Some(path) = app.prefs.last_repo_path.clone() {
            if Path::new(&path).is_dir() {
                app.open_repo_path(&path);
            }
        }
        app
    }

    fn set_theme(&mut self, ctx: &egui::Context, id: ThemeId) {
        self.prefs.theme_id = id;
        let pack = get_theme(id);
        self.ui_vars = pack.ui.clone();
        self.color_scheme = pack.scheme;
        self.hl_palette = HighlightPalette::from_ui(&pack.ui, pack.scheme);
        theme::apply_theme_visuals(ctx, &self.ui_vars, self.color_scheme);
        let _ = save_preferences(&self.prefs);
    }

    fn guard_dirty(&mut self) -> bool {
        if self.session.dirty {
            self.status = Some("Save or discard edits before switching files".into());
            false
        } else {
            true
        }
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
                self.session.clear();
                self.selected_commit = None;
                self.commit_files.clear();
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

        match self.session.source.clone() {
            Some(DiffSource::Change {
                path,
                side,
                old_path,
            }) => {
                if self
                    .changes
                    .iter()
                    .any(|c| c.path == path && c.side == side)
                {
                    self.load_change_diff(&path, side, old_path.as_deref());
                } else {
                    self.session.clear();
                }
            }
            Some(DiffSource::Commit {
                hash,
                path,
                old_path,
            }) => {
                self.load_commit_files(&hash);
                self.load_commit_diff(&hash, &path, old_path.as_deref());
            }
            None => {
                if let Some(hash) = self.selected_commit.clone() {
                    self.load_commit_files(&hash);
                }
            }
        }

        if let Ok(info) = resolve_repo(&root) {
            self.repo = Some(info);
        }
    }

    fn load_change_diff(&mut self, path: &str, side: ChangeSide, old_path: Option<&str>) {
        let Some(repo) = &self.repo else { return };
        match get_file_diff(Path::new(&repo.root), path, old_path, side) {
            Ok(diff) => {
                self.session.apply_loaded(
                    DiffSource::Change {
                        path: path.to_string(),
                        side,
                        old_path: old_path.map(str::to_string),
                    },
                    diff,
                );
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn select_change(&mut self, entry: &ChangeEntry) {
        if !self.guard_dirty() {
            return;
        }
        self.selected_commit = None;
        self.commit_files.clear();
        self.load_change_diff(&entry.path, entry.side, entry.old_path.as_deref());
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

    fn load_commit_diff(&mut self, hash: &str, path: &str, old_path: Option<&str>) {
        let Some(repo) = &self.repo else { return };
        match get_commit_file_diff(Path::new(&repo.root), hash, path, old_path) {
            Ok(diff) => {
                self.session.apply_loaded(
                    DiffSource::Commit {
                        hash: hash.to_string(),
                        path: path.to_string(),
                        old_path: old_path.map(str::to_string),
                    },
                    diff,
                );
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn save_edit(&mut self) {
        let Some(repo) = self.repo.clone() else { return };
        let Some(DiffSource::Change {
            path,
            side: ChangeSide::Unstaged,
            ..
        }) = self.session.source.clone()
        else {
            return;
        };
        if !self.session.dirty {
            return;
        }
        match write_working_tree_file(Path::new(&repo.root), &path, &self.session.edit_buffer) {
            Ok(()) => {
                self.session.dirty = false;
                self.status = Some(format!("Saved {path}"));
                self.refresh_all();
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    fn can_edit(&self) -> bool {
        matches!(
            &self.session.source,
            Some(DiffSource::Change {
                side: ChangeSide::Unstaged,
                ..
            })
        ) && self.session.diff.is_some()
    }

    fn with_repo_paths(
        &mut self,
        path: &str,
        action: impl FnOnce(&Path, &[String]) -> Result<(), conflicto_core::GitError>,
    ) {
        let Some(repo) = self.repo.clone() else { return };
        if let Err(e) = action(Path::new(&repo.root), &[path.to_string()]) {
            self.error = Some(e.to_string());
        } else {
            self.refresh_all();
        }
    }

    fn stage_selected(&mut self, path: &str) {
        self.with_repo_paths(path, stage_paths);
    }

    fn unstage_selected(&mut self, path: &str) {
        self.with_repo_paths(path, unstage_paths);
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
                            egui::Frame::NONE.fill(rgb(u.bg)).show(ui, |ui| {
                                ui.set_min_size(ui.available_size());
                                ui::show_main(ui, self, &u);
                            });
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(SIDEBAR_W, full.y),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            egui::Frame::NONE.fill(rgb(u.bg_sidebar)).show(ui, |ui| {
                                ui.set_min_size(ui.available_size());
                                ui::show_sidebar(ui, self, &u);
                            });
                        },
                    );
                });
            });
    }
}
