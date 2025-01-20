use git2::{Repository, Branch, BranchType, Commit, Reference, Oid, Sort, Status};
use serde::{Serialize, Deserialize};
use tauri::{command, plugin::{Builder, TauriPlugin}, Manager, State};
use std::sync::Mutex;
use std::collections::HashMap;
use chrono::{DateTime, TimeZone, Utc};
use thiserror::Error;

// Extended error types
#[derive(Debug, Error)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("Repository not found")]
    RepoNotFound,
    #[error("Invalid path: {0}")]
    InvalidPath(String),
    #[error("Branch operation failed: {0}")]
    BranchError(String),
    #[error("Remote operation failed: {0}")]
    RemoteError(String),
}

// Extended commit info with additional metadata
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtendedCommitInfo {
    id: String,
    message: String,
    author: String,
    author_email: String,
    committer: String,
    committer_email: String,
    branch: String,
    timestamp: String,
    parents: Vec<String>,
    color: String,
    position: i32,
    #[serde(rename = "type")]
    commit_type: String,
    stats: CommitStats,
    refs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitStats {
    files_changed: usize,
    insertions: usize,
    deletions: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    name: String,
    is_head: bool,
    upstream: Option<String>,
    ahead_count: u32,
    behind_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoStatus {
    current_branch: String,
    clean: bool,
    changes: Vec<FileStatus>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileStatus {
    path: String,
    status: String,
}

struct RepositoryState(Mutex<Option<Repository>>);

// Command implementations
#[command]
async fn open_repository(
    path: String,
    state: State<'_, RepositoryState>,
) -> Result<RepoStatus, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let status = get_repo_status(&repo)?;
    *state.0.lock().unwrap() = Some(repo);
    Ok(status)
}

#[command]
async fn get_branches(
    state: State<'_, RepositoryState>
) -> Result<Vec<BranchInfo>, String> {
    let repo = state.0.lock().unwrap();
    let repo = repo.as_ref().ok_or("No repository opened")?;
    
    let mut branch_list = Vec::new();
    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    
    for branch_result in branches {
        let (branch, branch_type) = branch_result.map_err(|e| e.to_string())?;
        let name = branch.name().map_err(|e| e.to_string())?.unwrap_or("").to_string();
        
        let (ahead, behind) = if let Ok(upstream) = branch.upstream() {
            let ahead_behind = repo
                .graph_ahead_behind(
                    branch.get().target().unwrap(),
                    upstream.get().target().unwrap()
                )
                .unwrap_or((0, 0));
            ahead_behind
        } else {
            (0, 0)
        };
        
        branch_list.push(BranchInfo {
            name: name.clone(),
            is_head: branch.is_head(),
            upstream: branch.upstream().ok().and_then(|b| b.name().ok().map(|n| n.unwrap_or("").to_string())),
            ahead_count: ahead as u32,
            behind_count: behind as u32,
        });
    }

    Ok(branch_list)
}

#[command]
async fn get_git_history(
    state: State<'_, RepositoryState>
) -> Result<Vec<ExtendedCommitInfo>, String> {
    let repo = state.0.lock().unwrap();
    let repo = repo.as_ref().ok_or("No repository opened")?;
    
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME).map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    
    let mut commits = Vec::new();
    let mut branch_positions = HashMap::new();
    let mut next_position = 0;

    // Get all references for labeling
    let refs: HashMap<Oid, Vec<String>> = repo
        .references()
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|r| r.target().map(|oid| (oid, r.name().unwrap_or("").to_string())))
        .fold(HashMap::new(), |mut acc, (oid, name)| {
            acc.entry(oid).or_insert_with(Vec::new).push(name);
            acc
        });

    for oid_result in revwalk.take(100) {
        let oid = oid_result.map_err(|e| e.to_string())?;
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        
        let branch_name = get_branch_for_commit(repo, &commit)
            .unwrap_or_else(|_| "detached".to_string());
        
        let position = *branch_positions
            .entry(branch_name.clone())
            .or_insert_with(|| {
                let pos = next_position;
                next_position += 1;
                pos
            });

        let stats = if let Ok(parent) = commit.parent(0) {
            let diff = repo
                .diff_tree_to_tree(
                    Some(&parent.tree().unwrap()),
                    Some(&commit.tree().unwrap()),
                    None,
                )
                .unwrap();
            let stats = diff.stats().unwrap();
            CommitStats {
                files_changed: stats.files_changed(),
                insertions: stats.insertions(),
                deletions: stats.deletions(),
            }
        } else {
            CommitStats {
                files_changed: 0,
                insertions: 0,
                deletions: 0,
            }
        };

        commits.push(ExtendedCommitInfo {
            id: oid.to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            committer: commit.committer().name().unwrap_or("").to_string(),
            committer_email: commit.committer().email().unwrap_or("").to_string(),
            branch: branch_name,
            timestamp: format_timestamp(commit.time()),
            parents: commit.parent_ids().map(|oid| oid.to_string()).collect(),
            color: get_commit_color(position),
            position: position as i32,
            commit_type: if commit.parent_count() > 1 { "merge" } else { "commit" }.to_string(),
            stats,
            refs: refs.get(&oid).cloned().unwrap_or_default(),
        });
    }

    Ok(commits)
}

// Helper function to get repository status
fn get_repo_status(repo: &Repository) -> Result<RepoStatus, String> {
    let head = repo.head().ok();
    let current_branch = head
        .as_ref()
        .and_then(|h| h.shorthand())
        .unwrap_or("HEAD detached")
        .to_string();

    let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
    let clean = statuses.is_empty();
    
    let changes = statuses
        .iter()
        .map(|entry| {
            let status = match entry.status() {
                s if s.is_index_new() => "new",
                s if s.is_index_modified() => "modified",
                s if s.is_index_deleted() => "deleted",
                s if s.is_index_renamed() => "renamed",
                s if s.is_wt_modified() => "modified",
                s if s.is_wt_deleted() => "deleted",
                s if s.is_ignored() => "ignored",
                _ => "unknown",
            };
            
            FileStatus {
                path: entry.path().unwrap_or("").to_string(),
                status: status.to_string(),
            }
        })
        .collect();

    Ok(RepoStatus {
        current_branch,
        clean,
        changes,
    })
}

// Helper functions remain the same
fn get_commit_color(index: usize) -> String {
    let colors = vec![
        "#4A9EFF", "#E535AB", "#FF9800", "#2196F3",
        "#9C27B0", "#4CAF50", "#FF5722"
    ];
    colors[index % colors.len()].to_string()
}

fn get_branch_for_commit(
    repo: &Repository,
    commit: &Commit
) -> Result<String, git2::Error> {
    let branches = repo.branches(Some(BranchType::Local))?;
    
    for branch_result in branches {
        let (branch, _) = branch_result?;
        if let Some(target) = branch.get().target() {
            if target == commit.id() {
                return Ok(branch.name()?.unwrap_or("").to_string());
            }
        }
    }
    
    Ok("".to_string())
}

fn format_timestamp(time: git2::Time) -> String {
    let dt = DateTime::<Utc>::from_timestamp(time.seconds(), 0)
        .unwrap_or_default();
    let now = Utc::now();
    let diff = now.signed_duration_since(dt);
    
    if diff.num_days() > 0 {
        if diff.num_days() == 1 {
            "yesterday".to_string()
        } else {
            format!("{} days ago", diff.num_days())
        }
    } else if diff.num_hours() > 0 {
        format!("{} hours ago", diff.num_hours())
    } else {
        format!("{} minutes ago", diff.num_minutes())
    }
}

// Initialize the plugin
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("git")
        .invoke_handler(tauri::generate_handler![
            open_repository,
            get_branches,
            get_git_history,
        ])
        .setup(|app| {
            app.manage(RepositoryState(Mutex::new(None)));
            Ok(())
        })
        .build()
}

fn main() {
    tauri::Builder::default()
        .plugin(init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}