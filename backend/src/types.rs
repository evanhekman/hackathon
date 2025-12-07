use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ============================================================================
// DigiKey API Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct DigiKeySearchRequest {
    /// Part number or keyword to search for
    pub query: String,
    /// Manufacturer part number (optional, for more precise search)
    pub mpn: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct DigiKeyPartInfo {
    /// DigiKey part number
    pub digikey_part_number: Option<String>,
    /// Manufacturer part number
    pub manufacturer_part_number: Option<String>,
    /// Manufacturer name
    pub manufacturer: Option<String>,
    /// Part description
    pub description: Option<String>,
    /// Detailed product description
    pub detailed_description: Option<String>,
    /// Product URL on DigiKey
    pub product_url: Option<String>,
    /// Datasheet URL
    pub datasheet_url: Option<String>,
    /// Primary photo URL
    pub photo_url: Option<String>,
    /// Quantity available
    pub quantity_available: Option<i64>,
    /// Unit price (USD)
    pub unit_price: Option<f64>,
    /// Product status (Active, Obsolete, etc.)
    pub product_status: Option<String>,
    /// Whether the part is obsolete/deprecated
    pub is_obsolete: bool,
    /// Lifecycle status description
    pub lifecycle_status: Option<String>,
    /// Category name
    pub category: Option<String>,
    /// Product parameters/specifications
    pub parameters: Vec<DigiKeyParameter>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema, Clone)]
pub struct DigiKeyParameter {
    /// Parameter name (e.g., "Resistance", "Capacitance")
    pub name: String,
    /// Parameter value
    pub value: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DigiKeySearchResponse {
    /// The search query used
    pub query: String,
    /// Whether the search was successful
    pub success: bool,
    /// Error message if search failed
    pub error: Option<String>,
    /// List of matching parts (may be empty)
    pub parts: Vec<DigiKeyPartInfo>,
    /// Total number of results found
    pub total_count: usize,
}

// ============================================================================
// Repo Endpoint Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct RepoCommitsRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitInfo {
    /// Full commit hash
    pub commit_hash: String,
    /// Timestamp of the commit
    pub commit_date: Option<DateTime<Utc>>,
    /// Commit message summary
    pub message: Option<String>,
    /// Whether this commit modified .kicad_sch files
    pub has_schematic_changes: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RepoCommitsResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// List of all commits (includes flag for schematic changes)
    pub commits: Vec<CommitInfo>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CommitFilesRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SchematicFile {
    /// File path relative to repository root
    pub path: String,
    /// Raw file content
    pub content: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitFilesResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of .kicad_sch files at this commit
    pub files: Vec<SchematicFile>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CommitInfoRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitInfoResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// Timestamp of the commit
    pub commit_date: Option<DateTime<Utc>>,
    /// Commit message summary
    pub message: Option<String>,
    /// Short AI-generated summary
    pub blurb: Option<String>,
    /// Detailed AI-generated description
    pub description: Option<String>,
    /// List of changed .kicad_sch file paths
    pub changed_files: Vec<String>,
}

// ============================================================================
// Hook Endpoint Types
// ============================================================================

#[derive(Debug, Serialize, ToSchema)]
pub struct HookUpdateResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Number of commits successfully processed
    pub processed: usize,
    /// List of errors encountered during processing
    pub errors: Vec<String>,
}

// ============================================================================
// Grok Endpoint Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokCommitSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokCommitSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokSelectionSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of component IDs to analyze
    pub component_ids: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokSelectionStreamRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of component IDs (references) to analyze
    pub component_ids: Vec<String>,
    /// User's query about the components
    pub query: String,
    /// Pre-distilled schematic data (optional - will fetch if not provided)
    pub distilled: Option<serde_json::Value>,
    /// Enable thinking/reasoning mode (shows chain-of-thought)
    #[serde(default)]
    pub thinking_mode: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokSelectionSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of component IDs that were analyzed
    pub component_ids: Vec<String>,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokRepoSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokRepoSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokObsoleteReplacementRequest {
    /// Manufacturer part number of the obsolete part
    pub manufacturer_part_number: String,
    /// Manufacturer name
    pub manufacturer: Option<String>,
    /// Part description
    pub description: Option<String>,
    /// Product category
    pub category: Option<String>,
    /// Datasheet URL (PDF link for Grok to analyze)
    pub datasheet_url: Option<String>,
    /// DigiKey product page URL
    pub product_url: Option<String>,
    /// Key parameters/specifications
    pub parameters: Vec<DigiKeyParameter>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokObsoleteReplacementResponse {
    /// The original obsolete part number
    pub original_part: String,
    /// AI-generated analysis and replacement recommendations
    pub analysis: String,
    /// Whether the search was successful
    pub success: bool,
    /// Error message if failed
    pub error: Option<String>,
}

// ============================================================================
// Distill Endpoint Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct DistillRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DistillResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// Whether the result was served from cache
    pub cached: bool,
    /// Distilled schematic data (JSON object with components, nets, proximities)
    pub distilled: serde_json::Value,
}

// ============================================================================
// Repo Initialization Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct RepoInitRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash (optional - uses latest if not provided)
    pub commit: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RepoInitResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash that was initialized
    pub commit: String,
    /// Whether the distilled data was already cached
    pub cached: bool,
    /// Number of components found in the schematic
    pub component_count: usize,
    /// Number of nets found in the schematic
    pub net_count: usize,
    /// List of schematic files found
    pub schematic_files: Vec<String>,
    /// Distilled schematic data
    pub distilled: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RepoClearCacheRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash (optional - clears all commits if not provided)
    pub commit: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RepoClearCacheResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Whether the cache was cleared
    pub cleared: bool,
    /// Message describing what was cleared
    pub message: String,
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    /// Error code
    pub error: String,
    /// Human-readable error message
    pub message: String,
}

impl ApiError {
    pub fn new(error: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message)
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new("bad_request", message)
    }
}
