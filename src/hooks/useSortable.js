import { useMemo, useState } from "react";

export function useSortable(data, defaultSort = null) {
  const [sort, setSort] = useState(defaultSort);

  const sorted = useMemo(() => {
    if (!sort || !data.length) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const isNum = typeof aVal === "number" || typeof bVal === "number";
      const cmp = isNum ? Number(aVal) - Number(bVal) : String(aVal).localeCompare(String(bVal));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [data, sort]);

  const toggle = (key) => {
    setSort((prev) => ({
      key,
      dir: prev?.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const indicator = (key) => {
    if (sort?.key !== key) return "";
    return sort.dir === "asc" ? " \u001e" : " \u001f";
  };

  return { sorted, toggle, indicator };
}
