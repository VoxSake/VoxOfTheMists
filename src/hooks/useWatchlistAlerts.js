import { useEffect } from "react";
import { fmtNumber } from "../utils";
import { usePersistedState } from "./usePersistedState";

export function useWatchlistAlerts({ watchlistPayload, addToast }) {
  const [watchlistToastSeenBySnapshot, setWatchlistToastSeenBySnapshot] = usePersistedState(
    "vox.watchlist.toastSeen.v1",
    {},
    {
      parse: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      },
    }
  );

  useEffect(() => {
    const rows = Array.isArray(watchlistPayload?.rows) ? watchlistPayload.rows : [];
    if (!rows.length) return;

    const snapshotId = String(watchlistPayload?.latest?.snapshotId || "").trim();
    if (!snapshotId) return;

    const snapshotSeenList = Array.isArray(watchlistToastSeenBySnapshot?.[snapshotId])
      ? watchlistToastSeenBySnapshot[snapshotId]
      : [];
    const snapshotSeen = new Set(snapshotSeenList.map((v) => String(v).toLowerCase()));

    const newlyTriggered = rows.filter((row) => Boolean(row?.found) && Boolean(row?.triggered));
    if (!newlyTriggered.length) return;

    const unseen = [];
    let seenChanged = false;

    for (const row of newlyTriggered) {
      const account = String(row.accountName || row.requestedAccount || "").trim();
      if (!account) continue;
      const accountKey = account.toLowerCase();
      if (snapshotSeen.has(accountKey)) continue;
      snapshotSeen.add(accountKey);
      seenChanged = true;
      unseen.push(row);
    }

    if (!unseen.length) return;

    if (seenChanged) {
      setWatchlistToastSeenBySnapshot((prev) => {
        const current = prev && typeof prev === "object" ? prev : {};
        const next = { ...current, [snapshotId]: Array.from(snapshotSeen) };
        const keepIds = Object.keys(next).sort().slice(-12);
        const pruned = {};
        for (const id of keepIds) pruned[id] = next[id];
        return pruned;
      });
    }

    const maxDetailedToasts = 5;
    for (const row of unseen.slice(0, maxDetailedToasts)) {
      const account = String(row.accountName || row.requestedAccount || "Unknown");
      const weeklyGain = Math.max(0, Number(row.weeklyGain || 0));
      const rankChange = Number.isFinite(Number(row.rankChange)) ? Number(row.rankChange) : 0;
      const detail =
        rankChange > 0
          ? `${account}: +${fmtNumber(weeklyGain)} weekly, +${fmtNumber(rankChange)} rank`
          : `${account}: +${fmtNumber(weeklyGain)} weekly`;
      addToast({
        title: "Watchlist Alert",
        description: detail,
        variant: "success",
        duration: 0,
      });
    }

    const remaining = unseen.length - maxDetailedToasts;
    if (remaining > 0) {
      addToast({
        title: "Watchlist Alert",
        description: `${fmtNumber(remaining)} more account(s) triggered in this snapshot.`,
        variant: "default",
        duration: 0,
      });
    }
  }, [watchlistPayload, watchlistToastSeenBySnapshot, setWatchlistToastSeenBySnapshot, addToast]);
}
