use utoipa::OpenApi;

use crate::controllers::{grok, hook, repo};
use crate::types::{
    ApiError, CommitFilesRequest, CommitFilesResponse, CommitInfo, CommitInfoRequest,
    CommitInfoResponse, GrokCommitSummaryRequest, GrokCommitSummaryResponse,
    GrokRepoSummaryRequest, GrokRepoSummaryResponse, GrokSelectionSummaryRequest,
    GrokSelectionSummaryResponse, HookUpdateResponse, RepoCommitsRequest, RepoCommitsResponse,
    SchematicFile,
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "KiCAD Watch API",
        version = "1.0.0",
        description = "API for tracking and analyzing KiCAD schematic changes in GitHub repositories"
    ),
    paths(
        repo::get_commits,
        repo::get_commit_files,
        repo::get_commit_info,
        hook::update_repo,
        hook::refresh_repo,
        hook::github_webhook,
        grok::summarize_commit,
        grok::summarize_selection,
        grok::summarize_repo,
    ),
    components(schemas(
        RepoCommitsRequest,
        RepoCommitsResponse,
        CommitInfo,
        CommitFilesRequest,
        CommitFilesResponse,
        SchematicFile,
        CommitInfoRequest,
        CommitInfoResponse,
        HookUpdateResponse,
        GrokCommitSummaryRequest,
        GrokCommitSummaryResponse,
        GrokSelectionSummaryRequest,
        GrokSelectionSummaryResponse,
        GrokRepoSummaryRequest,
        GrokRepoSummaryResponse,
        ApiError,
    )),
    tags(
        (name = "repo", description = "Repository and commit information endpoints"),
        (name = "hook", description = "Webhook endpoints for triggering updates"),
        (name = "grok", description = "AI-powered analysis endpoints (mock)")
    )
)]
pub struct ApiDoc;
