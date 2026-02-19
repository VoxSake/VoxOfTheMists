#!/usr/bin/env python3
import json
import os
import random
import string
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

API_BASE = "https://api.gw2mists.com"
ENDPOINT = f"{API_BASE}/leaderboard/player/v4"
SITE_URL = "https://gw2mists.com/leaderboards/player?nr=1&c=100"
RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


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


def normalize_optional_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def as_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def parse_utc_datetime(value) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed


def parse_json_object(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = bytes(value).decode("utf-8", errors="ignore")
    if not isinstance(value, str):
        return {}
    text = value.strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def context_payload(context) -> dict:
    if context is None:
        return {}
    req = getattr(context, "req", None)
    if req is None:
        return {}
    for attr in ("bodyJson", "body_json", "body", "bodyRaw", "rawBody"):
        try:
            raw_value = getattr(req, attr)
        except Exception:
            continue
        parsed = parse_json_object(raw_value)
        if parsed:
            return parsed
    return {}


def http_json(
    method: str,
    url: str,
    headers: dict | None = None,
    params: list[tuple[str, str]] | None = None,
    payload: dict | None = None,
    timeout: int = 30,
) -> tuple[int, str, dict]:
    final_url = url
    if params:
        query = urlencode(params, doseq=True)
        final_url = f"{url}?{query}" if query else url
    data_bytes = None
    req_headers = dict(headers or {})
    if payload is not None:
        data_bytes = json.dumps(payload).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = Request(final_url, data=data_bytes, headers=req_headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            status = int(response.status or 200)
            parsed = json.loads(body) if body else {}
            return status, body, parsed
    except HTTPError as err:
        body = err.read().decode("utf-8", errors="replace") if hasattr(err, "read") else str(err)
        status = int(err.code or 500)
        return status, body, {}
    except URLError as err:
        raise RuntimeError(f"Network error: {err}") from err


def fetch_page(region_id: int, page: int, per_page: int) -> dict:
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
    attempts = max(1, int(env("REQUEST_MAX_ATTEMPTS", "4")))
    backoff = max(0.25, float(env("REQUEST_BASE_BACKOFF_SECONDS", "0.6")))
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            status, body, parsed = http_json("POST", ENDPOINT, headers=headers, payload=payload, timeout=30)
            if status in RETRYABLE_STATUS:
                raise RuntimeError(f"GW2Mists transient status {status}: {body[:180]}")
            if status >= 400:
                raise RuntimeError(f"GW2Mists status {status}: {body[:180]}")
            return parsed
        except Exception as err:
            last_err = err
            if attempt >= attempts:
                break
            time.sleep(backoff * attempt)
    raise RuntimeError(f"GW2Mists page fetch failed after {attempts} attempts: {last_err}")


def resolve_hourly_capture_utc(now_utc: datetime) -> tuple[datetime, str]:
    tz_name = env("SNAPSHOT_TIMEZONE", "UTC") or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz_name = "UTC"
        tz = timezone.utc
    local_now = now_utc.astimezone(tz)
    local_slot = local_now.replace(minute=0, second=0, microsecond=0)

    reset_policy_enabled = env("RESET_POLICY_ENABLED", "0") != "0"
    if reset_policy_enabled:
        try:
            reset_weekday = int(env("RESET_WEEKDAY", "4"))  # Friday
        except Exception:
            reset_weekday = 4
        reset_weekday = max(0, min(6, reset_weekday))
        try:
            reset_hour_local = int(env("RESET_HOUR_LOCAL", "19"))
        except Exception:
            reset_hour_local = 19
        reset_hour_local = max(0, min(23, reset_hour_local))
        try:
            pre_reset_offset_minutes = int(env("PRE_RESET_OFFSET_MINUTES", "15"))
        except Exception:
            pre_reset_offset_minutes = 15
        pre_reset_offset_minutes = max(1, min(59, pre_reset_offset_minutes))
        try:
            pre_reset_window_start_minutes = int(env("PRE_RESET_WINDOW_START_MINUTES", str(pre_reset_offset_minutes)))
        except Exception:
            pre_reset_window_start_minutes = pre_reset_offset_minutes
        pre_reset_window_start_minutes = max(pre_reset_offset_minutes, min(59, pre_reset_window_start_minutes))
        try:
            post_reset_skip_hours = int(env("POST_RESET_SKIP_HOURS", "2"))
        except Exception:
            post_reset_skip_hours = 2
        post_reset_skip_hours = max(0, min(12, post_reset_skip_hours))

        if int(local_now.weekday()) == reset_weekday:
            reset_point = local_now.replace(hour=reset_hour_local, minute=0, second=0, microsecond=0)
            pre_reset_window_start = reset_point - timedelta(minutes=pre_reset_window_start_minutes)
            pre_reset_point = reset_point - timedelta(minutes=pre_reset_offset_minutes)
            resume_point = reset_point + timedelta(hours=post_reset_skip_hours)
            if pre_reset_window_start <= local_now < reset_point:
                local_slot = pre_reset_point
            elif reset_point <= local_now < resume_point:
                return None, tz_name

    return local_slot.astimezone(timezone.utc), tz_name


def scrape(pages: int, per_page: int, region: str, capture_time_utc: datetime | None = None) -> dict:
    region_id = region_to_id(region)
    now_utc = capture_time_utc or datetime.now(tz=timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    else:
        now_utc = now_utc.astimezone(timezone.utc)
    created_at = now_utc.replace(second=0, microsecond=0).isoformat()
    entries = []
    total = None

    for page in range(1, pages + 1):
        data = fetch_page(region_id, page, per_page)
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


def appwrite_escape(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def deterministic_doc_id(prefix: str, seed: str, length: int = 28) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    max_len = max(8, 36 - len(prefix) - 1)
    safe_len = max(8, min(length, max_len))
    return f"{prefix}_{digest[:safe_len]}"


class AppwriteClient:
    def __init__(self) -> None:
        self.endpoint = env("APPWRITE_FUNCTION_API_ENDPOINT", env("APPWRITE_ENDPOINT", "https://cloud.appwrite.io")).rstrip("/")
        if self.endpoint.endswith("/v1"):
            self.endpoint = self.endpoint[:-3]
        self.project_id = env("APPWRITE_FUNCTION_PROJECT_ID", env("APPWRITE_PROJECT_ID"))
        self.api_key = env("APPWRITE_FUNCTION_API_KEY", env("APPWRITE_API_KEY"))
        self.database_id = env("APPWRITE_DATABASE_ID")
        self.snapshots_collection_id = env("APPWRITE_SNAPSHOTS_COLLECTION_ID", "snapshots")
        self.entries_collection_id = env("APPWRITE_ENTRIES_COLLECTION_ID", "entries")
        self.write_concurrency = max(1, int(env("APPWRITE_WRITE_CONCURRENCY", "6")))
        self.max_attempts = max(1, int(env("REQUEST_MAX_ATTEMPTS", "4")))
        self.base_backoff_seconds = max(0.25, float(env("REQUEST_BASE_BACKOFF_SECONDS", "0.6")))
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

    def list_documents(self, collection_id: str, queries: list[str] | None = None) -> list[dict]:
        url = self._documents_url(collection_id)
        query_params = [("queries[]", q) for q in (queries or [])]
        last_err = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                status, raw, body = http_json("GET", url, headers=self.headers, params=query_params, timeout=30)
                if status in RETRYABLE_STATUS:
                    raise RuntimeError(f"Appwrite list transient {status}: {raw[:180]}")
                if status >= 400:
                    raise RuntimeError(f"Appwrite list failed {status}: {raw[:180]}")
                return body.get("documents", []) or []
            except Exception as err:
                last_err = err
                if attempt >= self.max_attempts:
                    break
                time.sleep(self.base_backoff_seconds * attempt)
        raise RuntimeError(f"Appwrite list failed after {self.max_attempts} attempts: {last_err}")

    def get_document(self, collection_id: str, document_id: str) -> dict | None:
        url = f"{self._documents_url(collection_id)}/{document_id}"
        last_err = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                status, raw, body = http_json("GET", url, headers=self.headers, timeout=30)
                if status == 404:
                    return None
                if status in RETRYABLE_STATUS:
                    raise RuntimeError(f"Appwrite get transient {status}: {raw[:180]}")
                if status >= 400:
                    raise RuntimeError(f"Appwrite get failed {status}: {raw[:180]}")
                return body if isinstance(body, dict) else {}
            except Exception as err:
                last_err = err
                if attempt >= self.max_attempts:
                    break
                time.sleep(self.base_backoff_seconds * attempt)
        raise RuntimeError(f"Appwrite get failed after {self.max_attempts} attempts: {last_err}")

    def create_document(
        self,
        collection_id: str,
        data: dict,
        document_id: str | None = None,
        conflict_as_success: bool = False,
    ) -> dict:
        url = self._documents_url(collection_id)
        payload = {"documentId": document_id or "unique()", "data": data}
        last_err = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                status, raw, body = http_json("POST", url, headers=self.headers, payload=payload, timeout=30)
                if status == 409 and conflict_as_success:
                    return {"_conflict": True, "$id": payload["documentId"]}
                if status in RETRYABLE_STATUS:
                    raise RuntimeError(f"Appwrite create transient {status}: {raw[:180]}")
                if status >= 400:
                    raise RuntimeError(f"Appwrite create failed {status}: {raw[:180]}")
                body = body if isinstance(body, dict) else {}
                body["_conflict"] = False
                return body
            except Exception as err:
                last_err = err
                if attempt >= self.max_attempts:
                    break
                time.sleep(self.base_backoff_seconds * attempt)
        raise RuntimeError(f"Appwrite create failed after {self.max_attempts} attempts: {last_err}")

    def snapshot_exists(self, snapshot_id: str) -> bool:
        snapshot_doc_id = deterministic_doc_id("snapshot", snapshot_id)
        doc = self.get_document(self.snapshots_collection_id, snapshot_doc_id)
        return doc is not None


def snapshot_exists_for_slot(appwrite: AppwriteClient, snapshot_id: str) -> bool:
    try:
        return appwrite.snapshot_exists(snapshot_id)
    except Exception as err:
        # Fail-closed: if dedupe cannot be verified, do not risk duplicate writes.
        raise RuntimeError(f"Dedupe check failed for snapshot {snapshot_id}: {err}") from err


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
    snapshot_doc_id = deterministic_doc_id("snapshot", snapshot["snapshotId"])
    snapshot_write = appwrite.create_document(
        appwrite.snapshots_collection_id,
        snapshot_meta,
        document_id=snapshot_doc_id,
        conflict_as_success=True,
    )
    if snapshot_write.get("_conflict"):
        return {
            "snapshotInserted": 0,
            "entriesInserted": 0,
            "entriesConflicts": 0,
            "reason": "snapshot_already_exists_conflict",
        }

    entries = []
    for row in snapshot["entries"]:
        entries.append(
            {
                "snapshotId": snapshot["snapshotId"],
                "rank": int(row["rank"]),
                "accountName": str(row["accountName"]),
                "weeklyKills": int(row["weeklyKills"]),
                "totalKills": int(row["totalKills"]),
                "wvwGuildName": normalize_optional_text(row.get("wvwGuildName")),
                "wvwGuildTag": normalize_optional_text(row.get("wvwGuildTag")),
                "allianceGuildName": normalize_optional_text(row.get("allianceGuildName")),
                "allianceGuildTag": normalize_optional_text(row.get("allianceGuildTag")),
            }
        )

    inserted = 0
    conflicts = 0
    errors = []
    with ThreadPoolExecutor(max_workers=appwrite.write_concurrency) as executor:
        futures = [
            executor.submit(
                appwrite.create_document,
                appwrite.entries_collection_id,
                entry,
                deterministic_doc_id("entry", f"{snapshot['snapshotId']}:{entry['rank']}"),
                True,
            )
            for entry in entries
        ]
        for future in as_completed(futures):
            try:
                result = future.result()
                if result.get("_conflict"):
                    conflicts += 1
                else:
                    inserted += 1
            except Exception as err:
                errors.append(str(err))
    if errors:
        raise RuntimeError(
            f"Snapshot inserted but {len(errors)} entry writes failed (inserted={inserted}/{len(entries)}). "
            f"First error: {errors[0]}"
        )

    return {"snapshotInserted": 1, "entriesInserted": inserted, "entriesConflicts": conflicts}


def run(overrides: dict | None = None) -> dict:
    pages = max(1, int(env("GW2MISTS_PAGES", "3")))
    per_page = max(1, int(env("GW2MISTS_PER_PAGE", "100")))
    region = env("GW2MISTS_REGION", "eu").lower()
    dedupe_hourly = env("DEDUPE_HOURLY", "1") != "0"
    override_flags = {
        "bypassDedupe": False,
        "forcedCaptureTimeUtc": None,
    }

    if isinstance(overrides, dict):
        if as_bool(overrides.get("bypassDedupe"), False):
            dedupe_hourly = False
            override_flags["bypassDedupe"] = True
        forced_capture_time = overrides.get("captureTimeUtc")
        if forced_capture_time is not None:
            parsed_capture_time = parse_utc_datetime(forced_capture_time)
            if parsed_capture_time is None:
                raise RuntimeError("Invalid override captureTimeUtc")
            override_flags["forcedCaptureTimeUtc"] = parsed_capture_time.isoformat()
        else:
            parsed_capture_time = None
    else:
        parsed_capture_time = None

    now_utc = datetime.now(tz=timezone.utc)
    slot_utc, slot_tz = resolve_hourly_capture_utc(now_utc)
    if parsed_capture_time is not None:
        capture_time_utc = parsed_capture_time
    else:
        if slot_utc is None:
            return {
                "ok": True,
                "skipped": True,
                "reason": "post_reset_cooldown",
                "slotTimezone": slot_tz,
                "nowUtc": now_utc.isoformat(),
                "overrideApplied": override_flags,
            }
        capture_time_utc = slot_utc

    snapshot = scrape(pages=pages, per_page=per_page, region=region, capture_time_utc=capture_time_utc)
    appwrite = AppwriteClient()

    if dedupe_hourly and snapshot_exists_for_slot(appwrite, snapshot["snapshotId"]):
        return {
            "ok": True,
            "skipped": True,
            "reason": "snapshot_already_exists_for_slot",
            "snapshotId": snapshot["snapshotId"],
            "createdAt": snapshot["createdAt"],
            "slotTimezone": slot_tz,
            "overrideApplied": override_flags,
        }

    write_result = write_snapshot(appwrite, snapshot)
    if write_result.get("reason") == "snapshot_already_exists_conflict":
        return {
            "ok": True,
            "skipped": True,
            "reason": "snapshot_already_exists_for_slot_conflict",
            "snapshotId": snapshot["snapshotId"],
            "createdAt": snapshot["createdAt"],
            "slotTimezone": slot_tz,
            "overrideApplied": override_flags,
            **write_result,
        }
    return {
        "ok": True,
        "skipped": False,
        "snapshotId": snapshot["snapshotId"],
        "createdAt": snapshot["createdAt"],
        "count": snapshot["count"],
        "slotTimezone": slot_tz,
        "overrideApplied": override_flags,
        **write_result,
    }


def main(context=None):  # Appwrite runtime may call this function.
    payload = context_payload(context)
    override_token = env("MANUAL_OVERRIDE_TOKEN", "")
    requested_overrides = {
        "bypassDedupe": as_bool(payload.get("forceBypassDedupe"), False)
        or as_bool(payload.get("bypassDedupe"), False),
        "captureTimeUtc": (
            payload.get("forceCaptureTimeUtc")
            if payload.get("forceCaptureTimeUtc") is not None
            else payload.get("captureTimeUtc")
        ),
    }
    override_requested = (
        requested_overrides["bypassDedupe"]
        or requested_overrides["captureTimeUtc"] is not None
    )
    provided_token = str(
        payload.get("overrideToken")
        if payload.get("overrideToken") is not None
        else payload.get("forceRunToken", "")
    ).strip()

    if override_requested and (not override_token or provided_token != override_token):
        result = {
            "ok": False,
            "error": "override_token_invalid_or_missing",
            "overrideRequested": True,
        }
    else:
        result = run(requested_overrides if override_requested else None)

    if context is not None and hasattr(context, "res"):
        return context.res.json(result)
    print(json.dumps(result, ensure_ascii=True))
    return result


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=True))
