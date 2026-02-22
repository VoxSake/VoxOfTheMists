function createWeekWindowService(db) {
  function getBrusselsLocalParts(date) {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const part of parts) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
      weekday: map.weekday,
    };
  }

  function zonedLocalToUtcMs(year, month, day, hour, minute, second) {
    let guess = Date.UTC(year, month - 1, day, hour, minute, second);
    for (let i = 0; i < 5; i += 1) {
      const p = getBrusselsLocalParts(new Date(guess));
      const desiredPseudo = Date.UTC(year, month - 1, day, hour, minute, second);
      const actualPseudo = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      const diff = desiredPseudo - actualPseudo;
      if (diff === 0) return guess;
      guess += diff;
    }
    return guess;
  }

  function getCurrentWeekWindowBrussels(now = new Date()) {
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const p = getBrusselsLocalParts(now);
    const weekdayIndex = weekdayMap[p.weekday] ?? 0;
    let daysSinceFriday = (weekdayIndex - 5 + 7) % 7;
    if (daysSinceFriday === 0 && p.hour < 19) daysSinceFriday = 7;

    const localAnchor = new Date(Date.UTC(p.year, p.month - 1, p.day));
    localAnchor.setUTCDate(localAnchor.getUTCDate() - daysSinceFriday);
    const startY = localAnchor.getUTCFullYear();
    const startM = localAnchor.getUTCMonth() + 1;
    const startD = localAnchor.getUTCDate();

    const startUtcMs = zonedLocalToUtcMs(startY, startM, startD, 19, 0, 0);
    const localEnd = new Date(Date.UTC(startY, startM - 1, startD));
    localEnd.setUTCDate(localEnd.getUTCDate() + 7);
    const endUtcMs = zonedLocalToUtcMs(
      localEnd.getUTCFullYear(),
      localEnd.getUTCMonth() + 1,
      localEnd.getUTCDate(),
      19,
      0,
      0
    );
    return {
      startUtc: new Date(startUtcMs).toISOString(),
      endUtc: new Date(endUtcMs).toISOString(),
    };
  }

  function normalizeWeekEndParam(value) {
    const raw = String(value || "").trim();
    if (!raw) return { value: null, invalid: false };
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return { value: null, invalid: true };
    return { value: new Date(ms).toISOString(), invalid: false };
  }

  function listSelectableWeekWindows() {
    const rows = db
      .prepare(
        `
        SELECT snapshot_id, created_at
        FROM snapshots
        ORDER BY created_at DESC
        `
      )
      .all();
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const createdAt = String(row?.created_at || "").trim();
      if (!createdAt) continue;
      const ms = Date.parse(createdAt);
      if (!Number.isFinite(ms)) continue;
      const local = getBrusselsLocalParts(new Date(ms));
      if (local.weekday !== "Fri" || local.hour !== 18 || local.minute !== 45) continue;

      // Use the 18:45 pre-reset snapshot as selectable archived week identifier.
      // Keep endUtc at reset time (19:00 local) so queries remain [start, end) and exclude reseted data.
      const weekEndUtc = new Date(ms).toISOString();
      const endUtcMs = zonedLocalToUtcMs(local.year, local.month, local.day, 19, 0, 0);
      const endUtc = new Date(endUtcMs).toISOString();
      if (seen.has(weekEndUtc)) continue;
      seen.add(weekEndUtc);

      const weekStartLocal = new Date(Date.UTC(local.year, local.month - 1, local.day));
      weekStartLocal.setUTCDate(weekStartLocal.getUTCDate() - 7);
      const weekStartUtcMs = zonedLocalToUtcMs(
        weekStartLocal.getUTCFullYear(),
        weekStartLocal.getUTCMonth() + 1,
        weekStartLocal.getUTCDate(),
        19,
        0,
        0
      );
      out.push({
        weekEndUtc,
        startUtc: new Date(weekStartUtcMs).toISOString(),
        endUtc,
        anchorSnapshotId: row.snapshot_id,
        anchorCreatedAt: createdAt,
      });
    }
    out.sort((a, b) => String(b.weekEndUtc).localeCompare(String(a.weekEndUtc)));
    return out;
  }

  function resolveWeekWindowForRequest(weekEndIso = null) {
    if (!weekEndIso) return { weekWindow: getCurrentWeekWindowBrussels(), selectedWeekEndUtc: null };
    const allWeeks = listSelectableWeekWindows();
    let match = allWeeks.find((item) => item.weekEndUtc === weekEndIso);
    if (!match) {
      // Backward compatibility for older persisted selections that used reset-time identifiers.
      match = allWeeks.find((item) => item.endUtc === weekEndIso);
    }
    if (!match) return null;
    return {
      weekWindow: { startUtc: match.startUtc, endUtc: match.endUtc },
      selectedWeekEndUtc: match.weekEndUtc,
    };
  }

  function resolveWeekSelectionOrReply({
    reply,
    scope = "week",
    weekEndRaw = null,
    requireWeekWindow = false,
  }) {
    const parsed = normalizeWeekEndParam(weekEndRaw);
    if (parsed.invalid) {
      reply.code(400).send({ error: "Invalid weekEnd (ISO date expected)." });
      return null;
    }
    const needsWeekWindow = requireWeekWindow || scope === "week";
    if (!needsWeekWindow) return { weekWindow: null, selectedWeekEndUtc: null };

    const resolved = resolveWeekWindowForRequest(parsed.value);
    if (!resolved) {
      reply.code(400).send({ error: "Unknown weekEnd selection." });
      return null;
    }
    return resolved;
  }

  function getBrusselsWeekdayIndexForLocalDate(year, month, day) {
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const probeUtcMs = zonedLocalToUtcMs(year, month, day, 12, 0, 0);
    const weekday = getBrusselsLocalParts(new Date(probeUtcMs)).weekday;
    return weekdayMap[weekday] ?? 0;
  }

  function getAutoScrapeSlotsForWeekday(weekdayIndex) {
    const slots = [];
    for (let hour = 0; hour < 24; hour += 1) {
      if (weekdayIndex === 5 && (hour === 19 || hour === 20)) continue;
      slots.push({ hour, minute: 0 });
    }
    if (weekdayIndex === 5) slots.push({ hour: 18, minute: 45 });
    slots.sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute));
    return slots;
  }

  function millisecondsToNextAutoScrape(nowMs = Date.now()) {
    const localNow = getBrusselsLocalParts(new Date(nowMs));
    const localMidnight = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
    for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
      const localDay = new Date(localMidnight);
      localDay.setUTCDate(localDay.getUTCDate() + dayOffset);
      const year = localDay.getUTCFullYear();
      const month = localDay.getUTCMonth() + 1;
      const day = localDay.getUTCDate();
      const weekdayIndex = getBrusselsWeekdayIndexForLocalDate(year, month, day);
      const slots = getAutoScrapeSlotsForWeekday(weekdayIndex);
      for (const slot of slots) {
        const candidateMs = zonedLocalToUtcMs(year, month, day, slot.hour, slot.minute, 0);
        if (candidateMs > nowMs + 500) return candidateMs - nowMs;
      }
    }
    return 60 * 60 * 1000;
  }

  return {
    getCurrentWeekWindowBrussels,
    normalizeWeekEndParam,
    listSelectableWeekWindows,
    resolveWeekWindowForRequest,
    resolveWeekSelectionOrReply,
    millisecondsToNextAutoScrape,
  };
}

module.exports = {
  createWeekWindowService,
};
