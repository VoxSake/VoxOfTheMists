import { fmtNumber, formatTimestamp } from "../../utils";
import { SkeletonCard } from "../Skeleton";

export function StatsSection({
  initialLoading,
  latestSnapshot,
  healthPayload,
  timeZone,
  nextSnapshotIso,
  ingestionStatus,
  lastPipelineEventIso,
  snapshotCount,
  entriesPerSnapshot,
  weekReset,
  velocityTotalWeeklyDelta,
  velocityAvgPerHour,
  velocityTopMover,
}) {
  return (
    <section className="stats-grid" id="stats">
      {initialLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <article className="stat-card">
            <p className="stat-label">Latest Snapshot</p>
            <p className="stat-value">{latestSnapshot ? formatTimestamp(latestSnapshot.createdAt, timeZone) : "-"}</p>
            <p className="stat-subtle">
              Next Snapshot{healthPayload?.appwriteSyncEnabled ? " (Appwrite)" : ""}: {formatTimestamp(nextSnapshotIso, timeZone)}
            </p>
            <p className="stat-subtle">
              Ingestion: {ingestionStatus}
              {lastPipelineEventIso ? ` | Last run: ${formatTimestamp(lastPipelineEventIso, timeZone)}` : ""}
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Storage</p>
            <p className="stat-value">
              {fmtNumber(snapshotCount)} snapshots |{" "}
              {healthPayload?.totals?.entries != null ? fmtNumber(healthPayload.totals.entries) : "-"} entries
            </p>
            <p className="stat-subtle">
              Avg per snapshot: {entriesPerSnapshot != null ? fmtNumber(entriesPerSnapshot) : "-"} rows
            </p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Week Reset Countdown</p>
            <p className="stat-value countdown">{weekReset.countdown}</p>
            <p className="stat-subtle">Ends: {formatTimestamp(weekReset.endIso, timeZone)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">Change Velocity</p>
            <p className="stat-value">
              {velocityTotalWeeklyDelta > 0 ? "+" : ""}
              {fmtNumber(velocityTotalWeeklyDelta)}
            </p>
            <p className="stat-subtle">
              Avg/hour:{" "}
              {velocityAvgPerHour != null ? `${velocityAvgPerHour > 0 ? "+" : ""}${fmtNumber(velocityAvgPerHour)}` : "-"}
            </p>
            <p className="stat-subtle">
              Top mover: {velocityTopMover ? `${velocityTopMover.accountName} (+${fmtNumber(velocityTopMover.weeklyKillsDelta)})` : "-"}
            </p>
          </article>
        </>
      )}
    </section>
  );
}
