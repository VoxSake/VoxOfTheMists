# VoxOfTheMists

VoxOfTheMists is a local full-stack analytics app for **Guild Wars 2 WvW kills tracking** (GW2Mists leaderboard data).

It snapshots leaderboard data into SQLite, then provides an interactive dashboard for:
- leaderboard tracking,
- progression analysis,
- account comparison,
- momentum/anomaly detection,
- and automated scheduled refresh.

## Tech Stack

- `scraper/`: Python 3.10+ (`requests`)
- `server.js`: Node.js 22+ + Fastify
- `data/vox.db`: SQLite (source of truth)
- `src/`: React + Vite + Chart.js

## Architecture

1. Scraper calls GW2Mists API and stores snapshot rows.
2. Backend serves validated/cached endpoints from SQLite.
3. Frontend reads `/api/*`, renders charts/tables, and supports exports/filters.
4. Optional hourly automation runs snapshots and invalidates API cache.
5. Optional Appwrite sync can import remote snapshots into local SQLite.

## Repository Layout

- `scraper/scrape_gw2mists.py`: data ingestion (manual or watch mode)
- `server.js`: API routes, caching, scheduled scraper, retention/vacuum maintenance
- `src/App.jsx`: dashboard logic, filters, charts, controls, exports
- `src/styles.css`: UI theme/style system
- `data/`: runtime DB and optional snapshot JSON backup

## Features

### Data ingestion

- Scrapes `Top 300` by default (`3 pages x 100`).
- Supports regions: `eu`, `na`.
- Persists snapshots in SQLite.
- Optional JSON backup export.

### Dashboard modules

- **Leaderboard**: latest ranking table with search + CSV export.
- **Top Movers**: diff between latest snapshot and immediately previous snapshot in the selected scope.
- **Anomaly Alerts**: highlights unusual latest delta vs recent baseline.
- **Top Progression**: multi-series time chart for latest top players.
- **Compare Accounts**: selected players with baseline modes:
  - `Raw`
  - `Delta from start`
  - `Indexed (100 at start)`

### Chart controls

- Select zoom drag
- Pan mode
- Wheel zoom toggle
- Presets + reset
- Brush (range sliders)
- PNG export

### UX filters

- Timezone selector (persisted)
- Theme toggle (persisted)
- `Hide anonymized` toggle (persisted, global)

### Automation & maintenance

- Auto-snapshot runs hourly.
- Snapshot status endpoint.
- Retention cleanup + optional SQLite vacuum.

## Installation

```bash
pip install -r requirements.txt
npm install
```

Create local env from template:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The server auto-loads `.env` at startup using `dotenv`.

## Run

### Development

```bash
npm run dev
```

- Frontend (Vite): `http://127.0.0.1:5173`
- API (Fastify): `http://127.0.0.1:3000`

### Production (local)

```bash
npm start
```

Open: `http://127.0.0.1:3000`

`npm start` automatically builds frontend first via `prestart`.

## Scraper (manual)

```bash
python scraper/scrape_gw2mists.py --pages 3 --per-page 100 --region eu --no-json
```

Common options:
- remove `--no-json` to write JSON backups,
- `--region na` for NA,
- `--db-path data/vox.db` to use another DB path.

## Environment Variables

All supported server variables are listed in `.env.example`.

- `PORT=3000`: API/web port
- `WRITE_API_TOKEN=`: required token for local write routes (`x-admin-token` header). If empty, server generates one at startup (recommended to set explicitly in `.env`)
- `TRUSTED_LOCAL_ORIGINS=http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173`: allowed browser Origin/Referer for local write/read protected routes
- `AUTO_SCRAPE=1`: enable hourly auto-snapshot (`0` disables)
- `PYTHON_CMD=python`: python executable used by server snapshot process
- `APPWRITE_SYNC_ENABLED=0`: enable Appwrite -> local SQLite sync (`1` enables)
- `APPWRITE_ENDPOINT=https://cloud.appwrite.io`: your Appwrite endpoint
- `APPWRITE_PROJECT_ID=`: Appwrite project id
- `APPWRITE_API_KEY=`: Appwrite server API key
- `APPWRITE_DATABASE_ID=`: Appwrite database id
- `APPWRITE_SNAPSHOTS_COLLECTION_ID=`: collection for snapshot metadata
- `APPWRITE_ENTRIES_COLLECTION_ID=`: collection for snapshot rows
- `APPWRITE_SYNC_INTERVAL_MINUTES=60`: local pull interval (used if hourly aligned sync is disabled)
- `APPWRITE_SYNC_HOURLY_ALIGNED=1`: run one sync per hour aligned to a fixed UTC minute
- `APPWRITE_SYNC_TARGET_MINUTE=12`: UTC minute used by aligned hourly sync
- `APPWRITE_SYNC_ENTRY_BATCH_SIZE=20`: snapshot IDs grouped per entries fetch during Appwrite import
- `APPWRITE_BACKFILL_ENABLED=0`: optional server-side function trigger guard (disabled by default)
- `APPWRITE_BACKFILL_TARGET_MINUTE=30`: UTC minute used by backfill guard
- `APPWRITE_FUNCTION_ID=`: Appwrite Function ID used by backfill guard execution
- `API_CACHE_MAX_ENTRIES=1000`: max in-memory API cache entries before pruning
- `RETENTION_DAYS=0`: keep all snapshots forever (`>0` enables age-based cleanup)
- `AUTO_VACUUM=1`: enable SQLite vacuum flow (`0` disables)
- `VACUUM_MIN_HOURS=24`: minimum delay between vacuum runs

Share/Webhook notes:
- Discord webhook URLs are only used at request time via local write endpoint relay (`POST /api/share/discord`).
- The webhook URL is not persisted in server env; client-side persistence is browser-local.
- Share relay routes remain protected by loopback + trusted origin + `x-admin-token`.

## Appwrite Setup (Optional)

Use this mode if you want hourly snapshots to continue while your local machine is offline.

### How it works

1. Appwrite Function runs hourly and writes snapshots to Appwrite.
2. Local server sync pulls Appwrite snapshots into local SQLite.
3. Dashboard keeps using local SQLite for analytics/charts.

### 1) Create Appwrite database and collections

Create one database with:

- Collection `snapshots`
  - `snapshotId` (string, indexed)
  - `createdAt` (string, indexed)
  - `source` (string)
  - `region` (string)
  - `pages` (integer)
  - `perPage` (integer)
  - `totalAvailable` (integer)
  - `count` (integer)

- Collection `entries`
  - `snapshotId` (string, indexed)
  - `rank` (integer, indexed)
  - `accountName` (string, indexed)
  - `weeklyKills` (integer)
  - `totalKills` (integer)
  - `wvwGuildName` (string, optional)
  - `wvwGuildTag` (string, optional, indexed)
  - `allianceGuildName` (string, optional)
  - `allianceGuildTag` (string, optional, indexed)

### 2) Configure local server sync (`.env`)

Set local env vars:

```env
APPWRITE_SYNC_ENABLED=1
APPWRITE_ENDPOINT=
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=
APPWRITE_SNAPSHOTS_COLLECTION_ID=
APPWRITE_ENTRIES_COLLECTION_ID=
APPWRITE_SYNC_INTERVAL_MINUTES=60
APPWRITE_SYNC_HOURLY_ALIGNED=1
APPWRITE_SYNC_TARGET_MINUTE=12
APPWRITE_SYNC_ENTRY_BATCH_SIZE=20
API_CACHE_MAX_ENTRIES=1000
```

Notes:
- Local scraping is automatically disabled when `APPWRITE_SYNC_ENABLED=1`.
- Keep `APPWRITE_SYNC_HOURLY_ALIGNED=1` to minimize Appwrite requests.
- In this mode, local `POST /api/snapshot/run` is intentionally blocked.
- Optional: `POST /api/sync/run` (loopback only) can trigger an immediate Appwrite pull.
- In Appwrite mode, manual snapshot actions are disabled in the UI.

### 3) Configure Appwrite Function env

Use `appwrite-function.env.example` as template. Function variables:

```env
APPWRITE_ENDPOINT=
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=
APPWRITE_SNAPSHOTS_COLLECTION_ID=
APPWRITE_ENTRIES_COLLECTION_ID=
GW2MISTS_REGION=eu
GW2MISTS_PAGES=3
GW2MISTS_PER_PAGE=100
DEDUPE_HOURLY=1
SNAPSHOT_TIMEZONE=UTC
RESET_POLICY_ENABLED=0
RESET_WEEKDAY=4
RESET_HOUR_LOCAL=19
PRE_RESET_OFFSET_MINUTES=15
PRE_RESET_WINDOW_START_MINUTES=20
POST_RESET_SKIP_HOURS=2
MANUAL_OVERRIDE_TOKEN=
APPWRITE_WRITE_CONCURRENCY=6
```

Recommended:
- Schedule: `*/15 * * * *` (function checks hourly slot and only writes if missing)
- Runtime: Python 3.12
- Function timeout: 120s
- Execute access: no public role

Optional GW2 reset policy (recommended for EU reset behavior):
- `SNAPSHOT_TIMEZONE=Europe/Brussels`
- `RESET_POLICY_ENABLED=1`
- `RESET_WEEKDAY=4`
- `RESET_HOUR_LOCAL=19`
- `PRE_RESET_OFFSET_MINUTES=15` (captures `18:45`)
- `PRE_RESET_WINDOW_START_MINUTES=20` (runs from `18:40`..`18:59` map to `18:45`)
- `POST_RESET_SKIP_HOURS=2` (skips `19:00` and `20:00`, resumes `21:00`)

Manual one-off override (without changing function env flags):
- Set `MANUAL_OVERRIDE_TOKEN` in function variables.
- Trigger execution with a payload body like:

```json
{
  "overrideToken": "your-secret-token",
  "forceBypassDedupe": false,
  "forceCaptureTimeUtc": "2026-02-18T17:00:00+00:00"
}
```

`forceCaptureTimeUtc` is optional; if set, that exact UTC slot is used for the run.

Before deploying the updated function, run the one-time Appwrite entries schema migration:

```bash
python appwrite-function/migrate_entries_schema.py
```

Notes:
- Script uses `APPWRITE_*` env vars and updates the `entries` collection only.
- In GW2Mists payload mapping, `selectedGuild*` is stored as `wvwGuild*`, and `guild*` is stored as `allianceGuild*`.

## Backup and Restore (SQLite)

Create backup:

```bash
mkdir -p backups
cp data/vox.db backups/vox-$(date +%Y%m%d-%H%M%S).db
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
Copy-Item data/vox.db ("backups/vox-{0}.db" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
```

Restore backup:

1. Stop server process.
2. Replace `data/vox.db` with your backup file.
3. Start server again (`npm start` or `npm run dev`).

### 4) Validate

1. Run one manual Function execution in Appwrite.
2. Restart local server.
3. Check `GET /api/health`:
   - `appwriteSyncEnabled: true`
   - `appwriteSyncConfigured: true`
   - `appwriteSync.lastError: null`

### Security

- Never commit real keys in `.env`, README, or templates.
- Rotate keys immediately if they were ever shared.

## Weekly Window Logic

For `scope=week`, data is filtered to GW2 reset week:
- Start: Friday `19:00` (`Europe/Brussels`)
- End: next Friday `19:00` (`Europe/Brussels`)

## API Reference

### Core

- `GET /api/latest?top=100`
- `GET /api/snapshots`
- `GET /api/accounts?query=...&limit=...`
- `GET /api/player/:account/history`

### Charts

- `GET /api/progression/top?top=10&scope=week|all&days=30`
- `GET /api/compare?accounts=A,B&scope=week|all&days=30`

Notes:
- `days` is optional and used to keep all-time queries fast.
- UI defaults to `Current Week` for speed.

### Insights

- `GET /api/leaderboard/delta?top=30&metric=weeklyKills|totalKills&scope=week|all`
- `GET /api/anomalies?top=20&minDeltaAbs=80&lookbackHours=72&scope=week|all`
- `GET /api/reset-impact?top=20&windowHours=1..24`
- `GET /api/consistency?top=20&scope=week|all&days=30`
- `GET /api/watchlist?accounts=A,B&minGain=30&minRankUp=3&scope=week|all`
- `GET /api/report/weekly`

### Operations

- `GET /api/snapshot/status`
- `POST /api/snapshot/run` (loopback only)
- `POST /api/sync/run` (loopback only, Appwrite mode)
- `GET /api/health`
- `POST /api/maintenance/run` (loopback only)

## Caching Strategy

In-memory cache with in-flight deduplication for read-heavy routes:
- `/api/snapshots`
- `/api/latest`
- `/api/progression/top`
- `/api/compare`
- `/api/accounts`
- plus analytics routes (`delta`, `anomalies`, report)

Cache invalidates after successful snapshot and maintenance cleanup.

## Security Notes

- Fastify schema validation on endpoints.
- Helmet headers + CSP.
- Snapshot/maintenance write endpoints restricted to loopback IP.
- Prepared SQL statements.
- Input sanitization for account names.

## Quick Changelog

### 2026-02

- Added chart zoom/pan/brush controls and PNG export.
- Added Top Movers + Anomaly Alerts modules.
- Added weekly analytics report API.
- Added CSV exports.
- Added global `Hide anonymized` filter (persisted).
- Added all-time dynamic range loading (`30d/90d/full`) for faster defaults.
- Added retention + vacuum maintenance flow.
- Improved auto-refresh behavior after hourly snapshots.
- Refined dark-mode contrast and top stat cards (including week-reset countdown).

## Troubleshooting

- **`GET /` not found in production**:
  - run `npm start` (includes build) or `npm run build` then start.

- **Snapshots not updating UI**:
  - check `GET /api/snapshot/status` and `GET /api/snapshots`.

- **Server snapshot fails**:
  - ensure Python exists in PATH or set `PYTHON_CMD`.

- **Discord share/test fails**:
  - verify webhook URL format (`https://discord.com/api/webhooks/...`),
  - verify local write auth (`x-admin-token`) and trusted local origin,
  - inspect server logs for `/api/share/discord` or `/api/share/discord/test` status details.

## Startup and Restart Checklist

1. Confirm Node runtime: `node -v` (required: Node `22+`, see `.nvmrc`).
2. Verify `WRITE_API_TOKEN` exists in `.env`.
3. Start server: `npm start` (prod local) or `npm run dev`.
4. Validate health: `GET /api/health`.
5. If Appwrite sync mode is enabled, confirm `appwriteSync.lastError` is `null` and next run is scheduled.

## Useful Commands

```bash
npm run dev
npm run build
npm start
npm audit
python scraper/scrape_gw2mists.py --pages 3 --per-page 100 --region eu --no-json
```

## License

MIT
