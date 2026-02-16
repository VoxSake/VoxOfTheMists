#!/usr/bin/env python3
import json
import os
import random
import string
from datetime import datetime, timezone

import requests

API_BASE = "https://api.gw2mists.com"
ENDPOINT = f"{API_BASE}/leaderboard/player/v4"
SITE_URL = "https://gw2mists.com/leaderboards/player?nr=1&c=100"


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default)).strip()


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
    now_utc = datetime.now(tz=timezone.utc)
    hour_utc = now_utc.replace(minute=0, second=0, microsecond=0)
    created_at = hour_utc.isoformat()
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


class AppwriteClient:
    def __init__(self) -> None:
        self.endpoint = env("APPWRITE_ENDPOINT", "https://cloud.appwrite.io").rstrip("/")
        self.project_id = env("APPWRITE_PROJECT_ID")
        self.api_key = env("APPWRITE_API_KEY")
        self.database_id = env("APPWRITE_DATABASE_ID")
        self.snapshots_collection_id = env("APPWRITE_SNAPSHOTS_COLLECTION_ID", "snapshots")
        self.entries_collection_id = env("APPWRITE_ENTRIES_COLLECTION_ID", "entries")
        missing = [
            name
            for name, value in [
                ("APPWRITE_ENDPOINT", self.endpoint),
                ("APPWRITE_PROJECT_ID", self.project_id),
                ("APPWRITE_API_KEY", self.api_key),
                ("APPWRITE_DATABASE_ID", self.database_id),
                ("APPWRITE_SNAPSHOTS_COLLECTION_ID", self.snapshots_collection_id),
                ("APPWRITE_ENTRIES_COLLECTION_ID", self.entries_collection_id),
            ]
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing env vars: {', '.join(missing)}")

    @property
    def headers(self) -> dict:
        return {
            "X-Appwrite-Project": self.project_id,
            "X-Appwrite-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def _documents_url(self, collection_id: str) -> str:
        return (
            f"{self.endpoint}/v1/databases/{self.database_id}"
            f"/collections/{collection_id}/documents"
        )

    def list_documents(self, collection_id: str, queries: list[str]) -> list[dict]:
        url = self._documents_url(collection_id)
        # Appwrite Cloud endpoint in this project expects repeated `query` params.
        resp = requests.get(url, headers=self.headers, params=[("query", q) for q in queries], timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Appwrite list failed {resp.status_code}: {resp.text}")
        body = resp.json()
        return body.get("documents", []) or []

    def create_document(self, collection_id: str, data: dict) -> dict:
        url = self._documents_url(collection_id)
        payload = {"documentId": "unique()", "data": data}
        resp = requests.post(url, headers=self.headers, data=json.dumps(payload), timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Appwrite create failed {resp.status_code}: {resp.text}")
        return resp.json()


def snapshot_exists_for_hour(appwrite: AppwriteClient, snapshot_id: str) -> bool:
    # Appwrite query grammar can differ by project/runtime version.
    # For reliability, fetch snapshot docs and compare IDs client-side.
    rows = appwrite.list_documents(appwrite.snapshots_collection_id, [])
    return any(str(row.get("snapshotId", "")).strip() == snapshot_id for row in rows)


def write_snapshot(appwrite: AppwriteClient, snapshot: dict) -> dict:
    snapshot_meta = {
        "snapshotId": snapshot["snapshotId"],
        "createdAt": snapshot["createdAt"],
        "source": snapshot["source"],
        "region": snapshot["region"],
        "pages": int(snapshot["pages"]),
        "perPage": int(snapshot["perPage"]),
        "totalAvailable": int(snapshot["totalAvailable"]),
        "count": int(snapshot["count"]),
    }
    appwrite.create_document(appwrite.snapshots_collection_id, snapshot_meta)

    inserted = 0
    for row in snapshot["entries"]:
        entry = {
            "snapshotId": snapshot["snapshotId"],
            "rank": int(row["rank"]),
            "accountName": str(row["accountName"]),
            "weeklyKills": int(row["weeklyKills"]),
            "totalKills": int(row["totalKills"]),
        }
        appwrite.create_document(appwrite.entries_collection_id, entry)
        inserted += 1
    return {"snapshotInserted": 1, "entriesInserted": inserted}


def run() -> dict:
    pages = max(1, int(env("GW2MISTS_PAGES", "3")))
    per_page = max(1, int(env("GW2MISTS_PER_PAGE", "100")))
    region = env("GW2MISTS_REGION", "eu").lower()
    dedupe_hourly = env("DEDUPE_HOURLY", "1") != "0"

    snapshot = scrape(pages=pages, per_page=per_page, region=region)
    appwrite = AppwriteClient()

    if dedupe_hourly and snapshot_exists_for_hour(appwrite, snapshot["snapshotId"]):
        return {
            "ok": True,
            "skipped": True,
            "reason": "snapshot_already_exists_for_hour",
            "snapshotId": snapshot["snapshotId"],
            "createdAt": snapshot["createdAt"],
        }

    write_result = write_snapshot(appwrite, snapshot)
    return {
        "ok": True,
        "skipped": False,
        "snapshotId": snapshot["snapshotId"],
        "createdAt": snapshot["createdAt"],
        "count": snapshot["count"],
        **write_result,
    }


def main(context=None):  # Appwrite runtime may call this function.
    result = run()
    if context is not None and hasattr(context, "res"):
        return context.res.json(result)
    print(json.dumps(result, ensure_ascii=True))
    return result


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=True))
