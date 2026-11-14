/**
 * Test suite for report generator (T8).
 * Tests JSON and Markdown output formats with various audit report scenarios.
 */

import { describe, it, expect } from 'vitest';
import { generateJSON, generateMarkdown, buildExportFilename } from '../src/report';
import { ExtendedAuditReport, CoverageNote } from '../src/engine';
import { Finding, SpecFile, DeductionBreakdown } from '../src/types';

/**
 * Helper to create a minimal valid ExtendedAuditReport for testing.
 */
function createMinimalReport(overrides?: Partial<ExtendedAuditReport>): ExtendedAuditReport {
  const timestamp = new Date('2024-01-15T10:30:00Z');

  const report: ExtendedAuditReport = {
    health: 100,
    timestamp,
    files: [],
    findings: [],
    summary: {
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    coverage: [],
    breakdown: [],
    ...overrides,
  };

  return report;
}

/**
 * Helper to create a test finding.
 */
function createFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: 'test-finding-1',
    file: 'requirements',
    line: 10,
    lineRange: [10, 15],
    severity: 'High',
    category: 'Test Category',
    quote: 'Example quote text',
    message: 'This is a test message',
    suggestion: 'Here is how to fix it',
    ...overrides,
  };
}

/**
 * Helper to create a test SpecFile.
 */
function createSpecFile(overrides?: Partial<SpecFile>): SpecFile {
  return {
    type: 'requirements',
    name: 'requirements.md',
    content: 'Sample content here',
    lines: ['Sample content here'],
    characterCount: 19,
    uploadedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('generateJSON', () => {
  it('should parse JSON output successfully', () => {
    const report = createMinimalReport({
      health: 85,
      summary: {
        totalFindings: 1,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed).toBeDefined();
    expect(parsed.health).toBe(85);
    expect(parsed.timestamp).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should include health score in JSON', () => {
    const report = createMinimalReport({ health: 72 });
    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.health).toBe(72);
  });

  it('should include all findings in JSON', () => {
    const finding1 = createFinding({ id: 'f1', severity: 'Critical' });
    const finding2 = createFinding({ id: 'f2', severity: 'High', line: 20 });

    const report = createMinimalReport({
      findings: [finding1, finding2],
      summary: {
        totalFindings: 2,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0].id).toBe('f1');
    expect(parsed.findings[0].severity).toBe('Critical');
    expect(parsed.findings[1].id).toBe('f2');
    expect(parsed.findings[1].severity).toBe('High');
  });

  it('should preserve finding quote and suggestion', () => {
    const finding = createFinding({
      quote: 'may and might be used',
      suggestion: 'Replace with precise language',
    });

    const report = createMinimalReport({
      findings: [finding],
    });

    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.findings[0].quote).toBe('may and might be used');
    expect(parsed.findings[0].suggestion).toBe('Replace with precise language');
  });

  it('should include breakdown in JSON', () => {
    const breakdown: DeductionBreakdown[] = [
      {
        severity: 'Critical',
        count: 2,
        deductions: [15, 9],
        totalDeducted: 24,
      },
      {
        severity: 'High',
        count: 1,
        deductions: [8],
        totalDeducted: 8,
      },
    ];

    const report = createMinimalReport({ breakdown });
    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.breakdown).toHaveLength(2);
    expect(parsed.breakdown[0].severity).toBe('Critical');
    expect(parsed.breakdown[0].totalDeducted).toBe(24);
    expect(parsed.breakdown[1].severity).toBe('High');
    expect(parsed.breakdown[1].totalDeducted).toBe(8);
  });

  it('should include coverage notes in JSON', () => {
    const coverage: CoverageNote[] = [
      {
        checkName: 'Requirement-Task Linking',
        reason: 'tasks.md not provided',
        skipped: true,
      },
    ];

    const report = createMinimalReport({ coverage });
    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.coverage).toHaveLength(1);
    expect(parsed.coverage[0].checkName).toBe('Requirement-Task Linking');
    expect(parsed.coverage[0].skipped).toBe(true);
  });

  it('should include LLM findings if present', () => {
    const report = createMinimalReport();
    (report as any).llmFindings = [
      'Consider adding more detail to the error handling section',
      'Task T3 could be broken into smaller subtasks',
    ];

    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.llmFindings).toHaveLength(2);
    expect(parsed.llmFindings[0]).toBe(
      'Consider adding more detail to the error handling section'
    );
  });

  it('should handle timestamp conversion to ISO format', () => {
    const timestamp = new Date('2024-06-20T14:45:30Z');
    const report = createMinimalReport({ timestamp });

    const json = generateJSON(report);
    const parsed = JSON.parse(json);

    expect(parsed.timestamp).toBe('2024-06-20T14:45:30.000Z');
  });

  it('should use 2-space indentation', () => {
    const report = createMinimalReport({ health: 95 });
    const json = generateJSON(report);

    // Check that the JSON uses 2-space indentation
    expect(json).toContain('  "health"');
    expect(json).toContain('  "timestamp"');
  });
});

describe('generateMarkdown', () => {
  it('should include title and health score', () => {
    const report = createMinimalReport({ health: 88 });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('# Spec Doctor Audit Report');
    expect(markdown).toContain('## Health Score: 88/100');
  });

  it('should include health score interpretation', () => {
    let markdown = generateMarkdown(createMinimalReport({ health: 95 }));
    expect(markdown).toContain('Excellent');

    markdown = generateMarkdown(createMinimalReport({ health: 75 }));
    expect(markdown).toContain('Good');

    markdown = generateMarkdown(createMinimalReport({ health: 50 }));
    expect(markdown).toContain('Needs Improvement');
  });

  it('should include summary section with finding counts', () => {
    const report = createMinimalReport({
      summary: {
        totalFindings: 5,
        criticalCount: 1,
        highCount: 2,
        mediumCount: 1,
        lowCount: 1,
      },
    });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('Total Findings:** 5');
    expect(markdown).toContain('Critical:** 1');
    expect(markdown).toContain('High:** 2');
    expect(markdown).toContain('Medium:** 1');
    expect(markdown).toContain('Low:** 1');
  });

  it('should include per-severity deduction breakdown', () => {
    const breakdown: DeductionBreakdown[] = [
      {
        severity: 'Critical',
        count: 2,
        deductions: [15, 9],
        totalDeducted: 24,
      },
      {
        severity: 'High',
        count: 3,
        deductions: [8, 5, 3],
        totalDeducted: 16,
      },
    ];

    const report = createMinimalReport({ breakdown });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## Score Deductions');
    expect(markdown).toContain('### Critical (2 findings)');
    expect(markdown).toContain('Deductions: -15, -9 = **-24** total');
    expect(markdown).toContain('### High (3 findings)');
    expect(markdown).toContain('Deductions: -8, -5, -3 = **-16** total');
  });

  it('should display "no deductions" when breakdown is empty', () => {
    const report = createMinimalReport({ breakdown: [] });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('No deductions applied. Score at maximum.');
  });

  it('should render empty findings state', () => {
    const report = createMinimalReport({
      findings: [],
      summary: {
        totalFindings: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('✓ No findings');
    expect(markdown).toContain('Your specifications are well-formed!');
  });

  it('should group findings by file', () => {
    const reqFinding = createFinding({
      id: 'f1',
      file: 'requirements',
      line: 10,
      quote: 'may be used',
    });
    const designFinding = createFinding({
      id: 'f2',
      file: 'design',
      line: 5,
      quote: 'missing error handling',
    });
    const taskFinding = createFinding({
      id: 'f3',
      file: 'tasks',
      line: 20,
      quote: 'oversized task',
    });

    const report = createMinimalReport({
      findings: [reqFinding, designFinding, taskFinding],
      summary: {
        totalFindings: 3,
        criticalCount: 0,
        highCount: 3,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('### requirements.md');
    expect(markdown).toContain('### design.md');
    expect(markdown).toContain('### tasks.md');
  });

  it('should sort findings by line number within each file', () => {
    const finding1 = createFinding({
      id: 'f1',
      file: 'requirements',
      line: 20,
      quote: 'Later finding',
    });
    const finding2 = createFinding({
      id: 'f2',
      file: 'requirements',
      line: 5,
      quote: 'Earlier finding',
    });

    const report = createMinimalReport({
      findings: [finding1, finding2], // Add in reverse order
      summary: {
        totalFindings: 2,
        criticalCount: 0,
        highCount: 2,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const markdown = generateMarkdown(report);

    // Earlier finding should appear first
    const earlierIndex = markdown.indexOf('Earlier finding');
    const laterIndex = markdown.indexOf('Later finding');
    expect(earlierIndex).toBeLessThan(laterIndex);
  });

  it('should include finding severity, line, quote, message, and suggestion', () => {
    const finding = createFinding({
      severity: 'Critical',
      line: 42,
      quote: 'user should be happy',
      message: 'Untestable acceptance criterion',
      suggestion: 'Rephrase with measurable success criteria',
    });

    const report = createMinimalReport({
      findings: [finding],
      summary: {
        totalFindings: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('[Critical]');
    expect(markdown).toContain('Line 42');
    expect(markdown).toContain('user should be happy');
    expect(markdown).toContain('Untestable acceptance criterion');
    expect(markdown).toContain('Rephrase with measurable success criteria');
  });

  it('should include coverage section with skipped checks', () => {
    const coverage: CoverageNote[] = [
      {
        checkName: 'Requirement-Task Linking',
        reason: 'tasks.md not provided',
        skipped: true,
      },
      {
        checkName: 'Cross-file validation',
        reason: 'Only 1 file provided',
        skipped: true,
      },
    ];

    const report = createMinimalReport({ coverage });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## Coverage Notes');
    expect(markdown).toContain('Requirement-Task Linking');
    expect(markdown).toContain('tasks.md not provided');
    expect(markdown).toContain('Cross-file validation');
    expect(markdown).toContain('Only 1 file provided');
  });

  it('should not include coverage section if no skipped checks', () => {
    const report = createMinimalReport({
      coverage: [
        {
          checkName: 'Test',
          reason: 'Not skipped',
          skipped: false,
        },
      ],
    });

    const markdown = generateMarkdown(report);

    expect(markdown).not.toContain('## Coverage Notes');
  });

  it('should include LLM findings section when present', () => {
    const report = createMinimalReport();
    (report as any).llmFindings = [
      'Consider restructuring the data model section',
      'The error handling strategy could be more comprehensive',
    ];

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## LLM Suggestions');
    expect(markdown).toContain('⚠️');
    expect(markdown).toContain('Consider restructuring the data model section');
    expect(markdown).toContain('The error handling strategy could be more comprehensive');
    expect(markdown).toContain('do not affect the deterministic health score');
  });

  it('should not include LLM section when no LLM findings', () => {
    const report = createMinimalReport();
    const markdown = generateMarkdown(report);

    expect(markdown).not.toContain('## LLM Suggestions');
  });

  it('should include files audited section', () => {
    const file1 = createSpecFile({
      name: 'requirements.md',
      characterCount: 1500,
    });
    const file2 = createSpecFile({
      type: 'design',
      name: 'design.md',
      characterCount: 2300,
    });

    const report = createMinimalReport({
      files: [file1, file2],
    });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('## Files Audited');
    expect(markdown).toContain('requirements.md');
    expect(markdown).toContain('1500 characters');
    expect(markdown).toContain('design.md');
    expect(markdown).toContain('2300 characters');
  });

  it('should escape markdown special characters in quotes', () => {
    const finding = createFinding({
      quote: 'Requirements: [GIVEN when *user* logs in]',
      message: 'Issue with **bold** text',
      suggestion: 'Use _proper_ format | fix it',
    });

    const report = createMinimalReport({
      findings: [finding],
      summary: {
        totalFindings: 1,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const markdown = generateMarkdown(report);

    // Check that markdown special chars are escaped
    expect(markdown).toContain('\\*');
    expect(markdown).toContain('\\_');
    expect(markdown).toContain('\\[');
    expect(markdown).toContain('\\|');
  });

  it('should include timestamp', () => {
    const timestamp = new Date('2024-03-22T15:45:30Z');
    const report = createMinimalReport({ timestamp });

    const markdown = generateMarkdown(report);

    expect(markdown).toContain('2024-03-22T15:45:30.000Z');
  });

  it('should handle multiple findings with mixed severities', () => {
    const findings: Finding[] = [
      createFinding({ id: 'f1', file: 'requirements', severity: 'Critical', line: 5 }),
      createFinding({ id: 'f2', file: 'requirements', severity: 'High', line: 10 }),
      createFinding({ id: 'f3', file: 'design', severity: 'Medium', line: 15 }),
      createFinding({ id: 'f4', file: 'design', severity: 'Low', line: 20 }),
      createFinding({ id: 'f5', file: 'tasks', severity: 'High', line: 25 }),
    ];

    const report = createMinimalReport({
      findings,
      summary: {
        totalFindings: 5,
        criticalCount: 1,
        highCount: 2,
        mediumCount: 1,
        lowCount: 1,
      },
    });

    const markdown = generateMarkdown(report);

    // All findings should be present
    expect(markdown).toContain('[Critical]');
    expect(markdown).toContain('[High]');
    expect(markdown).toContain('[Medium]');
    expect(markdown).toContain('[Low]');

    // All files should be grouped
    expect(markdown).toContain('### requirements.md');
    expect(markdown).toContain('### design.md');
    expect(markdown).toContain('### tasks.md');
  });

  it('should use singular "finding" when count is 1', () => {
    const breakdown: DeductionBreakdown[] = [
      {
        severity: 'Low',
        count: 1,
        deductions: [1],
        totalDeducted: 1,
      },
    ];

    const report = createMinimalReport({ breakdown });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('(1 finding)');
    expect(markdown).not.toContain('(1 findings)');
  });

  it('should use plural "findings" when count > 1', () => {
    const breakdown: DeductionBreakdown[] = [
      {
        severity: 'Low',
        count: 3,
        deductions: [1, 1, 1],
        totalDeducted: 3,
      },
    ];

    const report = createMinimalReport({ breakdown });
    const markdown = generateMarkdown(report);

    expect(markdown).toContain('(3 findings)');
  });
});

describe('buildExportFilename', () => {
  it('should produce correct timestamp format for JSON with fixed date', () => {
    const date = new Date('2026-11-14T07:51:15Z');
    const filename = buildExportFilename('json', date);
    expect(filename).toBe('spec-doctor-report-2026-11-14T075115Z.json');
  });

  it('should produce correct timestamp format for Markdown with fixed date', () => {
    const date = new Date('2026-11-14T07:51:15Z');
    const filename = buildExportFilename('md', date);
    expect(filename).toBe('spec-doctor-report-2026-11-14T075115Z.md');
  });

  it('should produce filename matching pattern when no date provided', () => {
    const filename = buildExportFilename('json');
    expect(filename).toMatch(/^spec-doctor-report-\d{4}-\d{2}-\d{2}T\d{6}Z\.json$/);
  });

  it('should produce filename matching pattern for markdown when no date provided', () => {
    const filename = buildExportFilename('md');
    expect(filename).toMatch(/^spec-doctor-report-\d{4}-\d{2}-\d{2}T\d{6}Z\.md$/);
  });
});

describe('Report generation end-to-end', () => {
  it('should generate both JSON and Markdown for the same report', () => {
    const finding = createFinding({
      id: 'f1',
      file: 'requirements',
      severity: 'High',
      quote: 'may or might',
    });

    const report = createMinimalReport({
      health: 85,
      findings: [finding],
      summary: {
        totalFindings: 1,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const json = generateJSON(report);
    const markdown = generateMarkdown(report);

    // Both should be valid and contain the health score
    const parsedJson = JSON.parse(json);
    expect(parsedJson.health).toBe(85);
    expect(markdown).toContain('85');

    // Both should contain the finding
    expect(parsedJson.findings).toHaveLength(1);
    expect(markdown).toContain('may or might');
  });

  it('should handle report with all finding severity levels', () => {
    const findings: Finding[] = [
      createFinding({
        id: 'f1',
        severity: 'Critical',
        quote: 'Critical issue',
      }),
      createFinding({
        id: 'f2',
        severity: 'High',
        quote: 'High issue',
      }),
      createFinding({
        id: 'f3',
        severity: 'Medium',
        quote: 'Medium issue',
      }),
      createFinding({
        id: 'f4',
        severity: 'Low',
        quote: 'Low issue',
      }),
    ];

    const breakdown: DeductionBreakdown[] = [
      { severity: 'Critical', count: 1, deductions: [15], totalDeducted: 15 },
      { severity: 'High', count: 1, deductions: [8], totalDeducted: 8 },
      { severity: 'Medium', count: 1, deductions: [3], totalDeducted: 3 },
      { severity: 'Low', count: 1, deductions: [1], totalDeducted: 1 },
    ];

    const report = createMinimalReport({
      health: 72,
      findings,
      breakdown,
      summary: {
        totalFindings: 4,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 1,
        lowCount: 1,
      },
    });

    const json = generateJSON(report);
    const markdown = generateMarkdown(report);

    const parsed = JSON.parse(json);

    // JSON should contain all findings
    expect(parsed.findings).toHaveLength(4);
    expect(parsed.breakdown).toHaveLength(4);

    // Markdown should contain all severity levels
    expect(markdown).toContain('[Critical]');
    expect(markdown).toContain('[High]');
    expect(markdown).toContain('[Medium]');
    expect(markdown).toContain('[Low]');
  });
});
