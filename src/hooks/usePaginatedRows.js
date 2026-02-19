import { useMemo } from "react";

export function usePaginatedRows(rows, page, pageSize) {
  return useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safePageSize = Math.max(1, Number(pageSize) || 1);
    const totalRows = safeRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
    const clampedPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
    const start = (clampedPage - 1) * safePageSize;
    const visibleRows = safeRows.slice(start, start + safePageSize);
    const startIndex = totalRows ? start + 1 : 0;
    const endIndex = totalRows ? Math.min(start + safePageSize, totalRows) : 0;
    return {
      totalRows,
      totalPages,
      clampedPage,
      visibleRows,
      startIndex,
      endIndex,
    };
  }, [rows, page, pageSize]);
}
