/**
 * Comprehensive test suite for score calculator (T7).
 * Tests the diminishing deduction algorithm with exact math verification.
 */

import { describe, it, expect } from 'vitest';
import { calculateScore, DeductionBreakdown } from '../src/scoring';
import { Finding } from '../src/types';

describe('Score Calculator (T7)', () => {
  // === Helper: Create finding with specific severity ===
  const createFinding = (
    severity: 'Critical' | 'High' | 'Medium' | 'Low',
    index: number
  ): Finding => ({
    id: `finding-${severity}-${index}`,
    file: 'requirements',
    line: index,
    lineRange: [index, index],
    severity,
    category: 'Test',
    quote: `Finding ${index}`,
    message: `Test finding ${index}`,
    suggestion: 'Fix this',
  });

  describe('Base Case: No Findings', () => {
    it('should return score of 100 with no findings', () => {
      const result = calculateScore([]);
      expect(result.score).toBe(100);
      expect(result.breakdown).toHaveLength(0);
    });
  });

  describe('Single Severity: Critical', () => {
    it('should deduce 15 for first Critical finding', () => {
      const findings = [createFinding('Critical', 0)];
      const result = calculateScore(findings);

      // 100 - 15 = 85
      expect(result.score).toBe(85);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0]).toEqual({
        severity: 'Critical',
        count: 1,
        deductions: [15],
        totalDeducted: 15,
      });
    });

    it('should deduce 15, 9 for two Critical findings (60% diminishing)', () => {
      const findings = [
        createFinding('Critical', 0),
        createFinding('Critical', 1),
      ];
      const result = calculateScore(findings);

      // First: -15, Second: -floor(15 * 0.6) = -floor(9) = -9
      // Total: 100 - 15 - 9 = 76
      expect(result.score).toBe(76);
      expect(result.breakdown[0]).toEqual({
        severity: 'Critical',
        count: 2,
        deductions: [15, 9],
        totalDeducted: 24,
      });
    });

    it('should deduce 15, 9, 5 for three Critical findings', () => {
      const findings = [
        createFinding('Critical', 0),
        createFinding('Critical', 1),
        createFinding('Critical', 2),
      ];
      const result = calculateScore(findings);

      // First: -15
      // Second: -floor(15 * 0.6) = -9
      // Third: -floor(9 * 0.6) = -floor(5.4) = -5
      // Total: 100 - 15 - 9 - 5 = 71
      expect(result.score).toBe(71);
      expect(result.breakdown[0]).toEqual({
        severity: 'Critical',
        count: 3,
        deductions: [15, 9, 5],
        totalDeducted: 29,
      });
    });

    it('should maintain minimum 1 point per deduction', () => {
      // Create many Critical findings to test 1-point floor
      const findings = Array.from({ length: 10 }, (_, i) =>
        createFinding('Critical', i)
      );
      const result = calculateScore(findings);

      // Deductions: 15, 9, 5, 3, 1, 1, 1, 1, 1, 1
      // (after 3: floor(5 * 0.6) = 3, floor(3 * 0.6) = 1, then all 1)
      const expectedDeductions = [15, 9, 5, 3, 1, 1, 1, 1, 1, 1];
      const totalDeduction = expectedDeductions.reduce((a, b) => a + b);
      const expectedScore = Math.max(0, 100 - totalDeduction);

      expect(result.score).toBe(expectedScore);
      expect(result.breakdown[0].deductions).toEqual(expectedDeductions);
      expect(result.breakdown[0].totalDeducted).toBe(totalDeduction);
    });
  });

  describe('Single Severity: High', () => {
    it('should deduce 8 for first High finding', () => {
      const findings = [createFinding('High', 0)];
      const result = calculateScore(findings);

      // 100 - 8 = 92
      expect(result.score).toBe(92);
      expect(result.breakdown[0]).toEqual({
        severity: 'High',
        count: 1,
        deductions: [8],
        totalDeducted: 8,
      });
    });

    it('should deduce 8, 4 for two High findings', () => {
      const findings = [
        createFinding('High', 0),
        createFinding('High', 1),
      ];
      const result = calculateScore(findings);

      // First: -8, Second: -floor(8 * 0.6) = -floor(4.8) = -4
      // Total: 100 - 8 - 4 = 88
      expect(result.score).toBe(88);
      expect(result.breakdown[0]).toEqual({
        severity: 'High',
        count: 2,
        deductions: [8, 4],
        totalDeducted: 12,
      });
    });
  });

  describe('Single Severity: Medium', () => {
    it('should deduce 3 for first Medium finding', () => {
      const findings = [createFinding('Medium', 0)];
      const result = calculateScore(findings);

      // 100 - 3 = 97
      expect(result.score).toBe(97);
      expect(result.breakdown[0]).toEqual({
        severity: 'Medium',
        count: 1,
        deductions: [3],
        totalDeducted: 3,
      });
    });

    it('should deduce 3, 1 for two Medium findings (60% → 1 floor)', () => {
      const findings = [
        createFinding('Medium', 0),
        createFinding('Medium', 1),
      ];
      const result = calculateScore(findings);

      // First: -3, Second: -floor(3 * 0.6) = -floor(1.8) = -1
      // Total: 100 - 3 - 1 = 96
      expect(result.score).toBe(96);
      expect(result.breakdown[0]).toEqual({
        severity: 'Medium',
        count: 2,
        deductions: [3, 1],
        totalDeducted: 4,
      });
    });
  });

  describe('Single Severity: Low', () => {
    it('should deduce 1 for first Low finding', () => {
      const findings = [createFinding('Low', 0)];
      const result = calculateScore(findings);

      // 100 - 1 = 99
      expect(result.score).toBe(99);
      expect(result.breakdown[0]).toEqual({
        severity: 'Low',
        count: 1,
        deductions: [1],
        totalDeducted: 1,
      });
    });

    it('should deduce 1, 1 for two Low findings (floor at 1)', () => {
      const findings = [
        createFinding('Low', 0),
        createFinding('Low', 1),
      ];
      const result = calculateScore(findings);

      // Both: -1 (floor at 1)
      // Total: 100 - 1 - 1 = 98
      expect(result.score).toBe(98);
      expect(result.breakdown[0]).toEqual({
        severity: 'Low',
        count: 2,
        deductions: [1, 1],
        totalDeducted: 2,
      });
    });
  });

  describe('Mixed Severities', () => {
    it('should calculate independently for each severity level', () => {
      const findings = [
        createFinding('Critical', 0),
        createFinding('High', 0),
        createFinding('Medium', 0),
        createFinding('Low', 0),
      ];
      const result = calculateScore(findings);

      // Critical: -15
      // High: -8
      // Medium: -3
      // Low: -1
      // Total: 100 - 15 - 8 - 3 - 1 = 73
      expect(result.score).toBe(73);
      expect(result.breakdown).toHaveLength(4);

      const byName = new Map(result.breakdown.map((b) => [b.severity, b]));
      expect(byName.get('Critical')).toEqual({
        severity: 'Critical',
        count: 1,
        deductions: [15],
        totalDeducted: 15,
      });
      expect(byName.get('High')).toEqual({
        severity: 'High',
        count: 1,
        deductions: [8],
        totalDeducted: 8,
      });
      expect(byName.get('Medium')).toEqual({
        severity: 'Medium',
        count: 1,
        deductions: [3],
        totalDeducted: 3,
      });
      expect(byName.get('Low')).toEqual({
        severity: 'Low',
        count: 1,
        deductions: [1],
        totalDeducted: 1,
      });
    });

    it('should handle multiple of each severity with independent diminishing', () => {
      const findings = [
        createFinding('Critical', 0),
        createFinding('Critical', 1),
        createFinding('High', 0),
        createFinding('High', 1),
        createFinding('Medium', 0),
        createFinding('Low', 0),
      ];
      const result = calculateScore(findings);

      // Critical: 15 + 9 = 24
      // High: 8 + 4 = 12
      // Medium: 3 = 3
      // Low: 1 = 1
      // Total: 100 - 24 - 12 - 3 - 1 = 60
      expect(result.score).toBe(60);

      const byName = new Map(result.breakdown.map((b) => [b.severity, b]));
      expect(byName.get('Critical')?.totalDeducted).toBe(24);
      expect(byName.get('High')?.totalDeducted).toBe(12);
      expect(byName.get('Medium')?.totalDeducted).toBe(3);
      expect(byName.get('Low')?.totalDeducted).toBe(1);
    });
  });

  describe('Floor at 0 (Negative Score Prevention)', () => {
    it('should floor score at 0 when deductions exceed 100', () => {
      // Create findings to exceed 100-point deduction
      const findings = Array.from({ length: 100 }, (_, i) =>
        createFinding('Critical', i)
      );
      const result = calculateScore(findings);

      // Deductions will exceed 100, score should be 0, not negative
      expect(result.score).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct deductions even when floored at 0', () => {
      const findings = Array.from({ length: 100 }, (_, i) =>
        createFinding('Critical', i)
      );
      const result = calculateScore(findings);

      // Verify breakdown still calculates correctly
      expect(result.breakdown[0].count).toBe(100);
      expect(result.breakdown[0].deductions.length).toBe(100);
      expect(result.breakdown[0].totalDeducted).toBeGreaterThan(100);
    });
  });

  describe('Breakdown Accuracy', () => {
    it('should include all severity levels in breakdown only if they have findings', () => {
      const findings = [
        createFinding('Critical', 0),
        createFinding('Medium', 0),
      ];
      const result = calculateScore(findings);

      // Only Critical and Medium should be in breakdown
      expect(result.breakdown).toHaveLength(2);
      const severities = result.breakdown.map((b) => b.severity);
      expect(severities).toContain('Critical');
      expect(severities).toContain('Medium');
      expect(severities).not.toContain('High');
      expect(severities).not.toContain('Low');
    });

    it('should maintain correct breakdown order', () => {
      const findings = [
        createFinding('Low', 0),
        createFinding('Critical', 0),
        createFinding('High', 0),
        createFinding('Medium', 0),
      ];
      const result = calculateScore(findings);

      // Breakdown should be ordered: Critical, High, Medium, Low
      expect(result.breakdown[0].severity).toBe('Critical');
      expect(result.breakdown[1].severity).toBe('High');
      expect(result.breakdown[2].severity).toBe('Medium');
      expect(result.breakdown[3].severity).toBe('Low');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should score a small number of mixed findings correctly', () => {
      // Realistic audit result: 1 Critical, 2 High, 3 Medium, 2 Low
      const findings = [
        createFinding('Critical', 0),
        createFinding('High', 0),
        createFinding('High', 1),
        createFinding('Medium', 0),
        createFinding('Medium', 1),
        createFinding('Medium', 2),
        createFinding('Low', 0),
        createFinding('Low', 1),
      ];
      const result = calculateScore(findings);

      // Critical: 15
      // High: 8 + 4 = 12
      // Medium: 3 + 1 + 1 = 5
      // Low: 1 + 1 = 2
      // Total: 100 - 15 - 12 - 5 - 2 = 66
      expect(result.score).toBe(66);
    });

    it('should score a high-quality spec (few Low findings)', () => {
      const findings = [
        createFinding('Low', 0),
        createFinding('Low', 1),
      ];
      const result = calculateScore(findings);

      // Low: 1 + 1 = 2
      // Total: 100 - 2 = 98
      expect(result.score).toBe(98);
    });

    it('should score a poor spec (many Critical findings)', () => {
      const findings = Array.from({ length: 5 }, (_, i) =>
        createFinding('Critical', i)
      );
      const result = calculateScore(findings);

      // Critical: 15 + 9 + 5 + 3 + 1 = 33
      // Total: 100 - 33 = 67
      expect(result.score).toBe(67);
    });
  });

  describe('Exact Math Verification', () => {
    it('should verify exact diminishing calculation: 2 Critical = 76', () => {
      // From spec: "Example: Critical findings = -15, -9 (-15 × 0.6), -5.4 (-9 × 0.6)"
      // With 2 Critical: 100 - 15 - floor(15 * 0.6) = 100 - 15 - floor(9) = 100 - 15 - 9 = 76
      const findings = [
        createFinding('Critical', 0),
        createFinding('Critical', 1),
      ];
      const result = calculateScore(findings);
      expect(result.score).toBe(76);
    });

    it('should verify exact diminishing calculation: 3 Critical = 71', () => {
      // 100 - 15 - 9 - floor(9 * 0.6) = 100 - 15 - 9 - 5 = 71
      const findings = [
        createFinding('Critical', 0),
        createFinding('Critical', 1),
        createFinding('Critical', 2),
      ];
      const result = calculateScore(findings);
      expect(result.score).toBe(71);
    });

    it('should verify exact diminishing calculation: 4 Critical ≈ 66', () => {
      // 100 - 15 - 9 - 5 - floor(5 * 0.6) = 100 - 15 - 9 - 5 - 3 = 68
      const findings = Array.from({ length: 4 }, (_, i) =>
        createFinding('Critical', i)
      );
      const result = calculateScore(findings);
      // 15, 9, 5, 3 → total 32 → 100 - 32 = 68
      expect(result.score).toBe(68);
    });
  });
});
