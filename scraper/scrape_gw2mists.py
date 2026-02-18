#!/usr/bin/env python3
import argparse
import json
import random
import sqlite3
import string
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

API_BASE = "https://api.gw2mists.com"
ENDPOINT = f"{API_BASE}/leaderboard/player/v4"
SITE_URL = "https://gw2mists.com/leaderboards/player?nr=1&c=100"


def make_key() -> str:
    now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    left = "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
    right = "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"{now_ms}-{left}-guenther-{right}"


def region_to_id(region: str) -> int:
    mapping = {"na": 1, "eu": 2}
    if region not in mapping:
        raise ValueError(f"Unsupported region: {region}")
    return mapping[region]


def normalize_optional_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def fetch_page(session: requests.Session, region_id: int, page: int, per_page: int) -> dict:
    headers = {
        "x-gw2mists-key": make_key(),
        "Origin": "https://gw2mists.com",
        "Referer": SITE_URL,
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/json",
    }
    payload = {
        "region": region_id,
        "filter": {"stat": "kills", "teams": [], "search": "", "ownAccount": 0},
        "sort": 0,
        "sortDir": 0,
        "page": page,
        "perPage": per_page,
    }
    response = session.post(ENDPOINT, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def scrape(pages: int, per_page: int, region: str) -> dict:
    region_id = region_to_id(region)
    created_at = datetime.now(tz=timezone.utc).isoformat()
    entries = []
    total = None

    with requests.Session() as session:
        for page in range(1, pages + 1):
            data = fetch_page(session, region_id, page, per_page)
            if total is None:
                total = int(data.get("total", 0))

            for index, item in enumerate(data.get("data", []), start=1):
                rank = (page - 1) * per_page + index
                entries.append(
                    {
                        "rank": rank,
                        "accountName": item.get("accountName", ""),
                        "weeklyKills": int(item.get("kills", 0)),
                        "totalKills": int(item.get("maxKills", 0)),
                        # Mapping validated with in-game semantics:
                        # - selectedGuild*: active WvW guild
                        # - guild*: alliance guild
                        "wvwGuildName": normalize_optional_text(item.get("selectedGuildName")),
                        "wvwGuildTag": normalize_optional_text(item.get("selectedGuildTag")),
                        "allianceGuildName": normalize_optional_text(item.get("guildName")),
                        "allianceGuildTag": normalize_optional_text(item.get("guildTag")),
                    }
                )

    return {
        "snapshotId": created_at.replace(":", "-"),
        "createdAt": created_at,
        "source": SITE_URL,
        "region": region,
        "pages": pages,
        "perPage": per_page,
        "totalAvailable": total or 0,
        "count": len(entries),
        "entries": entries,
    }


def save_snapshot_json(snapshot: dict, base_dir: Path) -> None:
    snapshots_dir = base_dir / "data" / "snapshots"
    snapshots_dir.mkdir(parents=True, exist_ok=True)

    snapshot_file = snapshots_dir / f"{snapshot['snapshotId']}.json"
    snapshot_file.write_text(json.dumps(snapshot, ensure_ascii=True, indent=2), encoding="utf-8")

    index_file = snapshots_dir / "index.json"
    if index_file.exists():
        index_data = json.loads(index_file.read_text(encoding="utf-8"))
    else:
        index_data = {"snapshots": []}

    index_data["snapshots"] = [
        s for s in index_data.get("snapshots", []) if s.get("snapshotId") != snapshot["snapshotId"]
    ]
    index_data["snapshots"].append(
        {
            "snapshotId": snapshot["snapshotId"],
            "createdAt": snapshot["createdAt"],
            "region": snapshot["region"],
            "count": snapshot["count"],
        }
    )
    index_data["snapshots"].sort(key=lambda s: s["createdAt"])
    index_file.write_text(json.dumps(index_data, ensure_ascii=True, indent=2), encoding="utf-8")


def ensure_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            snapshot_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL,
            region TEXT NOT NULL,
            pages INTEGER NOT NULL,
            per_page INTEGER NOT NULL,
            total_available INTEGER NOT NULL,
            count INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS snapshot_entries (
            snapshot_id TEXT NOT NULL,
            rank INTEGER NOT NULL,
            account_name TEXT NOT NULL,
            weekly_kills INTEGER NOT NULL,
            total_kills INTEGER NOT NULL,
            wvw_guild_name TEXT,
            wvw_guild_tag TEXT,
            alliance_guild_name TEXT,
            alliance_guild_tag TEXT,
            PRIMARY KEY (snapshot_id, rank),
            FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) ON DELETE CASCADE
        )
        """
    )
    current_columns = {row[1] for row in conn.execute("PRAGMA table_info(snapshot_entries)").fetchall()}
    for col_name in ("wvw_guild_name", "wvw_guild_tag", "alliance_guild_name", "alliance_guild_tag"):
        if col_name not in current_columns:
            conn.execute(f"ALTER TABLE snapshot_entries ADD COLUMN {col_name} TEXT")
    # Transition from previous temporary naming/mapping:
    # old guild_* actually represented allianceGuild*
    # old alliance_* actually represented wvwGuild*
    if "guild_name" in current_columns:
        conn.execute(
            "UPDATE snapshot_entries SET alliance_guild_name = COALESCE(alliance_guild_name, guild_name)"
        )
    if "guild_tag" in current_columns:
        conn.execute(
            "UPDATE snapshot_entries SET alliance_guild_tag = COALESCE(alliance_guild_tag, guild_tag)"
        )
    if "alliance_name" in current_columns:
        conn.execute(
            "UPDATE snapshot_entries SET wvw_guild_name = COALESCE(wvw_guild_name, alliance_name)"
        )
    if "alliance_tag" in current_columns:
        conn.execute(
            "UPDATE snapshot_entries SET wvw_guild_tag = COALESCE(wvw_guild_tag, alliance_tag)"
        )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_snapshot_entries_account_name
        ON snapshot_entries(account_name COLLATE NOCASE)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_snapshot_entries_wvw_guild_tag
        ON snapshot_entries(wvw_guild_tag COLLATE NOCASE)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_snapshot_entries_alliance_guild_tag
        ON snapshot_entries(alliance_guild_tag COLLATE NOCASE)
        """
    )
    conn.commit()


def save_snapshot_sqlite(snapshot: dict, db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        ensure_db(conn)
        conn.execute(
            """
            INSERT OR REPLACE INTO snapshots
            (snapshot_id, created_at, source, region, pages, per_page, total_available, count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot["snapshotId"],
                snapshot["createdAt"],
                snapshot["source"],
                snapshot["region"],
                int(snapshot["pages"]),
                int(snapshot["perPage"]),
                int(snapshot["totalAvailable"]),
                int(snapshot["count"]),
            ),
        )
        conn.execute("DELETE FROM snapshot_entries WHERE snapshot_id = ?", (snapshot["snapshotId"],))
        conn.executemany(
            """
            INSERT INTO snapshot_entries
            (snapshot_id, rank, account_name, weekly_kills, total_kills, wvw_guild_name, wvw_guild_tag, alliance_guild_name, alliance_guild_tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    snapshot["snapshotId"],
                    int(e["rank"]),
                    str(e["accountName"]),
                    int(e["weeklyKills"]),
                    int(e["totalKills"]),
                    normalize_optional_text(e.get("wvwGuildName")),
                    normalize_optional_text(e.get("wvwGuildTag")),
                    normalize_optional_text(e.get("allianceGuildName")),
                    normalize_optional_text(e.get("allianceGuildTag")),
                )
                for e in snapshot.get("entries", [])
            ],
        )
        conn.commit()
    finally:
        conn.close()


def migrate_existing_json_snapshots(base_dir: Path, db_path: Path) -> None:
    snapshots_dir = base_dir / "data" / "snapshots"
    if not snapshots_dir.exists():
        return
    for file in snapshots_dir.glob("*.json"):
        if file.name == "index.json":
            continue
        try:
            snap = json.loads(file.read_text(encoding="utf-8"))
            if "snapshotId" not in snap or "entries" not in snap:
                continue
            save_snapshot_sqlite(snap, db_path)
        except Exception:
            continue


def run_once(args, root_dir: Path) -> None:
    snapshot = scrape(pages=args.pages, per_page=args.per_page, region=args.region)
    db_path = (root_dir / args.db_path).resolve()
    migrate_existing_json_snapshots(root_dir, db_path)
    save_snapshot_sqlite(snapshot, db_path)
    if not args.no_json:
        save_snapshot_json(snapshot, base_dir=root_dir)
    print(
        f"Saved snapshot {snapshot['snapshotId']} with {snapshot['count']} rows "
        f"(region={snapshot['region']}, totalAvailable={snapshot['totalAvailable']}, db={db_path})."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape GW2Mists player leaderboard snapshots.")
    parser.add_argument("--pages", type=int, default=3, help="Number of pages to scrape.")
    parser.add_argument("--per-page", type=int, default=100, help="Rows per page.")
    parser.add_argument("--region", type=str, default="eu", choices=["eu", "na"], help="Leaderboard region.")
    parser.add_argument("--db-path", type=str, default="data/vox.db", help="SQLite path relative to repo root.")
    parser.add_argument("--watch", action="store_true", help="Run continuously and take periodic snapshots.")
    parser.add_argument(
        "--interval-minutes",
        type=float,
        default=30.0,
        help="Interval between snapshots when --watch is enabled.",
    )
    parser.add_argument("--no-json", action="store_true", help="Do not persist JSON snapshots.")
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent.parent
    if args.watch:
        interval = max(1.0, float(args.interval_minutes)) * 60.0
        while True:
            try:
                run_once(args, root_dir)
            except Exception as exc:
                print(f"Snapshot failed: {exc}")
            time.sleep(interval)
    else:
        run_once(args, root_dir)


if __name__ == "__main__":
    main()
