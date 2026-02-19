import { useEffect, useRef } from "react";

export function useSnapshotStatusPolling(onPoll) {
  const callbackRef = useRef(onPoll);
  const timerRef = useRef(null);

  useEffect(() => {
    callbackRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    let cancelled = false;

    const nextDelayMs = () => {
      const baseMs = 45_000;
      const jitterMs = Math.floor(Math.random() * 30_000);
      return baseMs + jitterMs;
    };

    const schedule = (delay) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          await callbackRef.current?.();
        } catch {
          // Ignore transient polling errors.
        } finally {
          if (!cancelled) schedule(nextDelayMs());
        }
      }, delay);
    };

    schedule(Math.floor(Math.random() * 12_000));
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, []);
}
