import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export function useAccountAutocomplete(query, { hideAnonymized, isAnonymizedAccount, limit = 12, delayMs = 120 }) {
  const [suggestions, setSuggestions] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    const normalized = String(query || "").trim();
    if (!normalized) {
      setSuggestions([]);
      return undefined;
    }
    const ac = new AbortController();
    let cancelled = false;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api.searchAccounts({ query: normalized, limit, signal: ac.signal });
        if (cancelled) return;
        const base = data.accounts || [];
        setSuggestions(hideAnonymized ? base.filter((s) => !isAnonymizedAccount(s)) : base);
      } catch {
        // Ignore transient autocomplete failures.
      }
    }, delayMs);
    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(timerRef.current);
    };
  }, [query, hideAnonymized, isAnonymizedAccount, limit, delayMs]);

  return suggestions;
}
