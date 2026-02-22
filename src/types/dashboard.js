/**
 * @typedef {Object} SnapshotSummary
 * @property {string} snapshotId
 * @property {string} createdAt
 * @property {string} region
 * @property {number} count
 */

/**
 * @typedef {Object} LeaderboardRow
 * @property {number} rank
 * @property {string} accountName
 * @property {number} weeklyKills
 * @property {number} totalKills
 * @property {string=} wvwGuildName
 * @property {string=} wvwGuildTag
 * @property {string=} allianceGuildName
 * @property {string=} allianceGuildTag
 */

/**
 * @typedef {Object} NarrativeInsight
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string=} note
 */

/**
 * @typedef {Object} VelocityTopMover
 * @property {string} accountName
 * @property {number} weeklyKillsDelta
 */

/**
 * @typedef {Object} HealthPayload
 * @property {boolean=} appwriteSyncEnabled
 * @property {{entries?: number}=} totals
 * @property {{lastError?: string|null}=} appwriteSync
 * @property {{lastError?: string|null}=} snapshotStatus
 * @property {{lastError?: string|null}=} maintenance
 */

/**
 * @typedef {Object} SortableState
 * @property {Array<any>} sorted
 */

/**
 * @typedef {Object} LeaderboardSectionConfig
 * @property {string} search
 * @property {(value: string) => void} setSearch
 * @property {number} pageSize
 * @property {(value: number) => void} setPageSize
 * @property {number} top
 * @property {(value: number) => void} setTop
 * @property {boolean} canRunManualSnapshot
 * @property {() => void} onRefresh
 * @property {() => void} runManualSnapshot
 * @property {boolean} snapshotRunning
 * @property {() => void} exportCsv
 * @property {() => void} onPrevPage
 * @property {() => void} onNextPage
 * @property {SortableState} sort
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {number} totalRows
 * @property {number} clampedPage
 * @property {number} totalPages
 * @property {Array<LeaderboardRow>} visibleRows
 */

/**
 * @typedef {Object} MoversSectionConfig
 * @property {string} deltaMetric
 * @property {(value: string) => void} setDeltaMetric
 * @property {boolean} showTotalDelta
 * @property {(value: boolean) => void} setShowTotalDelta
 * @property {number} pageSize
 * @property {(value: number) => void} setPageSize
 * @property {number} topDelta
 * @property {(value: number) => void} setTopDelta
 * @property {() => void} exportCsv
 * @property {any} deltaPayload
 * @property {Array<any>} rows
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {number} totalRows
 * @property {number} clampedPage
 * @property {number} totalPages
 * @property {() => void} onPrevPage
 * @property {() => void} onNextPage
 * @property {SortableState} sort
 * @property {Array<any>} visibleRows
 */

/**
 * @typedef {Object} AnomaliesSectionConfig
 * @property {number} minDelta
 * @property {(value: number) => void} setMinDelta
 * @property {number} pageSize
 * @property {(value: number) => void} setPageSize
 * @property {() => void} exportCsv
 * @property {SortableState} sort
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {number} totalRows
 * @property {number} clampedPage
 * @property {number} totalPages
 * @property {() => void} onPrevPage
 * @property {() => void} onNextPage
 * @property {Array<any>} visibleRows
 */

/**
 * @typedef {Object} CompareSummaryRow
 * @property {string} account
 * @property {string} dominant
 * @property {number} confidence
 * @property {{Night: number, Morning: number, Afternoon: number, Primetime: number, Evening: number}} deltas
 * @property {{[weekday: string]: number}} hoursByDay
 */

/**
 * @typedef {Object} CompareSectionConfig
 * @property {Array<string>} effectiveAccounts
 * @property {(account: string) => void} removeAccount
 * @property {string} input
 * @property {(value: string) => void} handleInputChange
 * @property {Array<string>} suggestions
 * @property {(value: string) => void} addAccount
 * @property {(value: string) => void} setBaseline
 * @property {string} baseline
 * @property {(value: string) => void} setAllTimeRange
 * @property {any} payload
 * @property {any} filteredPayload
 * @property {Array<CompareSummaryRow>} summaries
 */

/**
 * @typedef {Object} WatchlistSectionConfig
 * @property {Array<string>} effectiveAccounts
 * @property {(account: string) => void} removeAccount
 * @property {string} input
 * @property {(value: string) => void} handleInputChange
 * @property {Array<string>} suggestions
 * @property {(value: string) => void} addAccount
 * @property {number} minGain
 * @property {(value: number) => void} setMinGain
 * @property {number} minRankUp
 * @property {(value: number) => void} setMinRankUp
 * @property {SortableState} sort
 */

/**
 * @typedef {Object} ProfileSectionConfig
 * @property {string} input
 * @property {(value: string) => void} handleInputChange
 * @property {Array<string>} suggestions
 * @property {(value: string) => void} handleSelect
 * @property {string|null} account
 * @property {{loading?: boolean, error?: string|null}} state
 * @property {any} summary
 * @property {Array<any>} rows
 */

/**
 * @typedef {Object} WeekCompareSectionConfig
 * @property {Array<any>} options
 * @property {string} weekA
 * @property {string} weekB
 * @property {(value: string) => void} setWeekA
 * @property {(value: string) => void} setWeekB
 * @property {boolean} hasArchivedWeeks
 * @property {{loading?: boolean, error?: string|null}} state
 * @property {any} summary
 */

/**
 * @typedef {Object} ProgressionSectionConfig
 * @property {number} top
 * @property {(value: number) => void} setTop
 * @property {(value: string) => void} setMetric
 * @property {(value: string) => void} setScope
 * @property {(value: string) => void} setAllTimeRange
 * @property {any} payload
 * @property {any} filteredPayload
 */

/**
 * @typedef {Object} ResetImpactSectionConfig
 * @property {number} window
 * @property {(value: number) => void} setWindow
 * @property {any} payload
 * @property {SortableState} sort
 */

/**
 * @typedef {Object} ConsistencySectionConfig
 * @property {number} top
 * @property {(value: number) => void} setTop
 * @property {SortableState} sort
 */

/**
 * @typedef {Object} DashboardMainProps
 * @property {boolean} initialLoading
 * @property {SnapshotSummary|null} latestSnapshot
 * @property {HealthPayload|null} healthPayload
 * @property {string} timeZone
 * @property {string|null} nextSnapshotIso
 * @property {string} ingestionStatus
 * @property {string|null} lastPipelineEventIso
 * @property {number} snapshotCount
 * @property {number} entriesPerSnapshot
 * @property {{endIso: string|null, countdown: string}} weekReset
 * @property {number} velocityTotalWeeklyDelta
 * @property {number} velocityAvgPerHour
 * @property {VelocityTopMover|null} velocityTopMover
 * @property {Array<NarrativeInsight>} narrativeInsights
 * @property {string} scope
 * @property {string} metric
 * @property {string} allTimeRange
 * @property {boolean} themeDark
 * @property {LeaderboardSectionConfig} leaderboard
 * @property {MoversSectionConfig} movers
 * @property {AnomaliesSectionConfig} anomalies
 * @property {WeekCompareSectionConfig} weekCompare
 * @property {ProgressionSectionConfig} progression
 * @property {CompareSectionConfig} compare
 * @property {WatchlistSectionConfig} watchlist
 * @property {ProfileSectionConfig} profile
 * @property {ResetImpactSectionConfig} resetImpact
 * @property {ConsistencySectionConfig} consistency
 * @property {any} guildCheck
 */

export {};
