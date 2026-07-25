//! Diff session + view-mode domain (UI-agnostic).

use crate::models::{ChangeEntry, ChangeSide, FileDiff};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ViewMode {
    #[default]
    Changes,
    Graph,
    PullRequests,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffSource {
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

#[derive(Debug, Clone, Default)]
pub struct DiffSession {
    pub source: Option<DiffSource>,
    pub diff: Option<FileDiff>,
    pub edit_buffer: String,
    pub dirty: bool,
}

impl DiffSession {
    pub fn clear(&mut self) {
        self.source = None;
        self.diff = None;
        self.edit_buffer.clear();
        self.dirty = false;
    }

    pub fn apply_loaded(&mut self, source: DiffSource, diff: FileDiff) {
        self.edit_buffer = diff.modified.clone();
        self.dirty = false;
        self.diff = Some(diff);
        self.source = Some(source);
    }

    pub fn mark_buffer_changed(&mut self) {
        if let Some(diff) = &self.diff {
            self.dirty = self.edit_buffer != diff.modified;
        }
    }

    pub fn can_edit(&self) -> bool {
        matches!(
            &self.source,
            Some(DiffSource::Change {
                side: ChangeSide::Unstaged,
                ..
            })
        ) && self.diff.is_some()
    }

    /// Returns `Ok(())` if navigation is allowed; `Err(status)` when dirty.
    pub fn guard_dirty(&self) -> Result<(), String> {
        if self.dirty {
            Err("Save or discard edits before switching files".into())
        } else {
            Ok(())
        }
    }

    pub fn is_change_selected(&self, entry: &ChangeEntry) -> bool {
        matches!(
            &self.source,
            Some(DiffSource::Change { path, side, .. })
                if path == &entry.path && *side == entry.side
        )
    }

    pub fn is_commit_file_selected(&self, path: &str) -> bool {
        matches!(
            &self.source,
            Some(DiffSource::Commit { path: p, .. }) if p == path
        )
    }
}

/// After refresh, decide what to reload for the open diff.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshRebind {
    ReloadChange {
        path: String,
        side: ChangeSide,
        old_path: Option<String>,
    },
    ClearChange,
    ReloadCommit {
        hash: String,
        path: String,
        old_path: Option<String>,
    },
    ReloadCommitFilesOnly {
        hash: String,
    },
    None,
}

pub fn refresh_rebind(
    source: Option<&DiffSource>,
    selected_commit: Option<&str>,
    changes: &[ChangeEntry],
) -> RefreshRebind {
    match source {
        Some(DiffSource::Change {
            path,
            side,
            old_path,
        }) => {
            if changes.iter().any(|c| c.path == *path && c.side == *side) {
                RefreshRebind::ReloadChange {
                    path: path.clone(),
                    side: *side,
                    old_path: old_path.clone(),
                }
            } else {
                RefreshRebind::ClearChange
            }
        }
        Some(DiffSource::Commit {
            hash,
            path,
            old_path,
        }) => RefreshRebind::ReloadCommit {
            hash: hash.clone(),
            path: path.clone(),
            old_path: old_path.clone(),
        },
        None => {
            if let Some(hash) = selected_commit {
                RefreshRebind::ReloadCommitFilesOnly {
                    hash: hash.to_string(),
                }
            } else {
                RefreshRebind::None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ChangeStatus;

    fn entry(path: &str, side: ChangeSide) -> ChangeEntry {
        ChangeEntry {
            path: path.into(),
            side,
            status: ChangeStatus::Modified,
            old_path: None,
        }
    }

    #[test]
    fn guard_dirty_blocks_when_dirty() {
        let mut s = DiffSession::default();
        assert!(s.guard_dirty().is_ok());
        s.dirty = true;
        assert!(s.guard_dirty().is_err());
    }

    #[test]
    fn can_edit_only_unstaged_with_diff() {
        let mut s = DiffSession::default();
        assert!(!s.can_edit());
        s.source = Some(DiffSource::Change {
            path: "a.rs".into(),
            side: ChangeSide::Unstaged,
            old_path: None,
        });
        assert!(!s.can_edit());
        s.diff = Some(FileDiff {
            path: "a.rs".into(),
            original: String::new(),
            modified: "x".into(),
        });
        assert!(s.can_edit());
        s.source = Some(DiffSource::Change {
            path: "a.rs".into(),
            side: ChangeSide::Staged,
            old_path: None,
        });
        assert!(!s.can_edit());
    }

    #[test]
    fn apply_loaded_clears_dirty_and_sets_buffer() {
        let mut s = DiffSession {
            dirty: true,
            edit_buffer: "old".into(),
            ..Default::default()
        };
        s.apply_loaded(
            DiffSource::Change {
                path: "a".into(),
                side: ChangeSide::Unstaged,
                old_path: None,
            },
            FileDiff {
                path: "a".into(),
                original: "o".into(),
                modified: "new".into(),
            },
        );
        assert!(!s.dirty);
        assert_eq!(s.edit_buffer, "new");
    }

    #[test]
    fn refresh_rebind_keeps_change_when_still_listed() {
        let source = DiffSource::Change {
            path: "a.rs".into(),
            side: ChangeSide::Unstaged,
            old_path: None,
        };
        let changes = vec![entry("a.rs", ChangeSide::Unstaged)];
        assert_eq!(
            refresh_rebind(Some(&source), None, &changes),
            RefreshRebind::ReloadChange {
                path: "a.rs".into(),
                side: ChangeSide::Unstaged,
                old_path: None,
            }
        );
    }

    #[test]
    fn refresh_rebind_clears_change_when_gone() {
        let source = DiffSource::Change {
            path: "a.rs".into(),
            side: ChangeSide::Unstaged,
            old_path: None,
        };
        assert_eq!(
            refresh_rebind(Some(&source), None, &[]),
            RefreshRebind::ClearChange
        );
    }

    #[test]
    fn refresh_rebind_commit_and_files_only() {
        let source = DiffSource::Commit {
            hash: "abc".into(),
            path: "a.rs".into(),
            old_path: None,
        };
        assert_eq!(
            refresh_rebind(Some(&source), None, &[]),
            RefreshRebind::ReloadCommit {
                hash: "abc".into(),
                path: "a.rs".into(),
                old_path: None,
            }
        );
        assert_eq!(
            refresh_rebind(None, Some("abc"), &[]),
            RefreshRebind::ReloadCommitFilesOnly {
                hash: "abc".into()
            }
        );
    }
}
