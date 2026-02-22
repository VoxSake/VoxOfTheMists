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

export function useCompareAccounts({ hideAnonymized, isAnonymizedAccount, maxAccounts = 10 }) {
  const [compareAccounts, setCompareAccounts] = usePersistedState("vox-compare-accounts", [], {
    parse: (raw) => parseStringArray(raw, maxAccounts),
  });
  const [compareInput, setCompareInput] = useState("");
  const suggestions = useAccountAutocomplete(compareInput, { hideAnonymized, isAnonymizedAccount, limit: 12, delayMs: 120 });

  useEffect(() => {
    if (!hideAnonymized) return;
    setCompareAccounts((prev) => prev.filter((a) => !isAnonymizedAccount(a)));
  }, [hideAnonymized, isAnonymizedAccount, setCompareAccounts]);

  const addCompareAccount = useCallback(
    (raw) => {
      const name = String(raw || "").trim().slice(0, 80);
      if (!name) return;
      if (hideAnonymized && isAnonymizedAccount(name)) return;
      setCompareAccounts((prev) => {
        if (prev.length >= maxAccounts) return prev;
        if (prev.some((a) => a.toLowerCase() === name.toLowerCase())) return prev;
        return [...prev, name];
      });
      setCompareInput("");
    },
    [hideAnonymized, isAnonymizedAccount, maxAccounts, setCompareAccounts]
  );

  const removeCompareAccount = useCallback((account) => {
    setCompareAccounts((prev) => prev.filter((a) => a.toLowerCase() !== account.toLowerCase()));
  }, [setCompareAccounts]);

  const handleCompareInputChange = useCallback(
    (value) => {
      setCompareInput(value);
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized) return;
      const matched = suggestions.find((s) => s.toLowerCase() === normalized);
      if (matched) addCompareAccount(matched);
    },
    [suggestions, addCompareAccount]
  );

  return {
    compareAccounts,
    compareInput,
    suggestions,
    addCompareAccount,
    removeCompareAccount,
    handleCompareInputChange,
  };
}
