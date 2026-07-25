//! Shared models, git CLI, prefs, themes, and graph layout for Conflicto.

pub mod fs_io;
pub mod git;
pub mod graph;
pub mod models;
pub mod prefs;
pub mod theme;

pub use fs_io::write_working_tree_file;
pub use git::{
    get_commit_file_diff, get_file_diff, list_changes, list_commit_files, list_commits, resolve_repo,
    stage_paths, unstage_paths, GitError,
};
pub use graph::{layout_commit_graph, GraphEdge, GraphEdgeKind, GraphRow};
pub use models::*;
pub use prefs::{load_preferences, load_recent_repos, remember_repo, remove_recent_repo, save_preferences};
pub use theme::{get_theme, themes, ColorScheme, ThemeId, ThemePack, UiVars, DEFAULT_THEME_ID};
