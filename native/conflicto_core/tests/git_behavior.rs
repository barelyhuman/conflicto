mod common;
use common::TempRepo;

use conflicto_core::{
    checkout_branch, commit, get_file_diff, graph_row_glyph, layout_commit_graph, list_branches,
    list_changes, list_commits, parse_github_remote, resolve_repo, stage_paths, unstage_paths,
    write_working_tree_file, ChangeSide, ChangeStatus,
};

#[test]
fn resolve_repo_returns_branch() {
    let repo = TempRepo::new();
    repo.write("README.md", "hi\n");
    repo.add_all();
    repo.commit("init");
    let info = resolve_repo(repo.path()).unwrap();
    assert!(info.root.contains("conflicto-test-"));
    assert_eq!(info.branch, "main");
}

#[test]
fn resolve_non_git_fails() {
    let dir = std::env::temp_dir().join(format!("conflicto-nongit-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    assert!(resolve_repo(&dir).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn list_changes_staged_and_unstaged() {
    let repo = TempRepo::new();
    repo.write("a.txt", "one\n");
    repo.add_all();
    repo.commit("init");
    repo.write("a.txt", "two\n");
    repo.write("b.txt", "new\n");

    let changes = list_changes(repo.path()).unwrap();
    let unstaged: Vec<_> = changes
        .iter()
        .filter(|c| c.side == ChangeSide::Unstaged)
        .collect();
    assert!(unstaged.iter().any(|c| c.path == "a.txt"));
    assert!(unstaged.iter().any(|c| c.path == "b.txt"
        && matches!(c.status, ChangeStatus::Untracked | ChangeStatus::Added)));
}

#[test]
fn stage_unstage_roundtrip() {
    let repo = TempRepo::new();
    repo.write("a.txt", "one\n");
    repo.add_all();
    repo.commit("init");
    repo.write("a.txt", "two\n");

    stage_paths(repo.path(), &["a.txt".into()]).unwrap();
    let changes = list_changes(repo.path()).unwrap();
    assert!(changes
        .iter()
        .any(|c| c.path == "a.txt" && c.side == ChangeSide::Staged));

    unstage_paths(repo.path(), &["a.txt".into()]).unwrap();
    let changes = list_changes(repo.path()).unwrap();
    assert!(changes
        .iter()
        .any(|c| c.path == "a.txt" && c.side == ChangeSide::Unstaged));
}

#[test]
fn get_file_diff_and_write() {
    let repo = TempRepo::new();
    repo.write("a.txt", "one\n");
    repo.add_all();
    repo.commit("init");
    repo.write("a.txt", "two\n");

    let diff = get_file_diff(repo.path(), "a.txt", None, ChangeSide::Unstaged).unwrap();
    assert_eq!(diff.original, "one\n");
    assert_eq!(diff.modified, "two\n");

    write_working_tree_file(repo.path(), "a.txt", "three\n").unwrap();
    let contents = std::fs::read_to_string(repo.path().join("a.txt")).unwrap();
    assert_eq!(contents, "three\n");
}

#[test]
fn list_commits_and_graph() {
    let repo = TempRepo::new();
    repo.write("a.txt", "1\n");
    repo.add_all();
    repo.commit("first");
    repo.write("a.txt", "2\n");
    repo.add_all();
    repo.commit("second");

    let commits = list_commits(repo.path(), None).unwrap();
    assert!(commits.len() >= 2);
    let rows = layout_commit_graph(&commits);
    assert_eq!(rows.len(), commits.len());
    assert!(rows.iter().any(|r| r.lane_count >= 1));
}

#[test]
fn commit_file_diff() {
    use conflicto_core::{get_commit_file_diff, list_commit_files};
    let repo = TempRepo::new();
    repo.write("a.txt", "1\n");
    repo.add_all();
    repo.commit("first");
    repo.write("a.txt", "2\n");
    repo.add_all();
    repo.commit("second");

    let commits = list_commits(repo.path(), None).unwrap();
    let hash = &commits[0].hash;
    let files = list_commit_files(repo.path(), hash).unwrap();
    assert!(files.iter().any(|f| f.path == "a.txt"));
    let diff = get_commit_file_diff(repo.path(), hash, "a.txt", None).unwrap();
    assert_eq!(diff.original, "1\n");
    assert_eq!(diff.modified, "2\n");
}

#[test]
fn commit_after_staging() {
    let repo = TempRepo::new();
    repo.write("a.txt", "one\n");
    repo.add_all();
    repo.commit("init");
    repo.write("a.txt", "two\n");

    stage_paths(repo.path(), &["a.txt".into()]).unwrap();
    assert!(list_changes(repo.path())
        .unwrap()
        .iter()
        .any(|c| c.path == "a.txt" && c.side == ChangeSide::Staged));

    commit(repo.path(), "update a").unwrap();

    let changes = list_changes(repo.path()).unwrap();
    assert!(!changes.iter().any(|c| c.path == "a.txt"));

    let commits = list_commits(repo.path(), None).unwrap();
    assert_eq!(commits[0].subject, "update a");
}

#[test]
fn commit_rejects_empty_message() {
    let repo = TempRepo::new();
    repo.write("a.txt", "one\n");
    repo.add_all();
    repo.commit("init");
    repo.write("a.txt", "two\n");
    stage_paths(repo.path(), &["a.txt".into()]).unwrap();

    let err = commit(repo.path(), "   ").unwrap_err();
    assert!(err.to_string().contains("empty"));
}

#[test]
fn list_and_switch_branches() {
    let repo = TempRepo::new();
    repo.write("a.txt", "1\n");
    repo.add_all();
    repo.commit("init");
    std::process::Command::new("git")
        .args(["checkout", "-b", "feature"])
        .current_dir(repo.path())
        .output()
        .unwrap();
    repo.write("a.txt", "2\n");
    repo.add_all();
    repo.commit("feat");

    let branches = list_branches(repo.path()).unwrap();
    assert!(branches.iter().any(|b| b.name == "main" || b.name == "master"));
    assert!(branches.iter().any(|b| b.name == "feature" && b.current));

    checkout_branch(repo.path(), "main").or_else(|_| checkout_branch(repo.path(), "master")).unwrap();
    let info = resolve_repo(repo.path()).unwrap();
    assert!(info.branch == "main" || info.branch == "master");
}

#[test]
fn parse_github_remote_urls() {
    let a = parse_github_remote("git@github.com:barelyhuman/conflicto.git").unwrap();
    assert_eq!(a.owner, "barelyhuman");
    assert_eq!(a.repo, "conflicto");
    let b = parse_github_remote("https://github.com/barelyhuman/conflicto").unwrap();
    assert_eq!(b.owner, "barelyhuman");
    assert_eq!(b.repo, "conflicto");
    assert!(parse_github_remote("https://gitlab.com/x/y").is_none());
}

#[test]
fn graph_glyph_marks_commit_lane() {
    let repo = TempRepo::new();
    repo.write("a.txt", "1\n");
    repo.add_all();
    repo.commit("first");
    let commits = list_commits(repo.path(), None).unwrap();
    let rows = layout_commit_graph(&commits);
    let glyph = graph_row_glyph(&rows[0]);
    assert!(glyph.contains('●'));
}
