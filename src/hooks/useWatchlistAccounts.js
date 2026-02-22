import { useCallback, useEffect, useState } from "react";
import { usePersistedState } from "./usePersistedState";
import { useAccountAutocomplete } from "./useAccountAutocomplete";

function parseStringArray(raw, max = 10) {
  try {
    const parsed = JSON.parse(raw || "[]");
    const cleaned = Array.isArray(parsed)
      ? parsed.map((v) => String(v || "").trim()).filter(Boolean).slice(0, max)
      : [];
    return [...new Map(cleaned.map((v) => [v.toLowerCase(), v])).values()];
  } catch {
    return [];
  }
}

export function useWatchlistAccounts({ hideAnonymized, isAnonymizedAccount, maxAccounts = 10 }) {
  const [watchlistAccounts, setWatchlistAccounts] = usePersistedState("vox-watchlist", [], {
    parse: (raw) => parseStringArray(raw, maxAccounts),
  });
  const [watchlistInput, setWatchlistInput] = useState("");
  const watchlistSuggestions = useAccountAutocomplete(watchlistInput, {
    hideAnonymized,
    isAnonymizedAccount,
    limit: 12,
    delayMs: 120,
  });

  useEffect(() => {
    if (!hideAnonymized) return;
    setWatchlistAccounts((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
  }, [hideAnonymized, isAnonymizedAccount, setWatchlistAccounts]);

  const addWatchlistAccount = useCallback((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    setWatchlistAccounts((prev) => {
      if (prev.some((v) => v.toLowerCase() === normalized.toLowerCase())) return prev;
      return [...prev, normalized].slice(0, maxAccounts);
    });
    setWatchlistInput("");
  }, [setWatchlistAccounts, maxAccounts]);

  const removeWatchlistAccount = useCallback((account) => {
    setWatchlistAccounts((prev) => prev.filter((v) => v !== account));
  }, [setWatchlistAccounts]);

  const handleWatchlistInputChange = useCallback(
    (value) => {
      setWatchlistInput(value);
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized) return;
      const matched = watchlistSuggestions.find((s) => s.toLowerCase() === normalized);
      if (matched) addWatchlistAccount(matched);
    },
    [watchlistSuggestions, addWatchlistAccount]
  );

  return {
    watchlistAccounts,
    watchlistInput,
    watchlistSuggestions,
    addWatchlistAccount,
    removeWatchlistAccount,
    handleWatchlistInputChange,
  };
}
