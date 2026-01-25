/**
 * Account scoring and ranking algorithms for cross-event analysis.
 * 
 * These functions calculate metrics like weighted percentile, consistency,
 * improvement over time, and reroll detection.
 */

import { calculatePercentile } from "./tier-detection";

export interface EventPerformance {
  eventId: string;
  eventName: string;
  artistName?: string | null;
  eventDateRaw?: string | null;
  venue?: string | null;
  position: number;
  percentile: number;           // Position as percentile within this event
  totalParticipants: number;    // How many accounts in this event
  testedAt: Date;
}

/**
 * Default weights for composite score calculation
 * These can be adjusted by the user
 */
export const DEFAULT_SCORE_WEIGHTS = {
  percentile: 0.40,      // Most important: how good is position
  consistency: 0.25,     // Reliability across events
  recentPerformance: 0.15, // Recent trend matters
  eventCoverage: 0.10,   // Participated in more events = more data
  purchaseSuccess: 0.10, // Proven to convert
};

export interface ScoreBreakdown {
  percentileScore: number;      // 0-100, inverted so lower percentile = higher score
  consistencyScore: number;     // 0-100, higher = more consistent
  recentPerformanceScore: number; // 0-100, based on recent percentile
  eventCoverageScore: number;   // 0-100, based on events entered
  purchaseSuccessScore: number; // 0 or 100, binary
  
  // Weighted contributions
  percentileContribution: number;
  consistencyContribution: number;
  recentPerformanceContribution: number;
  eventCoverageContribution: number;
  purchaseSuccessContribution: number;
  
  // Final composite
  compositeScore: number;       // 0-100, higher = better overall
  
  // Confidence
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
}

export interface AccountScore {
  accountId: string;
  email: string;
  hasPurchased: boolean;        // Has at least one successful purchase
  eventsEntered: number;        // Number of events participated in
  
  // Percentile metrics
  avgPercentile: number;        // Simple average of percentiles
  weightedPercentile: number;   // Weighted by event size
  bestPercentile: number;       // Best performance (lowest percentile = top)
  worstPercentile: number;      // Worst performance
  percentileRange: number;      // worstPercentile - bestPercentile
  
  // Consistency
  percentileStdDev: number;     // Standard deviation of percentiles
  consistencyScore: number;     // 0-100, higher = more consistent
  
  // Recent performance
  recentAvgPercentile: number;  // Avg of last N events
  
  // Improvement tracking
  improvementScore: number;     // Positive = improving, negative = declining
  
  // Last activity
  lastTestedAt: Date | null;
  
  // Transparent composite score with breakdown
  scoreBreakdown: ScoreBreakdown;
  
  // Raw performances for drill-down
  performances: EventPerformance[];
}

export interface RerollAnalysis {
  accountId: string;
  email: string;
  beforePercentile: number;     // Avg percentile before cutoff
  afterPercentile: number;      // Avg percentile after cutoff
  eventsBeforeCutoff: number;
  eventsAfterCutoff: number;
  change: number;               // afterPercentile - beforePercentile
  changeType: "improved" | "declined" | "stable";
}

/**
 * Calculate event performances with percentiles for an account
 */
export function calculateEventPerformances(
  accountQueuePositions: Array<{
    eventId: string;
    eventName: string;
    artistName?: string | null;
    eventDateRaw?: string | null;
    venue?: string | null;
    position: number;
    testedAt: Date;
  }>,
  eventParticipantCounts: Map<string, { count: number; positions: number[] }>
): EventPerformance[] {
  return accountQueuePositions.map(qp => {
    const eventData = eventParticipantCounts.get(qp.eventId);
    const totalParticipants = eventData?.count || 1;
    const positions = eventData?.positions || [qp.position];
    const percentile = calculatePercentile(qp.position, positions);

    return {
      eventId: qp.eventId,
      eventName: qp.eventName,
      artistName: qp.artistName,
      eventDateRaw: qp.eventDateRaw,
      venue: qp.venue,
      position: qp.position,
      percentile,
      totalParticipants,
      testedAt: qp.testedAt,
    };
  });
}

/**
 * Calculate composite score breakdown with full transparency
 */
export function calculateScoreBreakdown(
  avgPercentile: number,
  consistencyScore: number,
  recentAvgPercentile: number,
  eventsEntered: number,
  hasPurchased: boolean,
  maxEvents: number = 10, // Used for normalization
  weights: typeof DEFAULT_SCORE_WEIGHTS = DEFAULT_SCORE_WEIGHTS
): ScoreBreakdown {
  // Invert percentile so lower percentile = higher score (0-100 scale)
  // A percentile of 5% (top 5%) should give ~95 score
  const percentileScore = Math.max(0, Math.min(100, 100 - avgPercentile));
  
  // Consistency is already 0-100, higher = better
  const consistencyScoreNorm = consistencyScore;
  
  // Recent performance: invert like percentile
  const recentPerformanceScore = Math.max(0, Math.min(100, 100 - recentAvgPercentile));
  
  // Event coverage: normalize to 0-100 based on max expected events
  const eventCoverageScore = Math.min(100, (eventsEntered / maxEvents) * 100);
  
  // Purchase success: binary 0 or 100
  const purchaseSuccessScore = hasPurchased ? 100 : 0;
  
  // Calculate weighted contributions
  const percentileContribution = percentileScore * weights.percentile;
  const consistencyContribution = consistencyScoreNorm * weights.consistency;
  const recentPerformanceContribution = recentPerformanceScore * weights.recentPerformance;
  const eventCoverageContribution = eventCoverageScore * weights.eventCoverage;
  const purchaseSuccessContribution = purchaseSuccessScore * weights.purchaseSuccess;
  
  // Final composite score
  const compositeScore = 
    percentileContribution +
    consistencyContribution +
    recentPerformanceContribution +
    eventCoverageContribution +
    purchaseSuccessContribution;
  
  // Confidence based on sample size
  let confidence: "low" | "medium" | "high";
  let confidenceReason: string;
  
  if (eventsEntered === 1) {
    confidence = "low";
    confidenceReason = "Only 1 event - need more data for reliable ranking";
  } else if (eventsEntered <= 3) {
    confidence = "medium";
    confidenceReason = `Based on ${eventsEntered} events - moderate reliability`;
  } else {
    confidence = "high";
    confidenceReason = `Based on ${eventsEntered} events - high reliability`;
  }
  
  return {
    percentileScore: Math.round(percentileScore * 10) / 10,
    consistencyScore: Math.round(consistencyScoreNorm * 10) / 10,
    recentPerformanceScore: Math.round(recentPerformanceScore * 10) / 10,
    eventCoverageScore: Math.round(eventCoverageScore * 10) / 10,
    purchaseSuccessScore,
    percentileContribution: Math.round(percentileContribution * 10) / 10,
    consistencyContribution: Math.round(consistencyContribution * 10) / 10,
    recentPerformanceContribution: Math.round(recentPerformanceContribution * 10) / 10,
    eventCoverageContribution: Math.round(eventCoverageContribution * 10) / 10,
    purchaseSuccessContribution: Math.round(purchaseSuccessContribution * 10) / 10,
    compositeScore: Math.round(compositeScore * 10) / 10,
    confidence,
    confidenceReason,
  };
}

/**
 * Calculate comprehensive score for an account across all events
 */
export function calculateAccountScore(
  accountId: string,
  email: string,
  performances: EventPerformance[],
  hasPurchased: boolean,
  recentEventCount: number = 3,
  maxEventsForNorm: number = 10
): AccountScore {
  const emptyBreakdown: ScoreBreakdown = {
    percentileScore: 0,
    consistencyScore: 100,
    recentPerformanceScore: 0,
    eventCoverageScore: 0,
    purchaseSuccessScore: hasPurchased ? 100 : 0,
    percentileContribution: 0,
    consistencyContribution: 25,
    recentPerformanceContribution: 0,
    eventCoverageContribution: 0,
    purchaseSuccessContribution: hasPurchased ? 10 : 0,
    compositeScore: hasPurchased ? 35 : 25,
    confidence: "low",
    confidenceReason: "No queue data available",
  };

  if (performances.length === 0) {
    return {
      accountId,
      email,
      hasPurchased,
      eventsEntered: 0,
      avgPercentile: 0,
      weightedPercentile: 0,
      bestPercentile: 0,
      worstPercentile: 0,
      percentileRange: 0,
      percentileStdDev: 0,
      consistencyScore: 100,
      recentAvgPercentile: 0,
      improvementScore: 0,
      lastTestedAt: null,
      scoreBreakdown: emptyBreakdown,
      performances: [],
    };
  }

  const percentiles = performances.map(p => p.percentile);
  const eventsEntered = performances.length;

  // Simple average percentile
  const avgPercentile = percentiles.reduce((a, b) => a + b, 0) / eventsEntered;

  // Weighted percentile (more weight for larger events)
  const totalWeight = performances.reduce((sum, p) => sum + p.totalParticipants, 0);
  const weightedPercentile = totalWeight > 0
    ? performances.reduce((sum, p) => sum + p.percentile * p.totalParticipants, 0) / totalWeight
    : avgPercentile;

  // Best and worst
  const bestPercentile = Math.min(...percentiles);
  const worstPercentile = Math.max(...percentiles);

  // Standard deviation
  const squaredDiffs = percentiles.map(p => Math.pow(p - avgPercentile, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / eventsEntered;
  const percentileStdDev = Math.sqrt(avgSquaredDiff);

  // Consistency score: 100 = perfect consistency, 0 = highly variable
  // Based on standard deviation relative to the FULL 0-100 scale, NOT relative to the mean
  // A std dev of 0 = 100% consistent, std dev of 50 (max possible) = 0% consistent
  // We use 25 as the "bad" threshold since std dev > 25 is very inconsistent
  const maxReasonableStdDev = 25; // 25 percentage points of variation is very bad
  const consistencyScore = Math.max(0, Math.min(100, 100 * (1 - percentileStdDev / maxReasonableStdDev)));

  // Recent performance (last N events)
  const sortedByDate = [...performances].sort(
    (a, b) => b.testedAt.getTime() - a.testedAt.getTime()
  );
  const recentPerformances = sortedByDate.slice(0, recentEventCount);
  const recentAvgPercentile = recentPerformances.length > 0
    ? recentPerformances.reduce((sum, p) => sum + p.percentile, 0) / recentPerformances.length
    : avgPercentile;

  // Improvement score: compare recent vs older performance
  // Positive = improving (lower recent percentile = better)
  // Negative = declining
  let improvementScore = 0;
  if (eventsEntered >= 2) {
    const olderPerformances = sortedByDate.slice(recentEventCount);
    if (olderPerformances.length > 0) {
      const olderAvg = olderPerformances.reduce((sum, p) => sum + p.percentile, 0) / olderPerformances.length;
      // Improvement = old - recent (positive means recent is better = lower percentile)
      improvementScore = olderAvg - recentAvgPercentile;
    }
  }

  // Last tested date
  const lastTestedAt = sortedByDate.length > 0 ? sortedByDate[0].testedAt : null;

  // Percentile range
  const percentileRange = worstPercentile - bestPercentile;

  // Calculate transparent composite score with breakdown
  const scoreBreakdown = calculateScoreBreakdown(
    avgPercentile,
    consistencyScore,
    recentAvgPercentile,
    eventsEntered,
    hasPurchased,
    maxEventsForNorm
  );

  return {
    accountId,
    email,
    hasPurchased,
    eventsEntered,
    avgPercentile,
    weightedPercentile,
    bestPercentile,
    worstPercentile,
    percentileRange,
    percentileStdDev,
    consistencyScore,
    recentAvgPercentile,
    improvementScore,
    lastTestedAt,
    scoreBreakdown,
    performances,
  };
}

/**
 * Analyze accounts for reroll effects by comparing performance
 * before and after a cutoff date.
 */
export function analyzeReroll(
  accountScores: AccountScore[],
  cutoffDate: Date,
  minEventsEachSide: number = 2,
  significantChangeThreshold: number = 10 // Percentage point change
): RerollAnalysis[] {
  const results: RerollAnalysis[] = [];

  for (const account of accountScores) {
    const beforeCutoff = account.performances.filter(
      p => p.testedAt < cutoffDate
    );
    const afterCutoff = account.performances.filter(
      p => p.testedAt >= cutoffDate
    );

    // Skip if not enough data on both sides
    if (beforeCutoff.length < minEventsEachSide || afterCutoff.length < minEventsEachSide) {
      continue;
    }

    const beforePercentile = beforeCutoff.reduce((sum, p) => sum + p.percentile, 0) / beforeCutoff.length;
    const afterPercentile = afterCutoff.reduce((sum, p) => sum + p.percentile, 0) / afterCutoff.length;
    const change = afterPercentile - beforePercentile;

    let changeType: "improved" | "declined" | "stable";
    if (change < -significantChangeThreshold) {
      changeType = "improved"; // Lower percentile = better
    } else if (change > significantChangeThreshold) {
      changeType = "declined"; // Higher percentile = worse
    } else {
      changeType = "stable";
    }

    results.push({
      accountId: account.accountId,
      email: account.email,
      beforePercentile,
      afterPercentile,
      eventsBeforeCutoff: beforeCutoff.length,
      eventsAfterCutoff: afterCutoff.length,
      change,
      changeType,
    });
  }

  return results;
}

/**
 * Sort accounts by different criteria
 */
export type SortCriteria = 
  | "position"
  | "percentile" 
  | "weightedPercentile"
  | "consistency"
  | "eventsEntered"
  | "recentPerformance"
  | "improvement"
  | "compositeScore";

export function sortAccountScores(
  scores: AccountScore[],
  criteria: SortCriteria,
  ascending: boolean = true
): AccountScore[] {
  const sorted = [...scores].sort((a, b) => {
    let comparison = 0;
    
    switch (criteria) {
      case "percentile":
        comparison = a.avgPercentile - b.avgPercentile;
        break;
      case "weightedPercentile":
        comparison = a.weightedPercentile - b.weightedPercentile;
        break;
      case "consistency":
        comparison = b.consistencyScore - a.consistencyScore; // Higher = better
        break;
      case "eventsEntered":
        comparison = b.eventsEntered - a.eventsEntered; // More = better
        break;
      case "recentPerformance":
        comparison = a.recentAvgPercentile - b.recentAvgPercentile;
        break;
      case "improvement":
        comparison = b.improvementScore - a.improvementScore; // Higher = better
        break;
      case "compositeScore":
        comparison = b.scoreBreakdown.compositeScore - a.scoreBreakdown.compositeScore; // Higher = better
        break;
      default:
        comparison = a.avgPercentile - b.avgPercentile;
    }
    
    return ascending ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Rank accounts and add rank field
 */
export function rankAccountScores(
  scores: AccountScore[],
  criteria: SortCriteria
): (AccountScore & { rank: number })[] {
  const sorted = sortAccountScores(scores, criteria, true);
  return sorted.map((score, index) => ({
    ...score,
    rank: index + 1,
  }));
}
