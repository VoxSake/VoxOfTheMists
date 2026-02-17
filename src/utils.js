/* ── Shared constants ── */
export const METRIC_OPTIONS = [
    { value: "weeklyKills", label: "Weekly" },
    { value: "totalKills", label: "Total" },
];

export const TOP_OPTIONS = [10, 15, 20];

export const SCOPE_OPTIONS = [
    { value: "week", label: "Current Week (Fast)" },
    { value: "all", label: "All Time" },
];

/* ── Formatting ── */
export function fmtNumber(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
}

export function metricLabel(metric) {
    return metric === "totalKills" ? "Total Kills" : "Weekly Kills";
}

export function isAnonymizedAccount(name) {
    const v = String(name || "").replace(/\s+/g, " ").trim();
    if (!v) return false;
    if (/(anon|anonym|hidden|private|redacted|masked)/i.test(v)) return true;
    if (/^[*•_?-]{3,}$/.test(v)) return true;
    return /^[a-z][A-Z][A-Za-z0-9]{2,}\.\d{4}$/.test(v);
}

export function formatTimestamp(iso, timeZone, dateOnly = false) {
    if (!iso) return "-";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat("fr-BE", {
        timeZone,
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: dateOnly ? undefined : "2-digit",
        minute: dateOnly ? undefined : "2-digit",
    }).format(date);
}

export function formatAxisTimestamp(iso, timeZone, includeDate = false) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return new Intl.DateTimeFormat("fr-BE", {
        timeZone,
        day: includeDate ? "2-digit" : undefined,
        month: includeDate ? "2-digit" : undefined,
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function timeBucketFromHour(hour) {
    if (hour === 0 || hour === 23) return "Evening";
    if (hour >= 1 && hour <= 6) return "Night";
    if (hour >= 7 && hour <= 12) return "Morning";
    if (hour >= 13 && hour <= 20) return "Afternoon";
    return "Primetime";
}

export function timeBucketFromLocalTime(hour, minute) {
    if (hour === 0 && minute === 0) return "Evening";
    if (
        (hour === 0 && minute >= 1) ||
        (hour >= 1 && hour <= 5) ||
        (hour === 6 && minute === 0)
    ) {
        return "Night";
    }
    if (
        (hour === 6 && minute >= 1) ||
        (hour >= 7 && hour <= 11) ||
        (hour === 12 && minute === 0)
    ) {
        return "Morning";
    }
    if (
        (hour === 12 && minute >= 1) ||
        (hour >= 13 && hour <= 19) ||
        (hour === 20 && minute === 0)
    ) {
        return "Afternoon";
    }
    if (
        (hour === 20 && minute >= 1) ||
        hour === 21 ||
        (hour === 22 && minute === 0)
    ) {
        return "Primetime";
    }
    return "Evening";
}

export function localHour(iso, timeZone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 0;
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hour12: false,
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value || "0");
    return Number.isFinite(h) ? h : 0;
}

export function localWeekday(iso, timeZone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Monday";
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
    }).format(date);
}

/* ── API ── */
export async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/* ── CSV Export ── */
export function downloadCsv(filename, headers, rows) {
    const esc = (v) => {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const lines = [headers.map((h) => esc(h.label)).join(",")];
    for (const row of rows) {
        lines.push(headers.map((h) => esc(row[h.key])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function downloadText(filename, content, mimeType = "text/plain;charset=utf-8;") {
    const blob = new Blob([String(content ?? "")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
