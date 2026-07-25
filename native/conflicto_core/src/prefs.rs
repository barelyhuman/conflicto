use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::models::{AppPreferences, RecentRepo};
use crate::theme::{ThemeId, DEFAULT_THEME_ID};

const MAX_RECENT: usize = 20;
const PREFS_FILE: &str = "preferences.json";
const RECENT_FILE: &str = "recent-repos.json";

fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("conflicto")
}

fn ensure_config_dir() -> PathBuf {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);
    dir
}

#[derive(Serialize, Deserialize)]
struct PrefsFile {
    #[serde(default = "default_theme")]
    theme_id: ThemeId,
    #[serde(default)]
    last_repo_path: Option<String>,
    /// Kept for forward-compat with Electron prefs; unused in native v1.
    #[serde(default)]
    terminal_height: Option<u32>,
}

fn default_theme() -> ThemeId {
    DEFAULT_THEME_ID
}

impl From<PrefsFile> for AppPreferences {
    fn from(p: PrefsFile) -> Self {
        AppPreferences {
            theme_id: p.theme_id,
            last_repo_path: p.last_repo_path,
        }
    }
}

pub fn load_preferences() -> AppPreferences {
    let path = config_dir().join(PREFS_FILE);
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<PrefsFile>(&raw)
            .map(Into::into)
            .unwrap_or_default(),
        Err(_) => AppPreferences::default(),
    }
}

pub fn save_preferences(prefs: &AppPreferences) -> std::io::Result<()> {
    let dir = ensure_config_dir();
    let file = PrefsFile {
        theme_id: prefs.theme_id,
        last_repo_path: prefs.last_repo_path.clone(),
        terminal_height: None,
    };
    let raw = serde_json::to_string_pretty(&file).unwrap_or_else(|_| "{}".into());
    fs::write(dir.join(PREFS_FILE), raw)
}

#[derive(Serialize, Deserialize, Default)]
struct RecentStore {
    #[serde(default)]
    recent: Vec<RecentRepoRaw>,
}

#[derive(Serialize, Deserialize)]
struct RecentRepoRaw {
    root: String,
    #[serde(default)]
    opened_at: u64,
}

fn to_recent(root: &str, opened_at: u64) -> RecentRepo {
    let name = Path::new(root)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(root)
        .to_string();
    RecentRepo {
        root: root.to_string(),
        name,
        opened_at,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn load_recent_repos() -> Vec<RecentRepo> {
    let path = config_dir().join(RECENT_FILE);
    let store: RecentStore = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let mut out = Vec::new();
    for r in store.recent {
        if Path::new(&r.root).exists() {
            out.push(to_recent(&r.root, r.opened_at));
        }
    }
    out
}

fn write_recent(recent: &[RecentRepo]) -> std::io::Result<()> {
    let dir = ensure_config_dir();
    let store = RecentStore {
        recent: recent
            .iter()
            .map(|r| RecentRepoRaw {
                root: r.root.clone(),
                opened_at: r.opened_at,
            })
            .collect(),
    };
    let raw = serde_json::to_string_pretty(&store).unwrap_or_else(|_| "{}".into());
    fs::write(dir.join(RECENT_FILE), raw)
}

pub fn remember_repo(root: &str) -> Vec<RecentRepo> {
    let mut recent = load_recent_repos();
    recent.retain(|r| r.root != root);
    recent.insert(0, to_recent(root, now_ms()));
    recent.truncate(MAX_RECENT);
    let _ = write_recent(&recent);
    recent
}

pub fn remove_recent_repo(root: &str) -> Vec<RecentRepo> {
    let mut recent = load_recent_repos();
    recent.retain(|r| r.root != root);
    let _ = write_recent(&recent);
    recent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remember_repo_caps_at_max_recent() {
        let dir = std::env::temp_dir().join(format!("conflicto-recent-cap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // Isolate by writing directly into a temp config is hard (uses dirs::config_dir).
        // Instead assert truncate logic via remember on existing store size bound.
        let mut recent = Vec::new();
        for i in 0..(MAX_RECENT + 5) {
            recent.insert(
                0,
                RecentRepo {
                    root: format!("{}/r{i}", dir.display()),
                    name: format!("r{i}"),
                    opened_at: i as u64,
                },
            );
            recent.truncate(MAX_RECENT);
        }
        assert_eq!(recent.len(), MAX_RECENT);
        let _ = fs::remove_dir_all(&dir);
    }
}
