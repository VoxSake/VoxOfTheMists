import { Suspense, lazy, useEffect, useRef } from "react";
import { SectionNav } from "./SectionNav";
import { LeaderboardSection } from "./sections/LeaderboardSection";
import { StatsSection } from "./sections/StatsSection";
import { NarrativeInsightsSection } from "./sections/NarrativeInsightsSection";
import { HistoricalWeekCompareSection } from "./sections/HistoricalWeekCompareSection";
import { PlayerProfileSection } from "./sections/PlayerProfileSection";

/** @typedef {import("../types/dashboard").DashboardMainProps} DashboardMainProps */

const loadRankMoversSection = () =>
  import("./sections/RankMoversSection").then((m) => ({ default: m.RankMoversSection }));
const loadWatchlistSection = () =>
  import("./sections/WatchlistSection").then((m) => ({ default: m.WatchlistSection }));
const loadGuildCheckSection = () =>
  import("./sections/GuildCheckSection").then((m) => ({ default: m.GuildCheckSection }));
const loadAnomaliesSection = () =>
  import("./sections/AnomaliesSection").then((m) => ({ default: m.AnomaliesSection }));
const loadResetImpactSection = () =>
  import("./sections/ResetImpactSection").then((m) => ({ default: m.ResetImpactSection }));
const loadConsistencySection = () =>
  import("./sections/ConsistencySection").then((m) => ({ default: m.ConsistencySection }));
const loadTopProgressionSection = () =>
  import("./sections/TopProgressionSection").then((m) => ({ default: m.TopProgressionSection }));
const loadCompareAccountsSection = () =>
  import("./sections/CompareAccountsSection").then((m) => ({ default: m.CompareAccountsSection }));

const RankMoversSection = lazy(loadRankMoversSection);
const WatchlistSection = lazy(loadWatchlistSection);
const GuildCheckSection = lazy(loadGuildCheckSection);
const AnomaliesSection = lazy(loadAnomaliesSection);
const ResetImpactSection = lazy(loadResetImpactSection);
const ConsistencySection = lazy(loadConsistencySection);
const TopProgressionSection = lazy(loadTopProgressionSection);
const CompareAccountsSection = lazy(loadCompareAccountsSection);

const SECTION_PREFETCHERS = {
  movers: loadRankMoversSection,
  anomalies: loadAnomaliesSection,
  "reset-impact": loadResetImpactSection,
  consistency: loadConsistencySection,
  watchlist: loadWatchlistSection,
  "guild-check": loadGuildCheckSection,
  progression: loadTopProgressionSection,
  compare: loadCompareAccountsSection,
};

function SectionFallback() {
  return (
    <section className="card">
      <p className="muted">Loading module...</p>
    </section>
  );
}

/** @param {DashboardMainProps} props */
export function DashboardMain({
  timeZone,
  healthPayload,
  scope,
  metric,
  allTimeRange,
  themeDark,
  initialLoading,
  latestSnapshot,
  snapshotCount,
  entriesPerSnapshot,
  nextSnapshotIso,
  ingestionStatus,
  lastPipelineEventIso,
  weekReset,
  velocityTotalWeeklyDelta,
  velocityAvgPerHour,
  velocityTopMover,
  narrativeInsights,
  leaderboard,
  movers,
  anomalies,
  weekCompare,
  progression,
  compare,
  watchlist,
  profile,
  resetImpact,
  consistency,
  guildCheck,
}) {
  const prefetchedSectionChunksRef = useRef(new Set());

  useEffect(() => {
    const prefetched = prefetchedSectionChunksRef.current;
    const prefetchById = (id) => {
      const key = String(id || "");
      if (!key || prefetched.has(key)) return;
      const prefetch = SECTION_PREFETCHERS[key];
      if (!prefetch) return;
      prefetched.add(key);
      prefetch().catch(() => {
        prefetched.delete(key);
      });
    };

    if (typeof IntersectionObserver !== "function") {
      Object.keys(SECTION_PREFETCHERS).forEach(prefetchById);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          prefetchById(entry.target.id);
          observer.unobserve(entry.target);
        }
      },
      { root: null, rootMargin: "300px 0px", threshold: 0.01 }
    );

    Object.keys(SECTION_PREFETCHERS).forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <SectionNav />

      <StatsSection
        initialLoading={initialLoading}
        latestSnapshot={latestSnapshot}
        healthPayload={healthPayload}
        timeZone={timeZone}
        nextSnapshotIso={nextSnapshotIso}
        ingestionStatus={ingestionStatus}
        lastPipelineEventIso={lastPipelineEventIso}
        snapshotCount={snapshotCount}
        entriesPerSnapshot={entriesPerSnapshot}
        weekReset={weekReset}
        velocityTotalWeeklyDelta={velocityTotalWeeklyDelta}
        velocityAvgPerHour={velocityAvgPerHour}
        velocityTopMover={velocityTopMover}
      />

      <main className="layout">
        <NarrativeInsightsSection insights={narrativeInsights} />

        <LeaderboardSection
          search={leaderboard.search}
          setSearch={leaderboard.setSearch}
          leaderboardPageSize={leaderboard.pageSize}
          setLeaderboardPageSize={leaderboard.setPageSize}
          topLeaderboard={leaderboard.top}
          setTopLeaderboard={leaderboard.setTop}
          canRunManualSnapshot={leaderboard.canRunManualSnapshot}
          onRefresh={leaderboard.onRefresh}
          runManualSnapshot={leaderboard.runManualSnapshot}
          snapshotRunning={leaderboard.snapshotRunning}
          exportLeaderboardCsv={leaderboard.exportCsv}
          latestSnapshot={latestSnapshot}
          timeZone={timeZone}
          leaderboardStartIndex={leaderboard.startIndex}
          leaderboardEndIndex={leaderboard.endIndex}
          leaderboardTotalRows={leaderboard.totalRows}
          clampedLeaderboardPage={leaderboard.clampedPage}
          leaderboardTotalPages={leaderboard.totalPages}
          onPrevPage={leaderboard.onPrevPage}
          onNextPage={leaderboard.onNextPage}
          healthPayload={healthPayload}
          initialLoading={initialLoading}
          leaderboardSort={leaderboard.sort}
          leaderboardVisibleRows={leaderboard.visibleRows}
        />

        <Suspense fallback={<SectionFallback />}>
          <RankMoversSection
            deltaMetric={movers.deltaMetric}
            setDeltaMetric={movers.setDeltaMetric}
            showTotalDelta={movers.showTotalDelta}
            setShowTotalDelta={movers.setShowTotalDelta}
            moversPageSize={movers.pageSize}
            setMoversPageSize={movers.setPageSize}
            topDelta={movers.topDelta}
            setTopDelta={movers.setTopDelta}
            exportDeltaCsv={movers.exportCsv}
            scope={scope}
            deltaPayload={movers.deltaPayload}
            timeZone={timeZone}
            movers={movers.rows}
            moversStartIndex={movers.startIndex}
            moversEndIndex={movers.endIndex}
            moversTotalRows={movers.totalRows}
            clampedMoversPage={movers.clampedPage}
            moversTotalPages={movers.totalPages}
            onPrevPage={movers.onPrevPage}
            onNextPage={movers.onNextPage}
            deltaSort={movers.sort}
            moversVisibleRows={movers.visibleRows}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <AnomaliesSection
            anomalyMinDelta={anomalies.minDelta}
            setAnomalyMinDelta={anomalies.setMinDelta}
            anomaliesPageSize={anomalies.pageSize}
            setAnomaliesPageSize={anomalies.setPageSize}
            exportAnomaliesCsv={anomalies.exportCsv}
            anomalySort={anomalies.sort}
            timeZone={timeZone}
            anomaliesStartIndex={anomalies.startIndex}
            anomaliesEndIndex={anomalies.endIndex}
            anomaliesTotalRows={anomalies.totalRows}
            clampedAnomaliesPage={anomalies.clampedPage}
            anomaliesTotalPages={anomalies.totalPages}
            onPrevPage={anomalies.onPrevPage}
            onNextPage={anomalies.onNextPage}
            anomaliesVisibleRows={anomalies.visibleRows}
          />
        </Suspense>

        <HistoricalWeekCompareSection
          weekOptions={weekCompare.options}
          weekA={weekCompare.weekA}
          weekB={weekCompare.weekB}
          setWeekA={weekCompare.setWeekA}
          setWeekB={weekCompare.setWeekB}
          hasArchivedWeeks={weekCompare.hasArchivedWeeks}
          loading={weekCompare.state.loading}
          error={weekCompare.state.error}
          summaryA={weekCompare.summary.summaryA}
          summaryB={weekCompare.summary.summaryB}
          comparisonRows={weekCompare.summary.comparisonRows}
        />

        <Suspense fallback={<SectionFallback />}>
          <TopProgressionSection
            topProgression={progression.top}
            setTopProgression={progression.setTop}
            metric={metric}
            setMetric={progression.setMetric}
            scope={scope}
            setScope={progression.setScope}
            allTimeRange={allTimeRange}
            setAllTimeRange={progression.setAllTimeRange}
            progressionPayload={progression.payload}
            timeZone={timeZone}
            filteredProgressionPayload={progression.filteredPayload}
            themeDark={themeDark}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <CompareAccountsSection
            effectiveCompareAccounts={compare.effectiveAccounts}
            removeCompareAccount={compare.removeAccount}
            compareInput={compare.input}
            handleCompareInputChange={compare.handleInputChange}
            suggestions={compare.suggestions}
            addCompareAccount={compare.addAccount}
            setCompareBaseline={compare.setBaseline}
            compareBaseline={compare.baseline}
            scope={scope}
            allTimeRange={allTimeRange}
            setAllTimeRange={compare.setAllTimeRange}
            comparePayload={compare.payload}
            timeZone={timeZone}
            filteredComparePayload={compare.filteredPayload}
            metric={metric}
            themeDark={themeDark}
            compareSummaries={compare.summaries}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <WatchlistSection
            effectiveWatchlistAccounts={watchlist.effectiveAccounts}
            removeWatchlistAccount={watchlist.removeAccount}
            watchlistInput={watchlist.input}
            handleWatchlistInputChange={watchlist.handleInputChange}
            watchlistSuggestions={watchlist.suggestions}
            addWatchlistAccount={watchlist.addAccount}
            watchlistMinGain={watchlist.minGain}
            setWatchlistMinGain={watchlist.setMinGain}
            watchlistMinRankUp={watchlist.minRankUp}
            setWatchlistMinRankUp={watchlist.setMinRankUp}
            watchlistSort={watchlist.sort}
          />
        </Suspense>

        <PlayerProfileSection
          profileInput={profile.input}
          onProfileInputChange={profile.handleInputChange}
          profileSuggestions={profile.suggestions}
          onSelectProfile={profile.handleSelect}
          activeProfileAccount={profile.account}
          profileLoading={profile.state.loading}
          profileError={profile.state.error}
          profileSummary={profile.summary}
          profileRows={profile.rows}
          timeZone={timeZone}
        />

        <Suspense fallback={<SectionFallback />}>
          <ResetImpactSection
            resetImpactWindow={resetImpact.window}
            setResetImpactWindow={resetImpact.setWindow}
            resetImpactPayload={resetImpact.payload}
            timeZone={timeZone}
            resetImpactSort={resetImpact.sort}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <ConsistencySection
            consistencyTop={consistency.top}
            setConsistencyTop={consistency.setTop}
            consistencySort={consistency.sort}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <GuildCheckSection
            query={guildCheck.query}
            setQuery={guildCheck.setQuery}
            region={guildCheck.region}
            setRegion={guildCheck.setRegion}
            running={guildCheck.running}
            onRun={guildCheck.runSearch}
            status={guildCheck.status}
            rows={guildCheck.rows}
            page={guildCheck.page}
            pageSize={guildCheck.pageSize}
            setPageSize={guildCheck.setPageSize}
            onPrevPage={guildCheck.onPrevPage}
            onNextPage={guildCheck.onNextPage}
          />
        </Suspense>
      </main>
    </>
  );
}
