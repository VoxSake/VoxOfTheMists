import { useEffect, useState } from "react";

const NAV_SECTIONS = [
  { id: "stats", label: "Overview" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "movers", label: "Movers" },
  { id: "anomalies", label: "Anomalies" },
  { id: "reset-impact", label: "Reset Impact" },
  { id: "consistency", label: "Consistency" },
  { id: "watchlist", label: "Watchlist" },
  { id: "guild-check", label: "Guild Check" },
  { id: "progression", label: "Progression" },
  { id: "compare", label: "Compare" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState("stats");

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return undefined;

    const observedIds = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    const observeAvailableSections = () => {
      for (const { id } of NAV_SECTIONS) {
        if (observedIds.has(id)) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        observer.observe(el);
        observedIds.add(id);
      }
    };

    observeAvailableSections();

    const mutationObserver =
      typeof MutationObserver === "function"
        ? new MutationObserver(() => {
            observeAvailableSections();
          })
        : null;

    mutationObserver?.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver?.disconnect();
      observer.disconnect();
    };
  }, []);

  return (
    <nav className="section-nav">
      {NAV_SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={activeId === id ? "active" : ""}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
