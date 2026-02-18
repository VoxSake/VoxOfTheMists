#!/usr/bin/env python3
import json
import os
import time

import requests


def env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default)).strip()


def appwrite_base(endpoint: str) -> str:
    trimmed = endpoint.rstrip("/")
    return trimmed if trimmed.endswith("/v1") else f"{trimmed}/v1"


class AppwriteSchemaClient:
    def __init__(self) -> None:
        endpoint = env("APPWRITE_ENDPOINT", "https://cloud.appwrite.io")
        self.base = appwrite_base(endpoint)
        self.project_id = env("APPWRITE_PROJECT_ID")
        self.api_key = env("APPWRITE_API_KEY")
        self.database_id = env("APPWRITE_DATABASE_ID")
        self.collection_id = env("APPWRITE_ENTRIES_COLLECTION_ID", "entries")
        missing = [
            name
            for name, value in [
                ("APPWRITE_ENDPOINT", endpoint),
                ("APPWRITE_PROJECT_ID", self.project_id),
                ("APPWRITE_API_KEY", self.api_key),
                ("APPWRITE_DATABASE_ID", self.database_id),
                ("APPWRITE_ENTRIES_COLLECTION_ID", self.collection_id),
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

    def _collection_base(self) -> str:
        return f"{self.base}/databases/{self.database_id}/collections/{self.collection_id}"

    def list_attributes(self) -> list[dict]:
        url = f"{self._collection_base()}/attributes"
        resp = requests.get(url, headers=self.headers, timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"List attributes failed {resp.status_code}: {resp.text}")
        body = resp.json()
        return body.get("attributes", []) or []

    def list_indexes(self) -> list[dict]:
        url = f"{self._collection_base()}/indexes"
        resp = requests.get(url, headers=self.headers, timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"List indexes failed {resp.status_code}: {resp.text}")
        body = resp.json()
        return body.get("indexes", []) or []

    def create_string_attribute(self, key: str, size: int = 120) -> None:
        url = f"{self._collection_base()}/attributes/string"
        payload = {"key": key, "size": int(size), "required": False, "default": None, "array": False}
        resp = requests.post(url, headers=self.headers, data=json.dumps(payload), timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Create attribute '{key}' failed {resp.status_code}: {resp.text}")

    def wait_attribute_ready(self, key: str, timeout_seconds: int = 120) -> None:
        end = time.time() + timeout_seconds
        while time.time() < end:
            attrs = {str(a.get("key", "")).strip(): a for a in self.list_attributes()}
            current = attrs.get(key)
            status = str((current or {}).get("status", "")).lower()
            if status in ("available", "active", "enabled", ""):
                return
            if status in ("failed", "stuck"):
                raise RuntimeError(f"Attribute '{key}' status is '{status}'")
            time.sleep(1.5)
        raise TimeoutError(f"Timed out waiting for attribute '{key}'")

    def create_index(self, key: str, attributes: list[str]) -> None:
        url = f"{self._collection_base()}/indexes"
        payload = {
            "key": key,
            "type": "key",
            "attributes": attributes,
            "orders": ["ASC"] * len(attributes),
        }
        resp = requests.post(url, headers=self.headers, data=json.dumps(payload), timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Create index '{key}' failed {resp.status_code}: {resp.text}")


def run() -> dict:
    client = AppwriteSchemaClient()
    existing_attrs = {str(a.get("key", "")).strip() for a in client.list_attributes()}
    target_attrs = ["wvwGuildName", "wvwGuildTag", "allianceGuildName", "allianceGuildTag"]
    created_attrs = []
    for key in target_attrs:
        if key in existing_attrs:
            continue
        client.create_string_attribute(key, size=120)
        client.wait_attribute_ready(key)
        created_attrs.append(key)

    existing_indexes = {str(i.get("key", "")).strip() for i in client.list_indexes()}
    target_indexes = [
        ("idx_entries_wvw_guild_tag", ["wvwGuildTag"]),
        ("idx_entries_alliance_guild_tag", ["allianceGuildTag"]),
    ]
    created_indexes = []
    for index_key, attrs in target_indexes:
        if index_key in existing_indexes:
            continue
        client.create_index(index_key, attrs)
        created_indexes.append(index_key)

    return {
        "ok": True,
        "collection": client.collection_id,
        "createdAttributes": created_attrs,
        "createdIndexes": created_indexes,
    }


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=True))
