/**
 * Dynamic tier detection algorithms for queue position analysis.
 * 
 * Instead of hard-coded percentage thresholds, these functions detect
 * natural breakpoints in the data where account quality drops off.
 */

export interface TierBoundary {
  position: number;      // The position value where the tier starts
  gapSize: number;       // Size of the gap that created this boundary
  accountsAbove: number; // Number of accounts better than this boundary
}

export interface TierDetectionResult {
  distributionType: "tiered" | "linear" | "insufficient_data";
  boundaries: TierBoundary[];
  tierLabels: string[];           // e.g., ["Elite", "Good", "Average", "Poor"]
  linearityScore: number;         // 0-1, higher = more linear
  message?: string;               // Human readable description
}

export interface DistributionStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  range: number;
  positions: number[];  // Sorted positions
}

/**
 * Calculate basic distribution statistics
 */
export function calculateDistributionStats(positions: number[]): DistributionStats {
  if (positions.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      range: 0,
      positions: [],
    };
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  // Calculate standard deviation
  const squaredDiffs = sorted.map(pos => Math.pow(pos - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return {
    count,
    min,
    max,
    mean,
    median,
    stdDev,
    range: max - min,
    positions: sorted,
  };
}

/**
 * Calculate gaps between consecutive sorted positions
 */
export function calculateGaps(sortedPositions: number[]): { index: number; gap: number; position: number }[] {
  const gaps: { index: number; gap: number; position: number }[] = [];
  
  for (let i = 1; i < sortedPositions.length; i++) {
    const gap = sortedPositions[i] - sortedPositions[i - 1];
    gaps.push({
      index: i,
      gap,
      position: sortedPositions[i],
    });
  }
  
  return gaps;
}

/**
 * Detect natural tier boundaries using gap analysis.
 * 
 * Algorithm:
 * 1. Sort positions ascending
 * 2. Calculate gaps between consecutive positions
 * 3. Find the largest gaps (these are potential tier boundaries)
 * 4. Validate that gaps are significantly larger than the median gap
 * 5. If no significant gaps, classify as linear distribution
 */
export function detectTiersGapBased(
  positions: number[],
  maxTiers: number = 4,
  significanceThreshold: number = 3.0 // Gap must be N times larger than median gap
): TierDetectionResult {
  if (positions.length < 10) {
    return {
      distributionType: "insufficient_data",
      boundaries: [],
      tierLabels: [],
      linearityScore: 0,
      message: "Need at least 10 accounts for tier detection",
    };
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const gaps = calculateGaps(sorted);
  
  if (gaps.length === 0) {
    return {
      distributionType: "insufficient_data",
      boundaries: [],
      tierLabels: [],
      linearityScore: 0,
      message: "Not enough data points",
    };
  }

  // Calculate median and mean gap
  const sortedGaps = [...gaps].sort((a, b) => a.gap - b.gap);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)].gap;
  const meanGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;

  // Find significant gaps (those much larger than median)
  const threshold = Math.max(medianGap * significanceThreshold, meanGap * 2);
  const significantGaps = gaps
    .filter(g => g.gap > threshold)
    .sort((a, b) => b.gap - a.gap) // Sort by gap size descending
    .slice(0, maxTiers - 1); // We want N-1 boundaries for N tiers

  // Calculate linearity score (how uniform are the gaps?)
  // Lower variance in gaps = more linear
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g.gap - meanGap, 2), 0) / gaps.length;
  const gapStdDev = Math.sqrt(gapVariance);
  const coefficientOfVariation = meanGap > 0 ? gapStdDev / meanGap : 0;
  
  // Linearity score: 1 = perfectly linear, 0 = highly clustered
  const linearityScore = Math.max(0, 1 - coefficientOfVariation);

  // If no significant gaps found or distribution is very linear
  if (significantGaps.length === 0 || linearityScore > 0.7) {
    return {
      distributionType: "linear",
      boundaries: [],
      tierLabels: ["All accounts (no clear tiers)"],
      linearityScore,
      message: "Distribution appears linear with no natural tier breaks",
    };
  }

  // Sort boundaries by position (ascending)
  const boundaries: TierBoundary[] = significantGaps
    .sort((a, b) => a.position - b.position)
    .map(g => ({
      position: g.position,
      gapSize: g.gap,
      accountsAbove: g.index,
    }));

  // Generate tier labels based on number of boundaries
  const tierCount = boundaries.length + 1;
  const tierLabels = generateTierLabels(tierCount);

  return {
    distributionType: "tiered",
    boundaries,
    tierLabels,
    linearityScore,
    message: `Detected ${tierCount} natural tiers with ${boundaries.length} significant break${boundaries.length > 1 ? 's' : ''}`,
  };
}

/**
 * Jenks Natural Breaks optimization (simplified version).
 * 
 * This algorithm minimizes within-class variance while maximizing
 * between-class variance to find natural groupings.
 */
export function detectTiersJenks(
  positions: number[],
  numClasses: number = 4
): TierDetectionResult {
  if (positions.length < numClasses * 2) {
    return {
      distributionType: "insufficient_data",
      boundaries: [],
      tierLabels: [],
      linearityScore: 0,
      message: `Need at least ${numClasses * 2} accounts for ${numClasses} classes`,
    };
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const n = sorted.length;

  // For small datasets, fall back to gap-based
  if (n < 20) {
    return detectTiersGapBased(positions, numClasses);
  }

  // Initialize matrices for dynamic programming
  const mat1: number[][] = Array(n + 1).fill(null).map(() => Array(numClasses + 1).fill(0));
  const mat2: number[][] = Array(n + 1).fill(null).map(() => Array(numClasses + 1).fill(0));

  for (let i = 1; i <= numClasses; i++) {
    mat1[1][i] = 1;
    mat2[1][i] = 0;
    for (let j = 2; j <= n; j++) {
      mat2[j][i] = Infinity;
    }
  }

  // Build variance matrix
  const variance: number[][] = Array(n + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    let sum = 0;
    let sumSquares = 0;
    for (let j = i; j <= n; j++) {
      const val = sorted[j - 1];
      sum += val;
      sumSquares += val * val;
      const count = j - i + 1;
      variance[i][j] = sumSquares - (sum * sum) / count;
    }
  }

  // Find optimal breaks using dynamic programming
  for (let l = 2; l <= n; l++) {
    for (let m = 2; m <= Math.min(l, numClasses); m++) {
      for (let i = 1; i <= l - 1; i++) {
        const v = mat2[i][m - 1] + variance[i + 1][l];
        if (v < mat2[l][m]) {
          mat2[l][m] = v;
          mat1[l][m] = i;
        }
      }
    }
  }

  // Extract break points
  const breaks: number[] = [];
  let k = n;
  for (let j = numClasses; j >= 2; j--) {
    const id = mat1[k][j];
    breaks.unshift(sorted[id]);
    k = id;
  }

  // Convert breaks to boundaries
  const boundaries: TierBoundary[] = breaks.map((pos, idx) => {
    const accountsAbove = sorted.filter(p => p < pos).length;
    const prevBreak = idx > 0 ? breaks[idx - 1] : sorted[0];
    return {
      position: pos,
      gapSize: pos - prevBreak,
      accountsAbove,
    };
  });

  // Calculate linearity score
  const gaps = calculateGaps(sorted);
  const meanGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;
  const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g.gap - meanGap, 2), 0) / gaps.length;
  const gapStdDev = Math.sqrt(gapVariance);
  const linearityScore = Math.max(0, 1 - (meanGap > 0 ? gapStdDev / meanGap : 0));

  const tierLabels = generateTierLabels(numClasses);

  return {
    distributionType: linearityScore > 0.7 ? "linear" : "tiered",
    boundaries,
    tierLabels,
    linearityScore,
    message: `Jenks optimization found ${numClasses} natural classes`,
  };
}

/**
 * Generate tier labels based on count
 */
function generateTierLabels(count: number): string[] {
  if (count === 1) return ["All"];
  if (count === 2) return ["Good", "Poor"];
  if (count === 3) return ["Top Tier", "Average", "Poor"];
  if (count === 4) return ["Elite", "Good", "Average", "Poor"];
  if (count === 5) return ["Elite", "Good", "Average", "Below Average", "Poor"];
  
  // Generic labels for more tiers
  return Array.from({ length: count }, (_, i) => `Tier ${i + 1}`);
}

/**
 * Assign tier to a position based on detected boundaries
 */
export function assignTier(
  position: number,
  result: TierDetectionResult
): { tier: number; label: string } {
  if (result.distributionType !== "tiered" || result.boundaries.length === 0) {
    return { tier: 0, label: result.tierLabels[0] || "Unknown" };
  }

  // Find which tier this position falls into
  let tier = 0;
  for (const boundary of result.boundaries) {
    if (position >= boundary.position) {
      tier++;
    } else {
      break;
    }
  }

  return {
    tier,
    label: result.tierLabels[tier] || `Tier ${tier + 1}`,
  };
}

/**
 * Calculate percentile for a position within a set.
 * 
 * Lower percentile = BETTER (top performer)
 * - 0% = best position (no one is better)
 * - 100% = worst position (everyone is better)
 * 
 * Example: If you're position #29,576 and only 2 accounts have lower positions,
 * your percentile is 2/540 = 0.37% (you're in the top 0.37%)
 */
export function calculatePercentile(position: number, sortedPositions: number[]): number {
  if (sortedPositions.length === 0) return 0;
  if (sortedPositions.length === 1) return 0; // Only one account = you're the best
  
  // Find how many positions are better (lower = better in queue)
  const betterCount = sortedPositions.filter(p => p < position).length;
  
  // Percentile: what percentage of accounts are BETTER than you
  // Lower percentile = top performer (fewer accounts are better)
  return (betterCount / sortedPositions.length) * 100;
}

/**
 * Get histogram data for visualization
 */
export function getHistogramData(
  positions: number[],
  bucketCount: number = 20
): { bucket: string; count: number; start: number; end: number }[] {
  if (positions.length === 0) return [];

  const sorted = [...positions].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const bucketSize = range / bucketCount;

  const histogram: { bucket: string; count: number; start: number; end: number }[] = [];
  
  for (let i = 0; i < bucketCount; i++) {
    const start = min + i * bucketSize;
    const end = min + (i + 1) * bucketSize;
    const count = sorted.filter(p => p >= start && (i === bucketCount - 1 ? p <= end : p < end)).length;
    
    histogram.push({
      bucket: `${Math.round(start / 1000)}k-${Math.round(end / 1000)}k`,
      count,
      start,
      end,
    });
  }

  return histogram;
}

/**
 * Get scatter plot data for visualization (rank vs position)
 */
export function getScatterData(
  positions: number[]
): { rank: number; position: number }[] {
  return [...positions]
    .sort((a, b) => a - b)
    .map((position, index) => ({
      rank: index + 1,
      position,
    }));
}
