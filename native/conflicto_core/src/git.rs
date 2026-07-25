use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use thiserror::Error;

use crate::models::{
    ChangeEntry, ChangeSide, ChangeStatus, CommitFile, CommitInfo, FileDiff, RepoInfo,
};

#[derive(Debug, Error)]
pub enum GitError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<(String, String, i32), GitError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code().unwrap_or(1);
    Ok((stdout, stderr, code))
}

fn git_ok(cwd: &Path, args: &[&str]) -> Result<String, GitError> {
    let (stdout, stderr, code) = run_git(cwd, args)?;
    if code != 0 {
        return Err(GitError::Message(
            stderr.trim().to_string().if_empty(|| format!("git {} failed", args.join(" "))),
        ));
    }
    Ok(stdout)
}

fn git_soft(cwd: &Path, args: &[&str]) -> Result<String, GitError> {
    let (stdout, _, _) = run_git(cwd, args)?;
    Ok(stdout)
}

trait IfEmpty {
    fn if_empty(self, f: impl FnOnce() -> String) -> String;
}

impl IfEmpty for String {
    fn if_empty(self, f: impl FnOnce() -> String) -> String {
        if self.is_empty() {
            f()
        } else {
            self
        }
    }
}

pub fn resolve_repo(dir: &Path) -> Result<RepoInfo, GitError> {
    let root = git_ok(dir, &["rev-parse", "--show-toplevel"])?
        .trim()
        .to_string();
    let root_path = PathBuf::from(&root);
    let branch = match git_ok(&root_path, &["branch", "--show-current"]) {
        Ok(b) => {
            let t = b.trim().to_string();
            if t.is_empty() {
                git_soft(&root_path, &["rev-parse", "--short", "HEAD"])?
                    .trim()
                    .to_string()
                    .if_empty(|| "HEAD".into())
            } else {
                t
            }
        }
        Err(_) => git_soft(&root_path, &["rev-parse", "--short", "HEAD"])?
            .trim()
            .to_string()
            .if_empty(|| "HEAD".into()),
    };
    Ok(RepoInfo { root, branch })
}

pub fn list_changes(root: &Path) -> Result<Vec<ChangeEntry>, GitError> {
    let stdout = git_ok(root, &["status", "--porcelain=v1", "-uall", "-z"])?;
    let parts: Vec<&str> = stdout.split('\0').filter(|s| !s.is_empty()).collect();
    let mut entries = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let line = parts[i];
        if line.len() < 3 {
            i += 1;
            continue;
        }
        let x = line.chars().next().unwrap_or(' ');
        let y = line.chars().nth(1).unwrap_or(' ');
        let rest = &line[3..];
        let mut file_path = rest.to_string();
        let mut old_path = None;

        if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            if i + 1 < parts.len() {
                old_path = Some(parts[i + 1].to_string());
                i += 1;
            }
            file_path = rest.to_string();
        }

        if x == '?' && y == '?' {
            entries.push(ChangeEntry {
                path: file_path,
                old_path: None,
                status: ChangeStatus::Untracked,
                side: ChangeSide::Unstaged,
            });
            i += 1;
            continue;
        }

        if x != ' ' && x != '?' {
            entries.push(ChangeEntry {
                path: file_path.clone(),
                old_path: old_path.clone(),
                status: ChangeStatus::from_git_code(x),
                side: ChangeSide::Staged,
            });
        }
        if y != ' ' && y != '?' {
            entries.push(ChangeEntry {
                path: file_path,
                old_path,
                status: ChangeStatus::from_git_code(y),
                side: ChangeSide::Unstaged,
            });
        }
        i += 1;
    }
    Ok(entries)
}

pub fn stage_paths(root: &Path, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["add", "--"];
    for p in paths {
        args.push(p.as_str());
    }
    git_ok(root, &args)?;
    Ok(())
}

pub fn unstage_paths(root: &Path, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = vec!["restore", "--staged", "--"];
    for p in paths {
        args.push(p.as_str());
    }
    git_ok(root, &args)?;
    Ok(())
}

fn read_working_tree(root: &Path, file_path: &str) -> String {
    std::fs::read_to_string(root.join(file_path)).unwrap_or_default()
}

pub fn write_working_tree_file(root: &Path, rel_path: &str, contents: &str) -> std::io::Result<()> {
    let path = root.join(rel_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}

fn read_blob(root: &Path, spec: &str) -> Result<String, GitError> {
    let (stdout, _, code) = run_git(root, &["show", spec])?;
    if code != 0 {
        return Ok(String::new());
    }
    Ok(stdout)
}

fn blob_path<'a>(path: &'a str, old_path: Option<&'a str>) -> &'a str {
    old_path.unwrap_or(path)
}

pub fn get_file_diff(
    root: &Path,
    file_path: &str,
    old_path: Option<&str>,
    side: ChangeSide,
) -> Result<FileDiff, GitError> {
    let orig_path = blob_path(file_path, old_path);
    match side {
        ChangeSide::Staged => {
            let original = read_blob(root, &format!("HEAD:{orig_path}"))?;
            let modified = read_blob(root, &format!(":{file_path}"))?;
            Ok(FileDiff {
                path: file_path.to_string(),
                original,
                modified,
            })
        }
        ChangeSide::Unstaged => {
            let mut original = read_blob(root, &format!(":{orig_path}"))?;
            if original.is_empty() {
                original = read_blob(root, &format!("HEAD:{orig_path}"))?;
            }
            let modified = read_working_tree(root, file_path);
            Ok(FileDiff {
                path: file_path.to_string(),
                original,
                modified,
            })
        }
    }
}

const COMMIT_LIMIT: usize = 80;

pub fn list_commits(root: &Path, limit: Option<usize>) -> Result<Vec<CommitInfo>, GitError> {
    let lim = limit.unwrap_or(COMMIT_LIMIT);
    let pretty = format!("--max-count={lim}");
    let stdout = git_ok(
        root,
        &[
            "log",
            &pretty,
            "--pretty=format:%H%x00%h%x00%P%x00%s%x00%an%x00%as%x00%D%x1e",
        ],
    )?;
    let mut commits = Vec::new();
    for record in stdout.split('\x1e') {
        let record = record.trim_start_matches('\n').trim_end();
        if record.is_empty() {
            continue;
        }
        let mut parts = record.split('\0');
        let hash = parts.next().unwrap_or("").to_string();
        let short_hash = parts.next().unwrap_or("").to_string();
        let parents_raw = parts.next().unwrap_or("");
        let subject = parts.next().unwrap_or("").to_string();
        let author = parts.next().unwrap_or("").to_string();
        let date = parts.next().unwrap_or("").to_string();
        let refs_raw = parts.next().unwrap_or("");
        let parents = if parents_raw.is_empty() {
            Vec::new()
        } else {
            parents_raw
                .split_whitespace()
                .map(str::to_string)
                .collect()
        };
        let refs = refs_raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        commits.push(CommitInfo {
            hash,
            short_hash,
            parents,
            subject,
            author,
            date,
            refs,
        });
    }
    Ok(commits)
}

pub fn list_commit_files(root: &Path, hash: &str) -> Result<Vec<CommitFile>, GitError> {
    let stdout = git_ok(
        root,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", "-z", hash],
    )?;
    let parts: Vec<&str> = stdout.split('\0').filter(|s| !s.is_empty()).collect();
    let mut files = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let status_code = parts[i];
        if status_code.is_empty() {
            i += 1;
            continue;
        }
        let first = status_code.chars().next().unwrap_or('M');
        if first == 'R' || first == 'C' {
            let old_path = parts.get(i + 1).map(|s| s.to_string());
            let new_path = parts.get(i + 2).unwrap_or(&"").to_string();
            i += 3;
            files.push(CommitFile {
                path: new_path,
                old_path,
                status: ChangeStatus::from_git_code(first),
            });
        } else {
            let file_path = parts.get(i + 1).unwrap_or(&"").to_string();
            i += 2;
            files.push(CommitFile {
                path: file_path,
                old_path: None,
                status: ChangeStatus::from_git_code(first),
            });
        }
    }
    Ok(files)
}

pub fn get_commit_file_diff(
    root: &Path,
    hash: &str,
    file_path: &str,
    old_path: Option<&str>,
) -> Result<FileDiff, GitError> {
    let orig_path = blob_path(file_path, old_path);
    let original = read_blob(root, &format!("{hash}^:{orig_path}"))?;
    let modified = read_blob(root, &format!("{hash}:{file_path}"))?;
    Ok(FileDiff {
        path: file_path.to_string(),
        original,
        modified,
    })
}
