export function SortTh({ sortable, sortKey, children }) {
  return (
    <th className={sortable ? "sortable-th" : ""} onClick={sortable ? () => sortable.toggle(sortKey) : undefined}>
      {children}
      {sortable ? <span className="sort-indicator">{sortable.indicator(sortKey)}</span> : null}
    </th>
  );
}
