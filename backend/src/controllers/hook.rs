use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::services::git;
use crate::types::{ApiError, HookUpdateResponse};
use kicad_db::{retrieve_schematic, store_schematic, PgPool};

pub type AppState = Arc<PgPool>;

/// GitHub webhook push event payload (simplified)
#[derive(Debug, Deserialize)]
pub struct GitHubPushEvent {
    #[serde(rename = "ref")]
    pub git_ref: Option<String>,
    pub repository: Option<GitHubRepository>,
    pub commits: Option<Vec<GitHubCommit>>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubRepository {
    pub full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCommit {
    pub id: Option<String>,
    pub message: Option<String>,
}

/// GitHub webhook endpoint - receives push events from GitHub
/// This forces a fresh clone to ensure we have the latest commits
#[utoipa::path(
    post,
    path = "/api/hook/github/{repo}",
    params(
        ("repo" = String, Path, description = "GitHub repository in owner/repo format")
    ),
    responses(
        (status = 200, description = "Webhook processed successfully", body = HookUpdateResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "hook"
)]
pub async fn github_webhook(
    State(state): State<AppState>,
    Path(repo): Path<String>,
    Json(payload): Json<GitHubPushEvent>,
) -> Result<Json<HookUpdateResponse>, (StatusCode, Json<ApiError>)> {
    let repo = repo.trim_start_matches('/').to_string();

    info!("Received GitHub webhook for repo: {}", repo);
    if let Some(commits) = &payload.commits {
        info!("Webhook contains {} commits", commits.len());
        for commit in commits {
            info!(
                "  Commit: {} - {:?}",
                commit.id.as_deref().unwrap_or("unknown"),
                commit.message
            );
        }
    }

    // Invalidate cache to force fresh clone
    if let Err(e) = git::invalidate_cache(&repo).await {
        warn!("Failed to invalidate cache for {}: {}", repo, e);
    }

    // Now process with fresh data
    process_repo_internal(state, repo).await
}

/// Refresh a repository - forces a fresh clone and reprocesses
#[utoipa::path(
    post,
    path = "/api/hook/refresh/{repo}",
    params(
        ("repo" = String, Path, description = "GitHub repository in owner/repo format")
    ),
    responses(
        (status = 200, description = "Repository refreshed successfully", body = HookUpdateResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "hook"
)]
pub async fn refresh_repo(
    State(state): State<AppState>,
    Path(repo): Path<String>,
) -> Result<Json<HookUpdateResponse>, (StatusCode, Json<ApiError>)> {
    let repo = repo.trim_start_matches('/').to_string();

    info!("Refresh requested for repo: {}", repo);

    // Invalidate cache to force fresh clone
    if let Err(e) = git::invalidate_cache(&repo).await {
        warn!("Failed to invalidate cache for {}: {}", repo, e);
    }

    // Now process with fresh data
    process_repo_internal(state, repo).await
}

/// Process a repository and generate overviews for commits missing them
/// Uses cached repo - for manual triggering when you know cache is fresh
#[utoipa::path(
    post,
    path = "/api/hook/update/{repo}",
    params(
        ("repo" = String, Path, description = "GitHub repository in owner/repo format")
    ),
    responses(
        (status = 200, description = "Repository processed successfully", body = HookUpdateResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "hook"
)]
pub async fn update_repo(
    State(state): State<AppState>,
    Path(repo): Path<String>,
) -> Result<Json<HookUpdateResponse>, (StatusCode, Json<ApiError>)> {
    let repo = repo.trim_start_matches('/').to_string();
    info!("Processing update hook for repo: {}", repo);
    process_repo_internal(state, repo).await
}

/// Internal function to process a repository
async fn process_repo_internal(
    state: AppState,
    repo: String,
) -> Result<Json<HookUpdateResponse>, (StatusCode, Json<ApiError>)> {
    let repo_url = format!("https://github.com/{}.git", repo);

    // Get all commits with schematic changes
    let commits = git::get_schematic_commits(&repo).await.map_err(|e| {
        error!("Failed to get commits for {}: {}", repo, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to fetch commits: {}",
                e
            ))),
        )
    })?;

    info!(
        "Found {} commits with schematic changes for repo: {}",
        commits.len(),
        repo
    );
    for (idx, commit) in commits.iter().enumerate() {
        info!(
            "  Commit {}: {} - {:?}",
            idx + 1,
            &commit.commit_hash[..8.min(commit.commit_hash.len())],
            commit.message
        );
    }

    let mut processed = 0;
    let mut errors = Vec::new();

    for commit_info in commits {
        // Check if we already have an overview for this commit
        let existing = retrieve_schematic(&state, &repo_url, &commit_info.commit_hash)
            .await
            .ok()
            .flatten();

        let needs_processing = existing
            .as_ref()
            .map(|s| s.blurb.is_none() || s.description.is_none())
            .unwrap_or(true);

        info!(
            "Commit {} needs_processing={}, existing={:?}",
            &commit_info.commit_hash[..8.min(commit_info.commit_hash.len())],
            needs_processing,
            existing.as_ref().map(|s| format!(
                "blurb={}, desc={}",
                s.blurb.is_some(),
                s.description.is_some()
            ))
        );

        if needs_processing {
            match generate_and_store_overview(
                &state,
                &repo,
                &repo_url,
                &commit_info.commit_hash,
                commit_info.commit_date,
                commit_info.message.as_deref(),
            )
            .await
            {
                Ok(_) => {
                    processed += 1;
                    info!(
                        "Generated overview for {}/{}",
                        repo, commit_info.commit_hash
                    );
                }
                Err(e) => {
                    let err_msg = format!("Commit {}: {}", commit_info.commit_hash, e);
                    // Check for rate limiting
                    if e.to_string().contains("429")
                        || e.to_string().to_lowercase().contains("rate")
                    {
                        error!(
                            "RATE LIMITED while processing commit {}: {}",
                            commit_info.commit_hash, e
                        );
                        warn!("XAI API rate limit hit! Stopping further processing.");
                        errors.push(format!("RATE LIMITED: {}", err_msg));
                        // Break out of the loop to avoid hitting more rate limits
                        break;
                    }
                    error!("Failed to generate overview: {}", err_msg);
                    errors.push(err_msg);
                }
            }
        }
    }

    info!(
        "Hook processing complete for {}: processed={}, errors={}",
        repo,
        processed,
        errors.len()
    );
    if !errors.is_empty() {
        warn!("Errors during processing: {:?}", errors);
    }

    Ok(Json(HookUpdateResponse {
        repo,
        processed,
        errors,
    }))
}

/// Generate a placeholder overview and store it in the database
async fn generate_and_store_overview(
    pool: &PgPool,
    repo_slug: &str,
    repo_url: &str,
    commit_hash: &str,
    commit_date: Option<chrono::DateTime<chrono::Utc>>,
    git_message: Option<&str>,
) -> anyhow::Result<()> {
    // Get changed files for context
    let changed_files = git::get_changed_schematic_files(repo_slug, commit_hash).await?;

    // Generate placeholder overview (TODO: integrate with Grok)
    let num_files = changed_files.len();
    let blurb = if num_files > 0 {
        format!(
            "Schematic changes in {} file(s): {}",
            num_files,
            git_message
                .unwrap_or("Update")
                .split_whitespace()
                .take(5)
                .collect::<Vec<_>>()
                .join(" ")
        )
    } else {
        "Initial schematic commit".to_string()
    };

    let mut description = format!(
        "Commit message: {}\nChanged files:\n",
        git_message.unwrap_or("(no message)")
    );
    for path in &changed_files {
        description.push_str(&format!("  - {}\n", path));
    }

    let empty_parts = HashMap::new();
    store_schematic(
        pool,
        repo_url,
        commit_hash,
        commit_date,
        git_message,
        None, // image
        None, // summary
        None, // overview
        Some(&blurb),
        Some(&description),
        empty_parts,
    )
    .await?;

    Ok(())
}
