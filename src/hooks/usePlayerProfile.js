import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { usePersistedState } from "./usePersistedState";
import { useAccountAutocomplete } from "./useAccountAutocomplete";

export function usePlayerProfile({ hideAnonymized, isAnonymizedAccount }) {
  const [profileInput, setProfileInput] = useState("");
  const [profileAccount, setProfileAccount] = usePersistedState("vox-profile-account", "", {
    parse: (raw) => String(raw || "").trim(),
    serialize: (v) => String(v || ""),
  });
  const [profileState, setProfileState] = useState({
    loading: false,
    error: null,
    payload: null,
  });
  const profileSuggestions = useAccountAutocomplete(profileInput, { hideAnonymized, isAnonymizedAccount, limit: 12, delayMs: 120 });

  const handleSelectProfile = useCallback(
    (raw) => {
      const normalized = String(raw || "").trim();
      if (!normalized) return;
      if (hideAnonymized && isAnonymizedAccount(normalized)) return;
      const matched = profileSuggestions.find((s) => s.toLowerCase() === normalized.toLowerCase());
      const next = matched || normalized;
      setProfileAccount(next);
      setProfileInput(next);
    },
    [hideAnonymized, isAnonymizedAccount, profileSuggestions, setProfileAccount]
  );

  const handleProfileInputChange = useCallback(
    (value) => {
      setProfileInput(value);
      const normalized = String(value || "").trim().toLowerCase();
      if (!normalized) return;
      const matched = profileSuggestions.find((s) => s.toLowerCase() === normalized);
      if (matched) handleSelectProfile(matched);
    },
    [profileSuggestions, handleSelectProfile]
  );

  useEffect(() => {
    const account = String(profileAccount || "").trim();
    if (!account) {
      setProfileState({ loading: false, error: null, payload: null });
      return;
    }
    let cancelled = false;
    setProfileState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .getPlayerHistory(account)
      .then((payload) => {
        if (cancelled) return;
        setProfileState({ loading: false, error: null, payload });
      })
      .catch((err) => {
        if (cancelled) return;
        setProfileState({ loading: false, error: err?.message || "unknown_error", payload: null });
      });
    return () => {
      cancelled = true;
    };
  }, [profileAccount]);

  const profileSummary = useMemo(() => {
    const rows = Array.isArray(profileState.payload?.history) ? profileState.payload.history : [];
    if (rows.length < 2) return null;
    const ordered = [...rows].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const weeklyGain = Number(last.weeklyKills || 0) - Number(first.weeklyKills || 0);
    const totalGain = Number(last.totalKills || 0) - Number(first.totalKills || 0);
    const rankChange = Number(first.rank || 0) - Number(last.rank || 0);
    const avgWeeklyPerSnapshot = weeklyGain / Math.max(1, ordered.length - 1);

    let intervalHoursSum = 0;
    let intervalCount = 0;
    for (let i = 1; i < ordered.length; i += 1) {
      const prevMs = Date.parse(ordered[i - 1].createdAt);
      const curMs = Date.parse(ordered[i].createdAt);
      if (!Number.isFinite(prevMs) || !Number.isFinite(curMs) || curMs <= prevMs) continue;
      intervalHoursSum += (curMs - prevMs) / 3600000;
      intervalCount += 1;
    }
    const avgHoursBetweenSnapshots = intervalCount > 0 ? intervalHoursSum / intervalCount : 0;

    const lastMs = Date.parse(last.createdAt);
    const recent12hThreshold = Number.isFinite(lastMs) ? lastMs - 12 * 3600000 : Number.NaN;
    let recentAnchor = first;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const t = Date.parse(ordered[i].createdAt);
      if (Number.isFinite(t) && t <= recent12hThreshold) {
        recentAnchor = ordered[i];
        break;
      }
    }
    const recent12hGain = Number(last.weeklyKills || 0) - Number(recentAnchor.weeklyKills || 0);

    return {
      samplePoints: ordered.length,
      latestRank: last.rank,
      weeklyGain,
      totalGain,
      rankChange,
      avgWeeklyPerSnapshot,
      avgHoursBetweenSnapshots,
      recent12hGain,
    };
  }, [profileState]);

  const profileRows = useMemo(() => {
    const rows = Array.isArray(profileState.payload?.history) ? profileState.payload.history : [];
    return [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 24);
  }, [profileState]);

  return {
    profileInput,
    profileSuggestions,
    profileAccount,
    profileState,
    profileSummary,
    profileRows,
    handleSelectProfile,
    handleProfileInputChange,
  };
}
