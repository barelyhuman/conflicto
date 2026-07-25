use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeSide {
    Staged,
    Unstaged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
    Copied,
}

impl ChangeStatus {
    pub fn letter(self) -> &'static str {
        match self {
            Self::Modified => "M",
            Self::Added => "A",
            Self::Deleted => "D",
            Self::Renamed => "R",
            Self::Untracked => "U",
            Self::Copied => "C",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ViewMode {
    #[default]
    Changes,
    Graph,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoInfo {
    pub root: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentRepo {
    pub root: String,
    pub name: String,
    pub opened_at: u64,
}

#[derive(Debug, Clone)]
pub struct ChangeEntry {
    pub path: String,
    pub old_path: Option<String>,
    pub status: ChangeStatus,
    pub side: ChangeSide,
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub language: String,
}

#[derive(Debug, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: ChangeStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPreferences {
    pub theme_id: crate::theme::ThemeId,
    pub last_repo_path: Option<String>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme_id: crate::theme::DEFAULT_THEME_ID,
            last_repo_path: None,
        }
    }
}
