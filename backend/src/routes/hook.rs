use axum::{routing::post, Router};
use std::sync::Arc;

use crate::controllers::hook::{github_webhook, refresh_repo, update_repo, AppState};

pub fn router() -> Router<Arc<sqlx::PgPool>> {
    Router::new()
        .route("/update/*repo", post(update_repo))
        .route("/refresh/*repo", post(refresh_repo))
        .route("/github/*repo", post(github_webhook))
}
