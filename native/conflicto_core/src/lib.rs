//! Shared models, git CLI, prefs, themes, graph layout, and app session for Conflicto.

pub mod app_state;
pub mod diff;
pub mod diff_cache;
pub mod git;
pub mod graph;
pub mod highlight;
pub mod models;
pub mod prefs;
pub mod session;
pub mod theme;

pub use app_state::AppState;
pub use diff::{
    aligned_diff_lines, apply_line_edits, build_unified, had_trailing_newline, join_parts,
    line_byte_starts, rebuild_buffer_from_lines, split_at_char, DiffLine, LineKind,
};
pub use diff_cache::{DiffViewCache, LineHighlights};
pub use git::{
    get_commit_file_diff, get_file_diff, list_changes, list_commit_files, list_commits, resolve_repo,
    stage_paths, unstage_paths, write_working_tree_file, GitError,
};
pub use graph::{layout_commit_graph, GraphEdge, GraphEdgeKind, GraphRow};
pub use highlight::{
    highlight_color, highlight_source, HighlightKind, HighlightPalette, HighlightSpan,
};
pub use models::*;
pub use prefs::{
    load_preferences, load_recent_repos, remember_repo, remove_recent_repo, save_preferences,
};
pub use session::{refresh_rebind, DiffSession, DiffSource, RefreshRebind, ViewMode};
pub use theme::{get_theme, themes, ColorScheme, ThemeId, ThemePack, UiVars, DEFAULT_THEME_ID};
