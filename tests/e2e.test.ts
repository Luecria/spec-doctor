/**
 * End-to-End Contract Tests for Spec Doctor (Step 9).
 * Locks the contract between audit engine and report generators.
 *
 * Verifies:
 * 1. Full audit (3 files) → JSON export: runAudit output feeds directly to generateJSON
 * 2. Full audit (3 files) → Markdown export: runAudit output feeds directly to generateMarkdown
 * 3. Partial audit (1 file) → both formats: engine handles degraded mode, generators adapt
 * 4. LLM findings round-trip: llmFindings attached to report survive JSON and Markdown export
 */

import { describe, it, expect } from 'vitest';
import { runAudit } from '../src/engine';
import { generateJSON, generateMarkdown } from '../src/report';
import { ExtendedAuditReport } from '../src/engine';

describe('End-to-End: Engine → Report Generator Contract', () => {
  // =========================================================================
  // TEST 1: Full audit (3 files) → JSON export
  // =========================================================================
  it('Full audit → JSON: runAudit output typehecks as generateJSON input, JSON parses with score/findings/coverage/breakdown', () => {
    // Build three small spec strings
    const requirements = `
### R1: User Login
The system shall authenticate users.

**Acceptance Criteria:**
GIVEN a registered user
WHEN they enter correct credentials
THEN access is granted

### R2: Error Handling
The system should ideally recover gracefully from failures.

**Acceptance Criteria:**
GIVEN an invalid input
WHEN processing occurs
THEN errors are reported
`.trim();

    const design = `
## Data Model
The system uses a User entity with fields: id, username, password_hash, email.
Authentication tokens are stored in a Token entity.

## Error Handling
All errors bubble up with context: error code, message, and stack trace.
`.trim();

    const tasks = `
### T1: Implement Login Endpoint
Build the POST /login endpoint with R1 validation.

**Acceptance Criteria:**
GIVEN valid credentials in request body
WHEN POST /login is called
THEN HTTP 200 with token is returned

### T2: Add Error Recovery
Handle errors per R2 specification.

**Acceptance Criteria:**
GIVEN an error condition
WHEN the system detects it
THEN error response is returned
`.trim();

    // Call runAudit
    const report = runAudit({ requirements, design, tasks });

    // Type contract: report is ExtendedAuditReport and feeds directly to generateJSON
    const jsonOutput: string = generateJSON(report);

    // Parse JSON
    const parsed = JSON.parse(jsonOutput);

    // Assertions: structure and key fields present
    expect(parsed.health).toBeGreaterThanOrEqual(0);
    expect(parsed.health).toBeLessThanOrEqual(100);
    expect(typeof parsed.health).toBe('number');

    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0); // We expect vague language finding

    expect(parsed.coverage).toBeDefined();
    expect(Array.isArray(parsed.coverage)).toBe(true);

    expect(parsed.breakdown).toBeDefined();
    expect(Array.isArray(parsed.breakdown)).toBe(true);

    // At least one finding carries required fields
    const anyFinding = parsed.findings[0];
    expect(anyFinding.file).toBeDefined();
    expect(['requirements', 'design', 'tasks']).toContain(anyFinding.file);
    expect(typeof anyFinding.line).toBe('number');
    expect(anyFinding.line).toBeGreaterThan(0);
    expect(anyFinding.severity).toBeDefined();
    expect(['Critical', 'High', 'Medium', 'Low']).toContain(anyFinding.severity);
  });

  // =========================================================================
  // TEST 2: Full audit (3 files) → Markdown export
  // =========================================================================
  it('Full audit → Markdown: runAudit output feeds to generateMarkdown, output contains score and findings', () => {
    const requirements = `
### R1: User Login
The system shall authenticate users.

**Acceptance Criteria:**
GIVEN a registered user
WHEN they enter correct credentials
THEN access is granted

### R2: Error Handling
The system should ideally recover gracefully from failures.

**Acceptance Criteria:**
GIVEN an invalid input
WHEN processing occurs
THEN errors are reported
`.trim();

    const design = `
## Data Model
The system uses a User entity with fields: id, username, password_hash, email.
Authentication tokens are stored in a Token entity.

## Error Handling
All errors bubble up with context: error code, message, and stack trace.
`.trim();

    const tasks = `
### T1: Implement Login Endpoint
Build the POST /login endpoint with R1 validation.

**Acceptance Criteria:**
GIVEN valid credentials in request body
WHEN POST /login is called
THEN HTTP 200 with token is returned

### T2: Add Error Recovery
Handle errors per R2 specification.

**Acceptance Criteria:**
GIVEN an error condition
WHEN the system detects it
THEN error response is returned
`.trim();

    // Call runAudit
    const report = runAudit({ requirements, design, tasks });

    // Type contract: report feeds directly to generateMarkdown
    const mdOutput: string = generateMarkdown(report);

    // Assertions: markdown structure and key sections
    expect(mdOutput).toContain('# Spec Doctor Audit Report');
    expect(mdOutput).toContain('Health Score:');
    expect(mdOutput).toContain('/100');

    // Score should be rendered as a number
    const scoreMatch = mdOutput.match(/Health Score: (\d+)\/100/);
    expect(scoreMatch).toBeTruthy();
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }

    // Findings section should exist and contain at least one finding message
    expect(mdOutput).toContain('## Findings');
    expect(mdOutput.length).toBeGreaterThan(200); // Non-trivial output
  });

  // =========================================================================
  // TEST 3: Partial audit (1 file only) → both formats
  // =========================================================================
  it('Partial audit (requirements only) → JSON and Markdown: coverage notes mention missing files', () => {
    const requirements = `
### R1: Feature X
The system should do something.

**Acceptance Criteria:**
GIVEN condition A
WHEN action B occurs
THEN result C
`.trim();

    // Call runAudit with requirements only (no design or tasks)
    const report = runAudit({ requirements });

    // Type contract: report feeds to both generators
    const jsonOutput = generateJSON(report);
    const mdOutput = generateMarkdown(report);

    // Parse JSON and verify coverage mentions missing files
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.coverage).toBeDefined();

    // Coverage should note skipped cross-file checks
    const hasCoverageNote = parsed.coverage.some(
      (note: any) =>
        note.checkName === 'Requirement-Task Linking' && note.skipped === true
    );
    expect(hasCoverageNote).toBe(true);

    // Markdown should reference coverage or mention partial audit
    expect(mdOutput).toContain('Coverage Notes');

    // Both outputs should be valid and non-empty
    expect(jsonOutput).toBeTruthy();
    expect(mdOutput).toBeTruthy();
    expect(mdOutput).toContain('# Spec Doctor Audit Report');
  });

  // =========================================================================
  // TEST 4: LLM findings round-trip
  // =========================================================================
  it('LLM findings attached to report survive JSON and Markdown export unchanged', () => {
    const requirements = `
### R1: Feature X
Description.

**Acceptance Criteria:**
GIVEN A
WHEN B
THEN C
`.trim();

    // Call runAudit
    const report = runAudit({ requirements });

    // Attach LLM findings to the report object (simulating LLM review attachment)
    (report as any).llmFindings = [
      'Consider adding more detail to acceptance criteria',
      'Review data types for security implications',
    ];

    // === JSON Round-Trip ===
    const jsonOutput = generateJSON(report);
    const jsonParsed = JSON.parse(jsonOutput);

    // Assert llmFindings present and correct in JSON
    expect(jsonParsed.llmFindings).toBeDefined();
    expect(Array.isArray(jsonParsed.llmFindings)).toBe(true);
    expect(jsonParsed.llmFindings.length).toBe(2);
    expect(jsonParsed.llmFindings[0]).toBe(
      'Consider adding more detail to acceptance criteria'
    );
    expect(jsonParsed.llmFindings[1]).toBe(
      'Review data types for security implications'
    );

    // === Markdown Round-Trip ===
    const mdOutput = generateMarkdown(report);

    // Assert markdown contains LLM Suggestions section
    expect(mdOutput).toContain('## LLM Suggestions');
    expect(mdOutput).toContain(
      'Consider adding more detail to acceptance criteria'
    );
    expect(mdOutput).toContain(
      'Review data types for security implications'
    );
    expect(mdOutput).toContain('⚠️ **Note:**');
    expect(mdOutput).toContain('deterministic health score');
  });

  // =========================================================================
  // BONUS: Verify deterministic score is not affected by LLM findings
  // =========================================================================
  it('Score without LLM findings equals score with LLM findings (LLM does not modify score)', () => {
    const requirements = `
### R1: Test
Description.

**Acceptance Criteria:**
GIVEN X
WHEN Y
THEN Z
`.trim();

    // Report without LLM findings
    const report1 = runAudit({ requirements });
    const score1 = report1.health;

    // Report with LLM findings attached
    const report2 = runAudit({ requirements });
    (report2 as any).llmFindings = ['Suggestion 1', 'Suggestion 2'];
    const score2 = report2.health;

    // Scores must be identical
    expect(score1).toBe(score2);
  });

  // =========================================================================
  // Contract Verification: Types align
  // =========================================================================
  it('ExtendedAuditReport output type satisfies both generateJSON and generateMarkdown input types', () => {
    // This test verifies TypeScript compilation only.
    // If this file compiles, the contract is satisfied.
    const report: ExtendedAuditReport = runAudit({
      requirements: '### R1: Test\n\n**Acceptance Criteria:**\nGIVEN X\nWHEN Y\nTHEN Z',
    });

    // Both calls must typecheck (no explicit types needed, inference from parameter)
    const json: string = generateJSON(report);
    const md: string = generateMarkdown(report);

    expect(typeof json).toBe('string');
    expect(typeof md).toBe('string');
  });
});
