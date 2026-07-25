//! GitHub integration via the `gh` CLI (system auth / credentials).

use std::path::Path;
use std::process::Command;

use thiserror::Error;

use crate::models::PullRequestInfo;

#[derive(Debug, Error)]
pub enum GithubError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

fn run_gh(cwd: &Path, args: &[&str]) -> Result<(String, String, i32), GithubError> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(cwd)
        .env("GH_PROMPT_DISABLED", "1")
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code().unwrap_or(1);
    Ok((stdout, stderr, code))
}

pub fn gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// List open PRs for the current repository (requires `gh` auth).
pub fn list_pull_requests(root: &Path, limit: usize) -> Result<Vec<PullRequestInfo>, GithubError> {
    if !gh_available() {
        return Err(GithubError::Message(
            "GitHub CLI (`gh`) is not installed or not on PATH".into(),
        ));
    }
    let lim = limit.max(1).to_string();
    let (stdout, stderr, code) = run_gh(
        root,
        &[
            "pr",
            "list",
            "--limit",
            &lim,
            "--json",
            "number,title,author,headRefName,baseRefName,url,isDraft",
        ],
    )?;
    if code != 0 {
        return Err(GithubError::Message(
            stderr
                .trim()
                .to_string()
                .if_empty(|| "gh pr list failed".into()),
        ));
    }
    parse_pr_list_json(&stdout)
}

fn parse_pr_list_json(stdout: &str) -> Result<Vec<PullRequestInfo>, GithubError> {
    let value: serde_json::Value = serde_json::from_str(stdout).map_err(|e| {
        GithubError::Message(format!("Failed to parse gh pr list JSON: {e}"))
    })?;
    let arr = value
        .as_array()
        .ok_or_else(|| GithubError::Message("gh pr list: expected JSON array".into()))?;
    let mut out = Vec::new();
    for item in arr {
        let number = item.get("number").and_then(|v| v.as_u64()).unwrap_or(0);
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let author = item
            .get("author")
            .and_then(|v| v.get("login"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let head_ref = item
            .get("headRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let base_ref = item
            .get("baseRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let url = item
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let is_draft = item
            .get("isDraft")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if number == 0 {
            continue;
        }
        out.push(PullRequestInfo {
            number,
            title,
            author,
            head_ref,
            base_ref,
            url,
            is_draft,
        });
    }
    Ok(out)
}

/// Checkout a pull request locally (`gh pr checkout`).
pub fn checkout_pull_request(root: &Path, number: u64) -> Result<String, GithubError> {
    let n = number.to_string();
    let (stdout, stderr, code) = run_gh(root, &["pr", "checkout", &n])?;
    if code != 0 {
        return Err(GithubError::Message(
            stderr
                .trim()
                .to_string()
                .if_empty(|| format!("gh pr checkout {number} failed")),
        ));
    }
    Ok(format!("{}{}", stdout, stderr).trim().to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_pr_list_smoke() {
        let json = r#"[{"number":1,"title":"Hi","author":{"login":"a"},"headRefName":"feat","baseRefName":"main","url":"https://github.com/o/r/pull/1","isDraft":false}]"#;
        let prs = parse_pr_list_json(json).unwrap();
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].number, 1);
        assert_eq!(prs[0].author, "a");
        assert_eq!(prs[0].head_ref, "feat");
    }
}
