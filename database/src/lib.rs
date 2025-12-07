use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row, Error};
use serde_json::Value;
use std::collections::HashMap;

pub mod utilities;

pub const DB_URL: &str = "postgres://kicad:password@localhost:5432/kicad";

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Schematic {
    pub id: i32,
    pub repo_url: String,
    pub commit_hash: String,
    pub schematic_image: Option<Vec<u8>>,
    pub change_summary: Option<String>,
    pub project_overview: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct Part {
    pub id: i32,
    pub schematic_id: i32,
    pub part_uuid: Uuid,
    pub blurb: Option<String>,
    pub properties: Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FullSchematic {
    pub repo_url: String,
    pub commit_hash: String,
    pub schematic_image: Option<Vec<u8>>,
    pub change_summary: Option<String>,
    pub project_overview: Option<String>,
    pub created_at: DateTime<Utc>,
    pub parts: HashMap<Uuid, FullPart>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub struct FullPart {
    pub part_uuid: Uuid,
    pub blurb: Option<String>,
    pub properties: Value,
}

pub async fn create_pool() -> Result<PgPool, Error> {
    PgPool::connect(DB_URL).await
}

pub async fn store_schematic(
    pool: &PgPool,
    repo_url: &str,
    commit_hash: &str,
    schematic_image: Option<Vec<u8>>,
    change_summary: Option<&str>,
    project_overview: Option<&str>,
    parts: HashMap<Uuid, (Option<String>, Value)>,  // part_uuid -> (blurb, properties)
) -> Result<i32, Error> {
    let mut tx = pool.begin().await?;

    // Upsert schematic
    let schematic_id = sqlx::query_as::<_, Schematic>(
        r#"
        INSERT INTO schematics (repo_url, commit_hash, schematic_image, change_summary, project_overview)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (repo_url, commit_hash) DO UPDATE SET
            schematic_image = EXCLUDED.schematic_image,
            change_summary = EXCLUDED.change_summary,
            project_overview = EXCLUDED.project_overview
        RETURNING id
        "#
    )
    .bind(repo_url)
    .bind(commit_hash)
    .bind(schematic_image)
    .bind(change_summary)
    .bind(project_overview)
    .fetch_one(&mut *tx)
    .await?
    .id;

    // Upsert parts
    for (part_uuid, (blurb, properties)) in parts {
        sqlx::query(
            r#"
            INSERT INTO parts (schematic_id, part_uuid, blurb, properties)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (schematic_id, part_uuid) DO UPDATE SET
                blurb = EXCLUDED.blurb,
                properties = EXCLUDED.properties
            "#
        )
        .bind(schematic_id)
        .bind(part_uuid)
        .bind(blurb)
        .bind(&properties)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(schematic_id)
}

pub async fn retrieve_schematic(
    pool: &PgPool,
    repo_url: &str,
    commit_hash: &str,
) -> Result<Option<FullSchematic>, Error> {
    let schematic = sqlx::query_as::<_, Schematic>(
        "SELECT * FROM schematics WHERE repo_url = $1 AND commit_hash = $2"
    )
    .bind(repo_url)
    .bind(commit_hash)
    .fetch_optional(pool)
    .await?;

    let Some(sch) = schematic else { return Ok(None); };

    let mut parts_map: HashMap<Uuid, FullPart> = HashMap::new();
    let rows = sqlx::query_as::<_, FullPart>(
        "SELECT part_uuid, blurb, properties FROM parts WHERE schematic_id = $1"
    )
    .bind(sch.id)
    .fetch_all(pool)
    .await?;

    for part in rows {
        parts_map.insert(part.part_uuid, part);
    }

    Ok(Some(FullSchematic {
        repo_url: sch.repo_url,
        commit_hash: sch.commit_hash,
        schematic_image: sch.schematic_image,
        change_summary: sch.change_summary,
        project_overview: sch.project_overview,
        created_at: sch.created_at,
        parts: parts_map,
    }))
}

// Additional query: e.g., get schematics by part_uuid across commits
pub async fn find_schematics_by_part(
    pool: &PgPool,
    part_uuid: Uuid,
) -> Result<Vec<(String, String)>, Error> {  // (repo_url, commit_hash)
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT s.repo_url, s.commit_hash
        FROM schematics s
        JOIN parts p ON s.id = p.schematic_id
        WHERE p.part_uuid = $1
        "#
    )
    .bind(part_uuid)
    .fetch_all(pool)
    .await?;

    let mut results = Vec::new();
    for row in rows {
        let repo: String = row.try_get("repo_url")?;
        let commit: String = row.try_get("commit_hash")?;
        results.push((repo, commit));
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_struct_serde() {
        let part = Part {
            id: 1,
            schematic_id: 1,
            part_uuid: Uuid::new_v4(),
            blurb: Some("test".to_string()),
            properties: serde_json::json!({ "ref": "U1" }),
        };
        let json = serde_json::to_string(&part).unwrap();
        let de: Part = serde_json::from_str(&json).unwrap();
        assert_eq!(part.blurb, de.blurb);
    }

    // More unit tests for validation, etc.
}

// Note: Integration tests in tests/ dir, assuming DB running, e.g., cargo test --test integration