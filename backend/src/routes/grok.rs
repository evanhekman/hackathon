use axum::{routing::{get, post}, Router};
use std::sync::Arc;

use crate::controllers::grok::{chat_stream, summarize_commit, summarize_repo, summarize_selection};

pub fn router() -> Router<Arc<sqlx::PgPool>> {
    Router::new()
        .route("/summary/commit", post(summarize_commit))
        .route("/summary/selection", post(summarize_selection))
        .route("/summary/repo", post(summarize_repo))
        .route("/chat/stream", get(chat_stream))
}
