use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use git2::{build::RepoBuilder, ObjectType, Repository};
use std::path::PathBuf;
use tracing::{info, warn};

use crate::types::{CommitInfo, SchematicFile};

/// Get the cache path for a repository
fn get_cache_path(repo_slug: &str) -> PathBuf {
    std::env::temp_dir().join(format!("kicad-cache-{}", repo_slug.replace('/', "-")))
}

/// Invalidate (delete) the cache for a repository
/// Call this when you know there are new commits (e.g., from a webhook)
pub async fn invalidate_cache(repo_slug: &str) -> Result<()> {
    let cache_path = get_cache_path(repo_slug);
    if cache_path.exists() {
        tokio::fs::remove_dir_all(&cache_path).await?;
        info!(
            "Invalidated cache for repo {} at {:?}",
            repo_slug, cache_path
        );
    }
    Ok(())
}

/// Clone or fetch a repository, returning a handle to it
/// If force_fresh is true, deletes any existing cache first
pub async fn get_repo(repo_slug: &str) -> Result<Repository> {
    get_repo_with_options(repo_slug, false).await
}

/// Clone or fetch a repository with options
/// If force_fresh is true, deletes any existing cache first
pub async fn get_repo_with_options(repo_slug: &str, force_fresh: bool) -> Result<Repository> {
    let repo_slug = repo_slug.to_string();
    let cache_path = get_cache_path(&repo_slug);

    // If force_fresh, delete the cache first
    if force_fresh && cache_path.exists() {
        tokio::fs::remove_dir_all(&cache_path).await?;
        info!(
            "Force-deleted cache for repo {} at {:?}",
            repo_slug, cache_path
        );
    }

    tokio::task::spawn_blocking(move || -> Result<Repository> {
        if !cache_path.exists() {
            let url = format!("https://github.com/{}.git", repo_slug);
            let repo = RepoBuilder::new()
                .clone(&url, &cache_path)
                .context("Failed to clone repository")?;
            info!("Cloned repo {} to {:?}", repo_slug, cache_path);
            Ok(repo)
        } else {
            let repo = Repository::open(&cache_path).context("Failed to open cached repository")?;
            // Fetch updates
            {
                let mut remote = repo.find_remote("origin").or_else(|_| {
                    let url = format!("https://github.com/{}.git", repo_slug);
                    repo.remote("origin", &url)
                })?;
                remote.fetch(&["refs/heads/*:refs/remotes/origin/*"], None, None)?;
            }

            // Update local HEAD to match remote's default branch
            // First, find the remote HEAD (origin/HEAD or origin/main or origin/master)
            let remote_commit_id = {
                let remote_head = repo
                    .find_reference("refs/remotes/origin/HEAD")
                    .or_else(|_| repo.find_reference("refs/remotes/origin/main"))
                    .or_else(|_| repo.find_reference("refs/remotes/origin/master"))
                    .context("Failed to find remote HEAD")?;
                remote_head.peel_to_commit()?.id()
            };

            // Reset HEAD to point to the remote commit
            repo.set_head_detached(remote_commit_id)?;
            info!(
                "Updated repo {} from cache {:?}, HEAD now at {}",
                repo_slug,
                cache_path,
                &remote_commit_id.to_string()[..8]
            );

            Ok(repo)
        }
    })
    .await?
}

/// Get a repo with a forced fresh clone (for webhook use)
pub async fn get_repo_fresh(repo_slug: &str) -> Result<Repository> {
    get_repo_with_options(repo_slug, true).await
}

/// Get all commits that modify .kicad_sch files
pub async fn get_schematic_commits(repo_slug: &str) -> Result<Vec<CommitInfo>> {
    let repo = get_repo(repo_slug).await?;

    tokio::task::spawn_blocking(move || -> Result<Vec<CommitInfo>> {
        let mut revwalk = repo.revwalk()?;
        let _ = revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME);
        revwalk.push_head()?;

        let mut commits = Vec::new();

        for oid in revwalk {
            let oid = oid?;
            let commit = repo.find_commit(oid)?;

            if has_schematic_changes(&repo, &commit)? {
                let commit_date = Utc.timestamp_opt(commit.time().seconds(), 0).single();

                commits.push(CommitInfo {
                    commit_hash: commit.id().to_string(),
                    commit_date,
                    message: commit.summary().map(ToString::to_string),
                });
            }
        }

        Ok(commits)
    })
    .await?
}

/// Check if a commit contains changes to .kicad_sch files
fn has_schematic_changes(repo: &Repository, commit: &git2::Commit) -> Result<bool> {
    if let Some(parent) = commit.parents().next() {
        let tree1 = parent.tree()?;
        let tree2 = commit.tree()?;
        let diff = repo.diff_tree_to_tree(Some(&tree1), Some(&tree2), None)?;

        Ok(diff.deltas().any(|d| {
            d.old_file()
                .path()
                .and_then(|p| p.to_str())
                .map(|s| s.ends_with(".kicad_sch"))
                .unwrap_or(false)
                || d.new_file()
                    .path()
                    .and_then(|p| p.to_str())
                    .map(|s| s.ends_with(".kicad_sch"))
                    .unwrap_or(false)
        }))
    } else {
        // Root commit: check if tree has any .kicad_sch files
        let tree = commit.tree()?;
        let mut has = false;
        tree.walk(git2::TreeWalkMode::PreOrder, |_, entry| {
            if let Some(name) = entry.name() {
                if name.ends_with(".kicad_sch") && entry.kind() == Some(ObjectType::Blob) {
                    has = true;
                    return git2::TreeWalkResult::Abort;
                }
            }
            git2::TreeWalkResult::Ok
        })?;
        Ok(has)
    }
}

/// Get all .kicad_sch files at a specific commit
pub async fn get_schematic_files(repo_slug: &str, commit_hash: &str) -> Result<Vec<SchematicFile>> {
    let repo = get_repo(repo_slug).await?;
    let commit_hash = commit_hash.to_string();

    tokio::task::spawn_blocking(move || -> Result<Vec<SchematicFile>> {
        let obj = repo.revparse_single(&commit_hash)?;
        let commit = obj.peel_to_commit()?;
        let tree = commit.tree()?;

        let mut files = Vec::new();

        tree.walk(git2::TreeWalkMode::PreOrder, |dir, entry| {
            if let Some(name) = entry.name() {
                if name.ends_with(".kicad_sch") && entry.kind() == Some(ObjectType::Blob) {
                    let path = if dir.is_empty() {
                        name.to_string()
                    } else {
                        format!("{}{}", dir, name)
                    };

                    if let Ok(obj) = entry.to_object(&repo) {
                        if let Ok(blob) = obj.into_blob() {
                            let content = String::from_utf8_lossy(blob.content()).to_string();
                            files.push(SchematicFile { path, content });
                        }
                    }
                }
            }
            git2::TreeWalkResult::Ok
        })?;

        Ok(files)
    })
    .await?
}

/// Get changed .kicad_sch file paths for a specific commit
pub async fn get_changed_schematic_files(
    repo_slug: &str,
    commit_hash: &str,
) -> Result<Vec<String>> {
    let repo = get_repo(repo_slug).await?;
    let commit_hash = commit_hash.to_string();

    tokio::task::spawn_blocking(move || -> Result<Vec<String>> {
        let obj = repo.revparse_single(&commit_hash)?;
        let commit = obj.peel_to_commit()?;

        let mut changed_files = Vec::new();

        if let Some(parent) = commit.parents().next() {
            let tree1 = parent.tree()?;
            let tree2 = commit.tree()?;
            let diff = repo.diff_tree_to_tree(Some(&tree1), Some(&tree2), None)?;

            for delta in diff.deltas() {
                if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                    if path.ends_with(".kicad_sch") {
                        changed_files.push(path.to_string());
                    }
                }
                if let Some(path) = delta.old_file().path().and_then(|p| p.to_str()) {
                    if path.ends_with(".kicad_sch") && !changed_files.contains(&path.to_string()) {
                        changed_files.push(path.to_string());
                    }
                }
            }
        } else {
            // Root commit - all files are "changed"
            let tree = commit.tree()?;
            tree.walk(git2::TreeWalkMode::PreOrder, |dir, entry| {
                if let Some(name) = entry.name() {
                    if name.ends_with(".kicad_sch") && entry.kind() == Some(ObjectType::Blob) {
                        let path = if dir.is_empty() {
                            name.to_string()
                        } else {
                            format!("{}{}", dir, name)
                        };
                        changed_files.push(path);
                    }
                }
                git2::TreeWalkResult::Ok
            })?;
        }

        Ok(changed_files)
    })
    .await?
}

/// Get commit info (date, message) for a specific commit
pub async fn get_commit_info(repo_slug: &str, commit_hash: &str) -> Result<CommitInfo> {
    let repo = get_repo(repo_slug).await?;
    let commit_hash = commit_hash.to_string();

    tokio::task::spawn_blocking(move || -> Result<CommitInfo> {
        let obj = repo.revparse_single(&commit_hash)?;
        let commit = obj.peel_to_commit()?;

        let commit_date = Utc.timestamp_opt(commit.time().seconds(), 0).single();

        Ok(CommitInfo {
            commit_hash: commit.id().to_string(),
            commit_date,
            message: commit.summary().map(ToString::to_string),
        })
    })
    .await?
}

/// Get the latest commit hash on the default branch
pub async fn get_latest_commit(repo_slug: &str) -> Result<String> {
    let repo = get_repo(repo_slug).await?;

    tokio::task::spawn_blocking(move || -> Result<String> {
        let head = repo.head()?;
        let commit = head.peel_to_commit()?;
        Ok(commit.id().to_string())
    })
    .await?
}
