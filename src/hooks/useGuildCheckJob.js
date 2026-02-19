import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { usePersistedState } from "./usePersistedState";

function parseBoundedInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function fmtInt(value) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Number(value) || 0));
}

export function useGuildCheckJob({ addToast }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = usePersistedState("vox-guild-check-region", "eu", {
    parse: (raw) => (String(raw || "").toLowerCase() === "na" ? "na" : "eu"),
    serialize: (v) => (String(v || "").toLowerCase() === "na" ? "na" : "eu"),
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = usePersistedState("vox-guild-check-page-size", 50, {
    parse: (raw) => parseBoundedInt(raw, 50, 10, 200),
    serialize: (v) => String(v),
  });
  const [jobId, setJobId] = useState(null);
  const [payload, setPayload] = useState(null);
  const [running, setRunning] = useState(false);
  const pollTimerRef = useRef(null);
  const lastStatusRef = useRef(null);

  const fetchJob = useCallback(
    async (targetJobId, targetPage = page, targetPageSize = pageSize) => {
      const nextPayload = await api.getGuildSearchJob({
        jobId: targetJobId,
        page: targetPage,
        pageSize: targetPageSize,
      });
      setPayload(nextPayload);
      const status = String(nextPayload?.status || "");
      setRunning(status === "queued" || status === "running");
      return nextPayload;
    },
    [page, pageSize]
  );

  const runSearch = useCallback(async () => {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      addToast({ title: "Guild Check", description: "Enter a guild or alliance query first.", variant: "error" });
      return;
    }

    setPage(1);
    try {
      const start = await api.runGuildSearch({
        query: normalizedQuery,
        region,
        perPage: 100,
      });
      const nextJobId = String(start?.jobId || "").trim();
      if (!nextJobId) throw new Error("Guild search job id missing.");

      setJobId(nextJobId);
      lastStatusRef.current = null;
      setRunning(true);
      await fetchJob(nextJobId, 1, pageSize);
      addToast({ title: "Guild Check", description: "Background search started.", variant: "default", duration: 3000 });
    } catch (error) {
      setRunning(false);
      addToast({ title: "Guild Check Failed", description: error.message, variant: "error" });
    }
  }, [query, region, pageSize, fetchJob, addToast]);

  const setPageSize = useCallback(
    async (nextSize) => {
      const normalized = Math.max(10, Math.min(200, Number(nextSize) || 50));
      setPageSizeState(normalized);
      setPage(1);
      if (!jobId) return;
      try {
        await fetchJob(jobId, 1, normalized);
      } catch {
        // Ignore transient failures; poll cycle retries.
      }
    },
    [setPageSizeState, jobId, fetchJob]
  );

  const onPrevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const onNextPage = useCallback(() => {
    setPage((p) => Math.min(payload?.pagination?.totalPages || 1, p + 1));
  }, [payload]);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    let shouldContinue = true;

    const poll = async () => {
      if (cancelled) return;
      try {
        const nextPayload = await fetchJob(jobId, page, pageSize);
        const status = String(nextPayload?.status || "");
        shouldContinue = status === "queued" || status === "running";
        if ((status === "completed" || status === "failed") && lastStatusRef.current !== status) {
          lastStatusRef.current = status;
          if (status === "completed") {
            addToast({
              title: "Guild Check Complete",
              description: `Found ${fmtInt(nextPayload?.resultCount || 0)} matching player(s).`,
              variant: "success",
              duration: 4000,
            });
          } else {
            addToast({
              title: "Guild Check Failed",
              description: nextPayload?.error || "Guild search job failed.",
              variant: "error",
              duration: 4500,
            });
          }
        }
      } catch {
        // Ignore transient polling errors.
      } finally {
        if (!cancelled && shouldContinue) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(poll, 2000);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimerRef.current);
    };
  }, [jobId, page, pageSize, fetchJob, addToast]);

  return {
    query,
    setQuery,
    region,
    setRegion,
    running,
    runSearch,
    status: payload,
    rows: payload?.rows || [],
    page: payload?.pagination?.page || page,
    pageSize,
    setPageSize,
    onPrevPage,
    onNextPage,
  };
}
