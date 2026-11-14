/**
 * Score calculator for Spec Doctor (T7).
 * Implements the diminishing deduction algorithm to convert audit findings into a 0-100 health score.
 *
 * Algorithm:
 * - Base score: 100
 * - Base deductions per severity: Critical 15, High 8, Medium 3, Low 1
 * - Diminishing returns: within one severity level, each additional finding deducts 60% of the previous
 * - Minimum per-deduction: 1 point
 * - Floor final score: 0 (no negative scores)
 */

import { Finding } from './types';

/**
 * Breakdown of deductions by severity level.
 * Shows count of findings and total deduction for each severity.
 */
export interface DeductionBreakdown {
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  count: number;
  deductions: number[]; // Individual deductions for each finding
  totalDeducted: number; // Sum of all deductions for this severity
}

/**
 * Result of score calculation.
 * Includes the final health score and per-severity breakdown.
 */
export interface ScoreResult {
  score: number;
  breakdown: DeductionBreakdown[];
}

/**
 * Calculates a health score (0-100) from audit findings using diminishing deductions.
 *
 * Algorithm:
 * 1. Group findings by severity
 * 2. For each severity level, calculate deductions:
 *    - First finding: base deduction (Critical 15, High 8, Medium 3, Low 1)
 *    - Each subsequent finding: 60% of previous deduction, minimum 1 point
 * 3. Sum all deductions across severity levels
 * 4. Score = max(0, 100 - total_deductions)
 * 5. Return score and breakdown by severity
 *
 * @param findings Array of findings from audit
 * @returns Object with final score (0-100) and deduction breakdown
 */
export function calculateScore(findings: Finding[]): ScoreResult {
  // Base deductions per severity
  const baseDeductions: Record<'Critical' | 'High' | 'Medium' | 'Low', number> = {
    Critical: 15,
    High: 8,
    Medium: 3,
    Low: 1,
  };

  // Group findings by severity
  const findingsBySeverity: Record<string, Finding[]> = {
    Critical: [],
    High: [],
    Medium: [],
    Low: [],
  };

  findings.forEach((finding) => {
    if (findingsBySeverity[finding.severity]) {
      findingsBySeverity[finding.severity].push(finding);
    }
  });

  // Calculate deductions for each severity
  const breakdown: DeductionBreakdown[] = [];
  let totalDeduction = 0;

  (['Critical', 'High', 'Medium', 'Low'] as const).forEach((severity) => {
    const count = findingsBySeverity[severity].length;

    if (count > 0) {
      const deductions: number[] = [];
      let previousDeduction = baseDeductions[severity];

      for (let i = 0; i < count; i++) {
        if (i === 0) {
          // First finding: use base deduction
          deductions.push(previousDeduction);
        } else {
          // Subsequent findings: 60% of previous, minimum 1
          const nextDeduction = Math.max(1, Math.floor(previousDeduction * 0.6));
          deductions.push(nextDeduction);
          previousDeduction = nextDeduction;
        }
      }

      const severityTotal = deductions.reduce((sum, d) => sum + d, 0);
      totalDeduction += severityTotal;

      breakdown.push({
        severity,
        count,
        deductions,
        totalDeducted: severityTotal,
      });
    }
  });

  // Calculate final score (floor at 0)
  const score = Math.max(0, 100 - totalDeduction);

  return {
    score,
    breakdown,
  };
}
