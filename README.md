# GroKi

AI-powered KiCad understanding for humans. GroKi distills complex schematics into structured data, streams AI explanations, and tracks changes across hardware repos so other engineers, reviewers, and stakeholders (not just EEs) can see what changed, why, and where to look next. Try it out at https://grokicad.com.

## Why
Most people looking at schematics aren’t the original EE, and they need clarity more than another AI authoring tool. Netlists are hard to read, version-control diffing is clunky, and AI tools rarely speak KiCad. GroKi bridges that gap for reviewers, systems engineers, firmware teams, and judges: it parses KiCad projects, summarizes commits and selections with Grok, searches parts, and serves an interactive viewer workflow.

## Key Features
- **Schematic distillation**: Python distiller (`schematic-distiller/`, powered by `kicad-sch-api`) converts `.kicad_sch` into normalized JSON (components, nets, proximities) with cacheable results.
- **Repo + commit intelligence**: Rust backend (`backend/`, Axum + utoipa) initializes repos, lists schematic commits/files, and surfaces commit metadata plus cached distillations.
- **AI assistance (Grok)**:
  - Commit, selection, and repo summaries (`/api/grok/*`)
  - Streaming SSE analysis for selected components with semantic context
  - Obsolete-part replacement suggestions
- **Distill-on-demand API**: `/api/distill` runs or returns cached distillations; `/api/repo/init` primes a repo and reports component/net counts.
- **Part search**: DigiKey keyword/MPN lookup with graceful fallback when not configured.
- **Viewer-friendly data**: Works with `kicanvas/` (TypeScript/WebGL KiCad viewer) and includes ready-made KiCad samples for demos.
- **Example repos**: Use the provided KiCad projects for instant demos:
  - uBMS-2 battery management system: https://github.com/CwbhX/uBMS-2
  - Grok KiCad Watch: https://github.com/CwbhX/GrokKiCADWatch

## Architecture (high level)
- **schematic-distiller/**: Python package + docs; uses `kicad-sch-api` for lossless parsing, connectivity, hierarchy, BOM properties, and MCP tooling.
- **backend/**: Rust Axum service exposing REST + Swagger UI, SSE endpoints, Grok integrations, DigiKey client, and git helpers.
- **database/**: PostgreSQL (Docker) plus Rust `kicad-db` crate for storing distilled JSON, schematic blurbs/overviews, and part metadata.
- **kicanvas/**: Browser-based KiCad viewer (TypeScript/WebGL). Ships with a static debug viewer and docs for embedding.
- **kicad-example-files/**: Curated KiCad projects (includes uBMS-2 and SmartWatch) for quick demonstrations.
- **grokprompts/**: System prompt used by Grok selection summaries.

## Quickstart (judge-friendly)
Prereqs: Docker (for Postgres), Rust toolchain, Python 3.10+, Node (only if you want to rebuild KiCanvas), env var `XAI_API_KEY` for Grok, optional `DIGIKEY_CLIENT_ID/SECRET`.

1) Start the database  
```bash
cd database
chmod +x *.sh
./database-up.sh
```

2) Run the backend (Swagger served at `/swagger-ui`)  
```bash
cd backend
cargo run
# Server on :8080 by default
```

3) Initialize a repo and distill schematics (example: uBMS-2)  
```bash
curl -X POST http://localhost:8080/api/repo/init \
  -H "Content-Type: application/json" \
  -d '{"repo":"CwbhX/uBMS-2"}'
# Response includes component/net counts, schematic file list, and distilled JSON (cached afterward)
```

4) Get commit file list or info  
```bash
curl -X POST http://localhost:8080/api/repo/commit/files \
  -H "Content-Type: application/json" \
  -d '{"repo":"CwbhX/uBMS-2","commit":"<hash>"}'
```

5) Ask Grok for a selection summary (streaming SSE)  
```bash
curl -N -X POST http://localhost:8080/api/grok/selection/stream \
  -H "Content-Type: application/json" \
  -d '{
        "repo":"CwbhX/uBMS-2",
        "commit":"<hash>",
        "component_ids":["U1","R3","C5"],
        "query":"Explain what these parts do together.",
        "thinking_mode":false
      }'
```

6) Try DigiKey search (optional)  
```bash
curl -X POST http://localhost:8080/api/digikey/search \
  -H "Content-Type: application/json" \
  -d '{"query":"ESP32-WROOM"}'
```

7) View data in Swagger UI  
Open `http://localhost:8080/swagger-ui/` to exercise all endpoints.

## Demo scripts & viewer notes
- Use `kicad-example-files/BMS` for uBMS-2 and `kicad-example-files/Smart Watch` for the watch project—both mirror the example repos above.
- `kicanvas/debug/index.html` (or `schematic.html`) can be used to point at distilled outputs or KiCad files if you want an in-browser viewer during judging.

## Developer guide (quick map)
- `backend/src/controllers/…`: Route handlers for repo, distill, grok (AI summaries + SSE), hook (webhooks/refresh), digikey.  
- `backend/src/services/…`: Git helpers, distill runner, DigiKey client.  
- `backend/src/openapi.rs`: Swagger/OpenAPI registration.  
- `database/src`: `kicad-db` crate and scripts to manage Postgres.  
- `schematic-distiller/docs`: Deep docs: getting started, API reference, hierarchy, MCP setup, known limitations.  
- `kicanvas/src`: TypeScript viewer core; `docs/` covers embedding and dev setup.  
- `grokprompts/`: System prompt text used by Grok selection streaming.

## Tips for demos
- **Cache wins**: `/api/repo/init` and `/api/distill` cache distilled JSON in Postgres; repeat calls are instant.  
- **Selections**: Provide explicit `component_ids` to `/api/grok/selection/stream` for tighter answers.  
- **Fallbacks**: If DigiKey creds are missing, the API responds with a clear “not configured” message.  
- **Rate limits**: Grok endpoints call external APIs; if rate-limited, re-run after a short pause.

## Requirements & assumptions
- KiCad 6/7/8 schematics are supported (KiCanvas is v6+; custom fonts in v7 may have gaps).  
- Postgres must be running for caching and part storage.  
- `XAI_API_KEY` required for Grok endpoints; without it, only non-AI paths (distill, repo metadata) will function.  
- Docker scripts reset data when recreating the DB container.

## Known limitations
- Advanced ERC and full global-label connectivity are partial in the underlying parser (see `schematic-distiller/docs/KNOWN_LIMITATIONS.md`).  
- Some Grok endpoints still return placeholder text when external services are unavailable.  
- Viewer: KiCad 5 files are unsupported; best on Chrome/Firefox/Safari desktop.

## Acknowledgments
- Built on `kicad-sch-api`, KiCanvas, Axum, sqlx, and Grok APIs.  
- Example hardware from uBMS-2 and Grok KiCad Watch repos cited above.  
- Created for hackathon judging—fast setup, clear outputs, and transparent architecture.

## Creators
- Clement Hathaway
- Ernest Yeung
- Evan Hekman
- Julian Carrier

