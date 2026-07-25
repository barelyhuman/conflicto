//! Headless app domain: open/refresh/stage/save wired to git + session.

use std::path::{Path, PathBuf};

use crate::git::{
    get_commit_file_diff, get_file_diff, list_changes, list_commit_files, list_commits, resolve_repo,
    stage_paths, unstage_paths, write_working_tree_file,
};
use crate::graph::layout_commit_graph;
use crate::highlight::HighlightPalette;
use crate::models::*;
use crate::prefs::{
    load_preferences, load_recent_repos, remember_repo, remove_recent_repo, save_preferences,
};
use crate::session::{refresh_rebind, DiffSession, DiffSource, RefreshRebind, ViewMode};
use crate::theme::{get_theme, ColorScheme, ThemeId, UiVars};

#[derive(Debug)]
pub struct AppState {
    pub prefs: AppPreferences,
    pub ui_vars: UiVars,
    pub color_scheme: ColorScheme,
    pub hl_palette: HighlightPalette,
    pub repo: Option<RepoInfo>,
    pub recent: Vec<RecentRepo>,
    pub changes: Vec<ChangeEntry>,
    pub session: DiffSession,
    pub side_by_side: bool,
    pub view_mode: ViewMode,
    pub commits: Vec<CommitInfo>,
    pub graph_rows: Vec<crate::graph::GraphRow>,
    pub selected_commit: Option<String>,
    pub commit_files: Vec<CommitFile>,
    pub error: Option<String>,
    pub status: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
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
        if let Some(path) = app.prefs.last_repo_path.clone() {
            if Path::new(&path).is_dir() {
                app.open_repo_path(&path);
            }
        }
        app
    }

    pub fn set_theme(&mut self, id: ThemeId) {
        self.prefs.theme_id = id;
        let pack = get_theme(id);
        self.ui_vars = pack.ui.clone();
        self.color_scheme = pack.scheme;
        self.hl_palette = HighlightPalette::from_ui(&pack.ui, pack.scheme);
        let _ = save_preferences(&self.prefs);
    }

    pub fn guard_dirty(&mut self) -> bool {
        match self.session.guard_dirty() {
            Ok(()) => true,
            Err(msg) => {
                self.status = Some(msg);
                false
            }
        }
    }

    pub fn open_repo_path(&mut self, path: &str) {
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
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    pub fn forget_recent(&mut self, root: &str) {
        self.recent = remove_recent_repo(root);
    }

    pub fn refresh_all(&mut self) {
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

        let rebind = refresh_rebind(
            self.session.source.as_ref(),
            self.selected_commit.as_deref(),
            &self.changes,
        );
        match rebind {
            RefreshRebind::ReloadChange {
                path,
                side,
                old_path,
            } => self.load_change_diff(&path, side, old_path.as_deref()),
            RefreshRebind::ClearChange => self.session.clear(),
            RefreshRebind::ReloadCommit {
                hash,
                path,
                old_path,
            } => {
                self.load_commit_files(&hash);
                self.load_commit_diff(&hash, &path, old_path.as_deref());
            }
            RefreshRebind::ReloadCommitFilesOnly { hash } => self.load_commit_files(&hash),
            RefreshRebind::None => {}
        }

        if let Ok(info) = resolve_repo(&root) {
            self.repo = Some(info);
        }
    }

    pub fn load_change_diff(&mut self, path: &str, side: ChangeSide, old_path: Option<&str>) {
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

    pub fn select_change(&mut self, entry: &ChangeEntry) {
        if !self.guard_dirty() {
            return;
        }
        self.selected_commit = None;
        self.commit_files.clear();
        self.load_change_diff(&entry.path, entry.side, entry.old_path.as_deref());
    }

    pub fn select_commit(&mut self, hash: &str) {
        if !self.guard_dirty() {
            return;
        }
        self.selected_commit = Some(hash.to_string());
        self.session.clear();
        self.load_commit_files(hash);
    }

    pub fn load_commit_files(&mut self, hash: &str) {
        let Some(repo) = &self.repo else { return };
        match list_commit_files(Path::new(&repo.root), hash) {
            Ok(files) => {
                self.commit_files = files;
                self.error = None;
            }
            Err(e) => self.error = Some(e.to_string()),
        }
    }

    pub fn load_commit_diff(&mut self, hash: &str, path: &str, old_path: Option<&str>) {
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

    pub fn select_commit_file(&mut self, path: &str, old_path: Option<&str>) {
        if !self.guard_dirty() {
            return;
        }
        let Some(hash) = self.selected_commit.clone() else {
            return;
        };
        self.load_commit_diff(&hash, path, old_path);
    }

    pub fn save_edit(&mut self) {
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

    pub fn stage_selected(&mut self, path: &str) {
        self.with_repo_paths(path, stage_paths);
    }

    pub fn unstage_selected(&mut self, path: &str) {
        self.with_repo_paths(path, unstage_paths);
    }

    pub fn stage_all_unstaged(&mut self) {
        let paths: Vec<String> = self
            .changes
            .iter()
            .filter(|c| c.side == ChangeSide::Unstaged)
            .map(|c| c.path.clone())
            .collect();
        if paths.is_empty() {
            return;
        }
        self.with_repo_path_list(&paths, stage_paths);
    }

    /// Remove all paths from the index (unstage). Labelled "Discard all" in the Staged header.
    pub fn unstage_all_staged(&mut self) {
        let paths: Vec<String> = self
            .changes
            .iter()
            .filter(|c| c.side == ChangeSide::Staged)
            .map(|c| c.path.clone())
            .collect();
        if paths.is_empty() {
            return;
        }
        self.with_repo_path_list(&paths, unstage_paths);
    }

    fn with_repo_paths(
        &mut self,
        path: &str,
        action: impl FnOnce(&Path, &[String]) -> Result<(), crate::git::GitError>,
    ) {
        self.with_repo_path_list(&[path.to_string()], action);
    }

    fn with_repo_path_list(
        &mut self,
        paths: &[String],
        action: impl FnOnce(&Path, &[String]) -> Result<(), crate::git::GitError>,
    ) {
        let Some(repo) = self.repo.clone() else { return };
        if let Err(e) = action(Path::new(&repo.root), paths) {
            self.error = Some(e.to_string());
        } else {
            self.refresh_all();
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
