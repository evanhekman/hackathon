use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        Json,
    },
};
use futures_util::{stream::Stream, StreamExt};
use std::{convert::Infallible, path::PathBuf, sync::Arc, time::Duration};
use tracing::{error, info, warn};

use crate::services::{distill, git};
use crate::types::{
    ApiError, GrokCommitSummaryRequest, GrokCommitSummaryResponse,
    GrokObsoleteReplacementRequest, GrokObsoleteReplacementResponse,
    GrokRepoSummaryRequest, GrokRepoSummaryResponse, GrokSelectionStreamRequest,
    GrokSelectionSummaryRequest, GrokSelectionSummaryResponse,
};
use kicad_db::{
    messages::{ChatCompletionRequest, Message, ReasoningEffort},
    utilities::load_environment_file::load_environment_file,
    xai_client::{InputMessage, ResponsesRequest, Tool, XaiClient},
    PgPool,
};

/// Load the system prompt from the grokprompts directory
fn load_system_prompt() -> String {
    // Try multiple paths to find the system prompt
    let possible_paths = [
        // Relative to CARGO_MANIFEST_DIR (during cargo run)
        std::env::var("CARGO_MANIFEST_DIR")
            .ok()
            .map(|dir| PathBuf::from(dir).parent().map(|p| p.join("grokprompts/systemprompt.txt")))
            .flatten(),
        // Relative to current working directory
        Some(PathBuf::from("grokprompts/systemprompt.txt")),
        // Parent directory (if running from backend/)
        Some(PathBuf::from("../grokprompts/systemprompt.txt")),
    ];

    for path in possible_paths.into_iter().flatten() {
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    info!("Loaded system prompt from {:?}", path);
                    return content;
                }
                Err(e) => {
                    warn!("Failed to read system prompt from {:?}: {}", path, e);
                }
            }
        }
    }

    // Fallback to embedded default prompt
    warn!("Could not load system prompt file, using default");
    DEFAULT_SYSTEM_PROMPT.to_string()
}

/// Default system prompt (fallback if file not found)
const DEFAULT_SYSTEM_PROMPT: &str = r#"You are a specialized circuit-explanation assistant for KiCad schematics.

## Data Model

The user provides KiCad schematic data in **JSON** with:

- `components`: reference, type/kind, value/part_name, pins (with connected nets)
- `nets`: name and list of connected pins

## Primary Objective

Explain **what each IC (and nearby key parts) does** in simple, plain language.

## Answer Style

Keep answers **short and easy to read**:
- For simple questions, give **one short sentence per part**
- Only go into detailed explanations if asked

Use everyday language and avoid heavy jargon. When you must use a technical term, add a short explanation."#;

/// Build semantic context for selected components from distilled data
fn build_component_context(
    distilled: &serde_json::Value,
    component_ids: &[String],
) -> (String, String) {
    let components = distilled
        .get("components")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|c| {
                    c.get("reference")
                        .and_then(|r| r.as_str())
                        .map(|r| component_ids.contains(&r.to_string()))
                        .unwrap_or(false)
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let nets = distilled
        .get("nets")
        .and_then(|n| n.as_object())
        .cloned()
        .unwrap_or_default();

    let proximities = distilled
        .get("proximities")
        .and_then(|p| p.as_array())
        .cloned()
        .unwrap_or_default();

    // Build detailed component descriptions
    let mut component_details = Vec::new();
    for comp in &components {
        let reference = comp.get("reference").and_then(|v| v.as_str()).unwrap_or("?");
        let value = comp.get("value").and_then(|v| v.as_str()).unwrap_or("?");
        let lib_id = comp.get("lib_id").and_then(|v| v.as_str()).unwrap_or("?");
        let category = comp.get("category").and_then(|v| v.as_str()).unwrap_or("other");
        let footprint = comp.get("footprint").and_then(|v| v.as_str());
        let sheet_path = comp.get("sheet_path").and_then(|v| v.as_str());

        let mut detail = format!(
            "**{}** ({})\n  - Type: {}\n  - Value: {}",
            reference, category, lib_id, value
        );

        if let Some(fp) = footprint {
            if !fp.is_empty() {
                detail.push_str(&format!("\n  - Footprint: {}", fp));
            }
        }

        if let Some(sp) = sheet_path {
            if sp != "/" {
                detail.push_str(&format!("\n  - Sheet: {}", sp));
            }
        }

        // Add pin connections
        if let Some(pins) = comp.get("pins").and_then(|p| p.as_array()) {
            let pin_strs: Vec<String> = pins
                .iter()
                .filter_map(|pin| {
                    let num = pin.get("number").and_then(|v| v.as_str())?;
                    let name = pin.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let net = pin.get("net").and_then(|v| v.as_str()).unwrap_or("NC");
                    if name.is_empty() {
                        Some(format!("Pin {} → {}", num, net))
                    } else {
                        Some(format!("Pin {} ({}) → {}", num, name, net))
                    }
                })
                .collect();

            if !pin_strs.is_empty() {
                detail.push_str(&format!("\n  - Pins:\n    {}", pin_strs.join("\n    ")));
            }
        }

        // Add properties if any
        if let Some(props) = comp.get("properties").and_then(|p| p.as_object()) {
            let prop_strs: Vec<String> = props
                .iter()
                .filter(|(k, _)| !k.starts_with("ki_"))
                .filter_map(|(k, v)| {
                    v.as_str().map(|val| format!("{}: {}", k, val))
                })
                .collect();

            if !prop_strs.is_empty() {
                detail.push_str(&format!("\n  - Properties: {}", prop_strs.join(", ")));
            }
        }

        component_details.push(detail);
    }

    // Find nearby components from proximities
    let nearby_refs: Vec<String> = proximities
        .iter()
        .filter_map(|prox| {
            let ref_a = prox.get("ref_a").and_then(|v| v.as_str())?;
            let ref_b = prox.get("ref_b").and_then(|v| v.as_str())?;
            let score = prox.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);

            // Only include high-score proximities (likely related components)
            if score > 0.3 {
                if component_ids.contains(&ref_a.to_string()) && !component_ids.contains(&ref_b.to_string()) {
                    return Some(ref_b.to_string());
                }
                if component_ids.contains(&ref_b.to_string()) && !component_ids.contains(&ref_a.to_string()) {
                    return Some(ref_a.to_string());
                }
            }
            None
        })
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .take(10)
        .collect();

    // Get details for nearby components
    let nearby_details: Vec<String> = if !nearby_refs.is_empty() {
        distilled
            .get("components")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| {
                        let reference = c.get("reference").and_then(|r| r.as_str())?;
                        if nearby_refs.contains(&reference.to_string()) {
                            let value = c.get("value").and_then(|v| v.as_str()).unwrap_or("?");
                            let category = c.get("category").and_then(|v| v.as_str()).unwrap_or("?");
                            Some(format!("{} ({}, {})", reference, value, category))
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    // Build schematic overview
    let all_components = distilled
        .get("components")
        .and_then(|c| c.as_array())
        .map(|arr| arr.len())
        .unwrap_or(0);

    let schematic_overview = format!(
        "The schematic contains {} total components and {} nets.",
        all_components,
        nets.len()
    );

    // Build selected context
    let selected_context = if component_details.is_empty() {
        "No specific components selected.".to_string()
    } else {
        let mut ctx = format!("## Selected Components ({})\n\n", component_details.len());
        ctx.push_str(&component_details.join("\n\n"));

        if !nearby_details.is_empty() {
            ctx.push_str(&format!(
                "\n\n## Nearby/Related Components\n{}",
                nearby_details.join(", ")
            ));
        }

        ctx
    };

    (selected_context, schematic_overview)
}

pub type AppState = Arc<PgPool>;

/// Get an AI-generated summary for a specific commit
#[utoipa::path(
    post,
    path = "/api/grok/summary/commit",
    request_body = GrokCommitSummaryRequest,
    responses(
        (status = 200, description = "AI-generated commit summary", body = GrokCommitSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_commit(
    State(_state): State<AppState>,
    Json(req): Json<GrokCommitSummaryRequest>,
) -> Result<Json<GrokCommitSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok summarize_commit called for {}/{}",
        req.repo, req.commit
    );

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to load environment: {}",
                e
            ))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to initialize XAI client: {}",
                e
            ))),
        )
    })?;

    // Construct GitHub commit URL
    let github_url = format!("https://github.com/{}/commit/{}", req.repo, req.commit);

    // Create user message with GitHub URL
    let user_message = format!(
        "Search online for the changes in the commit {} and summarize the changes",
        github_url
    );

    // Create input message for responses API
    let input = vec![InputMessage::user(user_message)];

    // Create tools - use both web_search and x_search for comprehensive results
    let tools = vec![Tool::web_search(), Tool::x_search()];

    // Create responses request with hardcoded model
    let responses_request = ResponsesRequest::new("grok-4-1-fast".to_string(), input, tools);

    // Make API call using responses endpoint
    let api_response = xai_client
        .responses(&responses_request)
        .await
        .map_err(|e| {
            error!("XAI API call failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to get AI summary: {}",
                    e
                ))),
            )
        })?;

    // TODO: Implement this or not.
    // Get changed files for context
    // let changed_files = git::get_changed_schematic_files(&req.repo, &req.commit)
    //     .await
    //     .map_err(|e| {
    //         (
    //             StatusCode::INTERNAL_SERVER_ERROR,
    //             Json(ApiError::internal(format!(
    //                 "Failed to fetch changed files: {}",
    //                 e
    //             ))),
    //         )
    //     })?;

    // Extract response content from tool results
    // The responses API returns tool call results, so we need to extract meaningful information
    let summary = if let Some(output) = &api_response.output {
        // Try to extract text from tool results
        let mut result_parts = Vec::new();

        for item in output {
            if let Some(name) = &item.name {
                result_parts.push(format!("Tool: {}", name));
            }
            if let Some(status) = &item.status {
                result_parts.push(format!("Status: {}", status));
            }
            if let Some(result) = &item.result {
                result_parts.push(format!(
                    "Result: {}",
                    serde_json::to_string(result).unwrap_or_else(|_| "N/A".to_string())
                ));
            }
            if let Some(content) = &item.content {
                result_parts.push(format!(
                    "Content: {}",
                    serde_json::to_string(content).unwrap_or_else(|_| "N/A".to_string())
                ));
            }
        }

        if result_parts.is_empty() {
            format!(
                "Found {} tool result(s) for commit {}/{}",
                output.len(),
                req.repo,
                req.commit
            )
        } else {
            result_parts.join("\n")
        }
    } else {
        format!("No results returned for commit {}/{}", req.repo, req.commit)
    };

    // For details, include more information about the response
    let details = format!(
        "Response ID: {:?}\nModel: {:?}\nTool Results: {}\n\n{}",
        api_response.id,
        api_response.model,
        api_response.output.as_ref().map(|o| o.len()).unwrap_or(0),
        summary
    );

    info!(
        "Successfully generated summary for {}/{}",
        req.repo, req.commit
    );

    // Mock response - TODO: integrate with actual Grok API
    // let summary = format!(
    //     "[MOCK] This commit modified {} schematic file(s) in the {} repository.",
    //     changed_files.len(),
    //     req.repo
    // );

    // let details = format!(
    //     "[MOCK] Detailed analysis of commit {}:\n\n\
    //     Changed files:\n{}\n\n\
    //     This is a placeholder response. In production, this would contain \
    //     AI-generated insights about the schematic changes, including:\n\
    //     - Component additions/removals\n\
    //     - Net connectivity changes\n\
    //     - Design rule modifications\n\
    //     - Potential impact on board layout",
    //     req.commit,
    //     changed_files
    //         .iter()
    //         .map(|f| format!("  - {}", f))
    //         .collect::<Vec<_>>()
    //         .join("\n")
    // );

    Ok(Json(GrokCommitSummaryResponse {
        repo: req.repo,
        commit: req.commit,
        summary,
        details,
    }))
}

/// Get an AI-generated summary for selected components
#[utoipa::path(
    post,
    path = "/api/grok/summary/selection",
    request_body = GrokSelectionSummaryRequest,
    responses(
        (status = 200, description = "AI-generated component selection summary", body = GrokSelectionSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_selection(
    State(_state): State<AppState>,
    Json(req): Json<GrokSelectionSummaryRequest>,
) -> Result<Json<GrokSelectionSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok summarize_selection called for {}/{} with {} components",
        req.repo,
        req.commit,
        req.component_ids.len()
    );

    // Mock response - TODO: integrate with actual Grok API
    let summary = format!(
        "[MOCK] Analysis of {} selected component(s) in commit {}.",
        req.component_ids.len(),
        &req.commit[..8.min(req.commit.len())]
    );

    let details = format!(
        "[MOCK] Detailed analysis of selected components:\n\n\
        Selected IDs: {}\n\n\
        This is a placeholder response. In production, this would contain \
        AI-generated insights about the selected components, including:\n\
        - Component specifications and datasheets\n\
        - Pin connectivity and net associations\n\
        - Related components in the design\n\
        - Suggestions for alternatives or improvements",
        req.component_ids.join(", ")
    );

    Ok(Json(GrokSelectionSummaryResponse {
        repo: req.repo,
        commit: req.commit,
        component_ids: req.component_ids,
        summary,
        details,
    }))
}

/// Get an AI-generated summary for an entire repository (latest commit on main)
#[utoipa::path(
    post,
    path = "/api/grok/summary/repo",
    request_body = GrokRepoSummaryRequest,
    responses(
        (status = 200, description = "AI-generated repository summary", body = GrokRepoSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_repo(
    State(_state): State<AppState>,
    Json(req): Json<GrokRepoSummaryRequest>,
) -> Result<Json<GrokRepoSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!("Grok summarize_repo called for {}", req.repo);

    // Get the latest commit
    let latest_commit = git::get_latest_commit(&req.repo).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to fetch latest commit: {}",
                e
            ))),
        )
    })?;

    // Get schematic files at latest commit
    let files = git::get_schematic_files(&req.repo, &latest_commit)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch schematic files: {}",
                    e
                ))),
            )
        })?;

    // Mock response - TODO: integrate with actual Grok API
    let summary = format!(
        "[MOCK] Repository {} contains {} schematic file(s) at the latest commit.",
        req.repo,
        files.len()
    );

    let details = format!(
        "[MOCK] Repository overview for {}:\n\n\
        Latest commit: {}\n\
        Schematic files:\n{}\n\n\
        This is a placeholder response. In production, this would contain \
        AI-generated insights about the entire project, including:\n\
        - Overall design architecture\n\
        - Key components and subsystems\n\
        - Design complexity metrics\n\
        - Potential areas for improvement",
        req.repo,
        latest_commit,
        files
            .iter()
            .map(|f| format!("  - {}", f.path))
            .collect::<Vec<_>>()
            .join("\n")
    );

    Ok(Json(GrokRepoSummaryResponse {
        repo: req.repo,
        summary,
        details,
    }))
}

/// Find replacement parts for an obsolete component using Grok AI
#[utoipa::path(
    post,
    path = "/api/grok/obsolete/replacement",
    request_body = GrokObsoleteReplacementRequest,
    responses(
        (status = 200, description = "AI-generated replacement recommendations", body = GrokObsoleteReplacementResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn find_replacement(
    State(_state): State<AppState>,
    Json(req): Json<GrokObsoleteReplacementRequest>,
) -> Result<Json<GrokObsoleteReplacementResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok find_replacement called for obsolete part: {}",
        req.manufacturer_part_number
    );

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to load environment: {}",
                e
            ))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to initialize XAI client: {}",
                e
            ))),
        )
    })?;

    // Build the context about the obsolete part
    let mut part_info = format!("Obsolete Part: {}\n", req.manufacturer_part_number);

    if let Some(ref mfr) = req.manufacturer {
        part_info.push_str(&format!("Manufacturer: {}\n", mfr));
    }

    if let Some(ref desc) = req.description {
        part_info.push_str(&format!("Description: {}\n", desc));
    }

    if let Some(ref cat) = req.category {
        part_info.push_str(&format!("Category: {}\n", cat));
    }

    // Add key parameters
    if !req.parameters.is_empty() {
        part_info.push_str("Key Specifications:\n");
        for param in &req.parameters {
            part_info.push_str(&format!("  - {}: {}\n", param.name, param.value));
        }
    }

    // Add links for Grok to research
    if let Some(ref datasheet_url) = req.datasheet_url {
        part_info.push_str(&format!("\nDatasheet URL: {}\n", datasheet_url));
    }

    if let Some(ref product_url) = req.product_url {
        part_info.push_str(&format!("DigiKey Product Page: {}\n", product_url));
    }

    // Create user message with comprehensive prompt
    let user_message = format!(
        r#"I need to find replacement parts for an OBSOLETE electronic component. Here is the information about the obsolete part:

{}

Please help me find compatible replacement parts by:
1. First, analyze the datasheet and product page (if URLs provided) to understand the full specifications
2. Search for currently available parts with matching or better specifications
3. Focus on finding parts that are pin-compatible or have similar footprints
4. Consider functional equivalents from other manufacturers
5. Prioritize parts that are actively manufactured (not NRND or obsolete)

For each recommended replacement, provide:
- Part number and manufacturer
- Why it's a good replacement (key matching specs)
- Any differences or modifications needed
- Direct links to purchase (DigiKey, Mouser, or manufacturer page)

Format the response clearly with headers and bullet points."#,
        part_info
    );

    // Create input message for responses API
    let input = vec![InputMessage::user(user_message)];

    // Use web_search tool for comprehensive online research
    let tools = vec![Tool::web_search()];

    // Create responses request with Grok model (must use grok-4 family for tools)
    let responses_request =
        ResponsesRequest::new("grok-4-1-fast-non-reasoning".to_string(), input, tools);

    // Make API call using responses endpoint
    let api_response = xai_client
        .responses(&responses_request)
        .await
        .map_err(|e| {
            error!("XAI API call failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to get AI replacement suggestions: {}",
                    e
                ))),
            )
        })?;

    // Extract the analysis from the response
    let analysis = if let Some(output) = &api_response.output {
        let mut result_parts = Vec::new();

        for item in output {
            // Extract content from message type outputs
            if let Some(content) = &item.content {
                // Content can be a string or array of content blocks
                if let Some(content_str) = content.as_str() {
                    result_parts.push(content_str.to_string());
                } else if let Some(content_arr) = content.as_array() {
                    for content_item in content_arr {
                        if let Some(text) = content_item.get("text").and_then(|t| t.as_str()) {
                            result_parts.push(text.to_string());
                        }
                    }
                }
            }

            // Also check for result field (tool outputs)
            if let Some(result) = &item.result {
                if let Some(result_str) = result.as_str() {
                    // Don't include raw tool results, just note they were used
                    if !result_str.is_empty() {
                        result_parts.push("[Research data retrieved]".to_string());
                    }
                }
            }
        }

        if result_parts.is_empty() {
            format!(
                "Unable to generate replacement recommendations for {}. Please try again or search manually on DigiKey.",
                req.manufacturer_part_number
            )
        } else {
            // Filter out duplicate "Research data retrieved" messages
            let filtered: Vec<String> = result_parts
                .into_iter()
                .filter(|s| !s.contains("[Research data retrieved]") || s.len() > 30)
                .collect();

            if filtered.is_empty() {
                format!(
                    "Research completed but no specific recommendations could be extracted for {}. Please try searching manually.",
                    req.manufacturer_part_number
                )
            } else {
                filtered.join("\n\n")
            }
        }
    } else {
        format!(
            "No response received from AI for {}. Please try again.",
            req.manufacturer_part_number
        )
    };

    info!(
        "Successfully generated replacement suggestions for {}",
        req.manufacturer_part_number
    );

    Ok(Json(GrokObsoleteReplacementResponse {
        original_part: req.manufacturer_part_number,
        analysis,
        success: true,
        error: None,
    }))
}

/// Stream an AI chat response using Server-Sent Events
#[utoipa::path(
    get,
    path = "/api/grok/chat/stream",
    responses(
        (status = 200, description = "Streaming AI chat response via SSE"),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn chat_stream(
    State(_state): State<AppState>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<ApiError>)> {
    info!("Grok chat_stream called");

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to load environment: {}",
                e
            ))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to initialize XAI client: {}",
                e
            ))),
        )
    })?;

    // TODO: Accept messages from request body. Currently using static prompts for testing.
    // This endpoint should be converted to POST with a request body containing the user's
    // selection context and question. For now, we use a hardcoded prompt to verify streaming works.
    let messages = vec![
        Message::system(
            "You are Grok, an expert AI assistant specialized in electronics and PCB design. \
            You help users understand KiCad schematics, components, and circuit design. \
            Be concise but informative. Use technical terms when appropriate.".to_string()
        ),
        Message::user(
            "Give me a brief overview of what to look for when reviewing a KiCad schematic for an embedded system.".to_string()
        ),
    ];

    // Create chat completion request with streaming
    let chat_request =
        ChatCompletionRequest::with_stream(messages, "grok-3-fast".to_string(), true);

    // Get the stream
    let stream = xai_client
        .chat_completion_stream(&chat_request)
        .await
        .map_err(|e| {
            error!("Failed to create XAI stream: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to start AI stream: {}",
                    e
                ))),
            )
        })?;

    // Convert the stream to SSE events
    let sse_stream = async_stream::stream! {
        tokio::pin!(stream);

        while let Some(result) = stream.next().await {
            match result {
                Ok(content) => {
                    yield Ok(Event::default().data(content));
                }
                Err(e) => {
                    error!("Stream error: {}", e);
                    yield Ok(Event::default().data(format!("[ERROR: {}]", e)));
                    break;
                }
            }
        }

        // Send a done event
        yield Ok(Event::default().data("[DONE]"));
    };

    Ok(Sse::new(sse_stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    ))
}

/// Stream an AI analysis of selected components using Server-Sent Events
#[utoipa::path(
    post,
    path = "/api/grok/selection/stream",
    request_body = GrokSelectionStreamRequest,
    responses(
        (status = 200, description = "Streaming AI analysis response via SSE"),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn selection_stream(
    State(state): State<AppState>,
    Json(req): Json<GrokSelectionStreamRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok selection_stream called for {}/{} with {} components",
        req.repo,
        req.commit,
        req.component_ids.len()
    );

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to load environment: {}",
                e
            ))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to initialize XAI client: {}",
                e
            ))),
        )
    })?;

    // Get distilled schematic data - either from request or fetch it
    let distilled = if let Some(d) = req.distilled {
        d
    } else {
        // Fetch distilled data from cache or generate it
        let repo_url = format!("https://github.com/{}.git", req.repo);
        match kicad_db::retrieve_distilled_json(&state, &repo_url, &req.commit).await {
            Ok(Some(cached)) => cached,
            _ => {
                // Generate if not cached
                distill::distill_repo_schematics(&req.repo, &req.commit)
                    .await
                    .map_err(|e| {
                        error!("Failed to distill schematic: {}", e);
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ApiError::internal(format!(
                                "Failed to distill schematic: {}",
                                e
                            ))),
                        )
                    })?
            }
        }
    };

    // Build rich semantic context from distilled data
    let (selected_context, schematic_summary) = build_component_context(&distilled, &req.component_ids);

    // Load the system prompt from file
    let base_system_prompt = load_system_prompt();

    // Build system and user messages with the loaded system prompt
    let system_prompt = format!(
        "{}\n\n---\n\n## Schematic Context\n{}",
        base_system_prompt,
        schematic_summary
    );

    let user_prompt = format!(
        "{}\n\n---\n\n## User's Question\n{}",
        selected_context,
        req.query
    );

    info!(
        "Using system prompt ({} chars), context ({} chars), thinking_mode: {}",
        system_prompt.len(),
        user_prompt.len(),
        req.thinking_mode
    );

    let messages = vec![Message::system(system_prompt), Message::user(user_prompt)];

    // Create chat completion request with streaming
    // Use grok-4-1-fast model, with optional reasoning/thinking mode
    let chat_request = if req.thinking_mode {
        ChatCompletionRequest::with_reasoning(
            messages,
            "grok-4-1-fast".to_string(),
            true,
            ReasoningEffort::Low,
        )
    } else {
        ChatCompletionRequest::with_stream(messages, "grok-4-1-fast".to_string(), true)
    };

    // Get the stream
    let stream = xai_client
        .chat_completion_stream(&chat_request)
        .await
        .map_err(|e| {
            error!("Failed to create XAI stream: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to start AI stream: {}",
                    e
                ))),
            )
        })?;

    // Convert the stream to SSE events
    let sse_stream = async_stream::stream! {
        tokio::pin!(stream);

        while let Some(result) = stream.next().await {
            match result {
                Ok(content) => {
                    yield Ok(Event::default().data(content));
                }
                Err(e) => {
                    error!("Stream error: {}", e);
                    yield Ok(Event::default().data(format!("[ERROR: {}]", e)));
                    break;
                }
            }
        }

        // Send a done event
        yield Ok(Event::default().data("[DONE]"));
    };

    Ok(Sse::new(sse_stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    ))
}
