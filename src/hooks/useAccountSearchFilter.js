import { useMemo } from "react";

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatGroupSearchText(name, tag) {
  const n = String(name || "").trim();
  const t = String(tag || "").trim();
  if (n && t) return `${n} [${t}]`.toLowerCase();
  return (n || t).toLowerCase();
}

export function useAccountSearchFilter({
  entries,
  search,
  hideAnonymized,
  isVisibleAccount,
  progressionPayload,
  comparePayload,
  deltaPayload,
  anomaliesPayload,
  resetImpactPayload,
  consistencyPayload,
  watchlistPayload,
}) {
  const searchQuery = useMemo(() => String(search || "").trim().toLowerCase(), [search]);

  const latestAffiliationByAccount = useMemo(() => {
    const map = new Map();
    for (const row of entries || []) {
      const key = normalizeSearchText(row.accountName);
      if (!key) continue;
      map.set(key, {
        wvwGuildName: row.wvwGuildName || "",
        wvwGuildTag: row.wvwGuildTag || "",
        allianceGuildName: row.allianceGuildName || "",
        allianceGuildTag: row.allianceGuildTag || "",
      });
    }
    return map;
  }, [entries]);

  const matchesSearchForAccount = (accountName) => {
    if (!searchQuery) return true;
    const accountText = normalizeSearchText(accountName);
    if (accountText.includes(searchQuery)) return true;
    const meta = latestAffiliationByAccount.get(accountText);
    if (!meta) return false;
    const wvwText = formatGroupSearchText(meta.wvwGuildName, meta.wvwGuildTag);
    const allianceText = formatGroupSearchText(meta.allianceGuildName, meta.allianceGuildTag);
    return wvwText.includes(searchQuery) || allianceText.includes(searchQuery);
  };

  const filteredEntries = useMemo(() => {
    const base = (entries || []).filter((e) => isVisibleAccount(e.accountName));
    if (!searchQuery) return base;
    return base.filter((e) => {
      const accountText = normalizeSearchText(e.accountName);
      const wvwText = formatGroupSearchText(e.wvwGuildName, e.wvwGuildTag);
      const allianceText = formatGroupSearchText(e.allianceGuildName, e.allianceGuildTag);
      return accountText.includes(searchQuery) || wvwText.includes(searchQuery) || allianceText.includes(searchQuery);
    });
  }, [entries, hideAnonymized, searchQuery, isVisibleAccount]);

  const filteredProgressionPayload = useMemo(() => {
    if (!hideAnonymized || !progressionPayload?.series) return progressionPayload;
    const series = Object.fromEntries(
      Object.entries(progressionPayload.series).filter(([name]) => isVisibleAccount(name))
    );
    return { ...progressionPayload, series };
  }, [progressionPayload, hideAnonymized, isVisibleAccount]);

  const filteredComparePayload = useMemo(() => {
    if (!hideAnonymized || !comparePayload?.series) return comparePayload;
    const series = Object.fromEntries(
      Object.entries(comparePayload.series).filter(([name]) => isVisibleAccount(name))
    );
    const accounts = (comparePayload.accounts || []).filter((a) => isVisibleAccount(a));
    return { ...comparePayload, accounts, series };
  }, [comparePayload, hideAnonymized, isVisibleAccount]);

  const filteredDeltaRows = useMemo(() => {
    const rows = deltaPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName) && matchesSearchForAccount(r.accountName));
  }, [deltaPayload, hideAnonymized, searchQuery, latestAffiliationByAccount, isVisibleAccount]);

  const filteredAnomalies = useMemo(() => {
    const rows = anomaliesPayload?.anomalies || [];
    return rows.filter((r) => isVisibleAccount(r.accountName) && matchesSearchForAccount(r.accountName));
  }, [anomaliesPayload, hideAnonymized, searchQuery, latestAffiliationByAccount, isVisibleAccount]);

  const filteredResetImpactRows = useMemo(() => {
    const rows = resetImpactPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName) && matchesSearchForAccount(r.accountName));
  }, [resetImpactPayload, hideAnonymized, searchQuery, latestAffiliationByAccount, isVisibleAccount]);

  const filteredConsistencyRows = useMemo(() => {
    const rows = consistencyPayload?.rows || [];
    return rows.filter((r) => isVisibleAccount(r.accountName) && matchesSearchForAccount(r.accountName));
  }, [consistencyPayload, hideAnonymized, searchQuery, latestAffiliationByAccount, isVisibleAccount]);

  const filteredWatchlistRows = useMemo(() => {
    const rows = watchlistPayload?.rows || [];
    return rows.filter((r) => {
      const account = r.accountName || r.requestedAccount;
      if (!isVisibleAccount(account)) return false;
      if (!searchQuery) return true;
      if (normalizeSearchText(account).includes(searchQuery)) return true;
      return matchesSearchForAccount(r.accountName);
    });
  }, [watchlistPayload, hideAnonymized, searchQuery, latestAffiliationByAccount, isVisibleAccount]);

  return {
    searchQuery,
    filteredEntries,
    filteredProgressionPayload,
    filteredComparePayload,
    filteredDeltaRows,
    filteredAnomalies,
    filteredResetImpactRows,
    filteredConsistencyRows,
    filteredWatchlistRows,
  };
}
