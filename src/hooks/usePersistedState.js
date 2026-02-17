import { useEffect, useRef, useState } from "react";

function resolveInitial(initialValue) {
  return typeof initialValue === "function" ? initialValue() : initialValue;
}

export function usePersistedState(key, initialValue, options = {}) {
  const parseRef = useRef(options.parse || ((raw) => JSON.parse(raw)));
  const serializeRef = useRef(options.serialize || ((value) => JSON.stringify(value)));

  const [state, setState] = useState(() => {
    const fallback = resolveInitial(initialValue);
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return parseRef.current(raw);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, serializeRef.current(state));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [key, state]);

  return [state, setState];
}
