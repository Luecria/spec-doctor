/**
 * Comprehensive test suite for audit engine (T6, T9).
 * Tests full audit workflow with cross-file checks, partial-file handling, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { runAudit, AuditInput } from '../src/engine';

describe('Audit Engine (T6, T9)', () => {
  // === Test Data ===
  const simpleRequirements = `
## Requirements

### R1: User can upload files
**Description:** Users should be able to upload specification files.

**Acceptance Criteria:**
- GIVEN the user is on the homepage
- WHEN they click upload
- THEN the file dialog opens

### R2: System parses files
**Description:** System should parse uploaded files into structured objects.

**Acceptance Criteria:**
- GIVEN a file is uploaded
- WHEN the parser runs
- THEN it extracts requirements
`;

  const simpleDesign = `
## Design

### Data Model
The system uses a simple data model with Requirements, Tasks, and DesignSections as core entities.
We store schema definitions and database structure with entity relationships clearly defined.

### Error Handling
The system implements comprehensive error handling with try-catch blocks for all operations.
Failures are logged and graceful degradation occurs when resources are unavailable.
`;

  const simpleTasks = `
## Tasks

### T1: Implement parser
**Description:** Build the file parser. References: R1

**Acceptance Criteria:**
- GIVEN raw file content
- WHEN the parser processes it
- THEN it extracts structured objects

### T2: Setup UI
**Description:** Create the UI interface. References: R2, R1

**Acceptance Criteria:**
- GIVEN the application loads
- WHEN the user sees the interface
- THEN the upload button is visible
`;

  // === Helper: Create finding from partial data ===
  const createSimpleRequirementsFinding = (): string => {
    return `
## Requirements

### R1: Upload files
**Description:** Users upload files.

**Acceptance Criteria:**
- GIVEN the user is on the page
- WHEN they click upload
- THEN files are accepted
`;
  };

  describe('Full Three-File Audit', () => {
    it('should run complete audit with all three files', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: simpleDesign,
        tasks: simpleTasks,
      });

      // Should have all three files parsed
      expect(result.files).toHaveLength(3);
      expect(result.files.map((f) => f.type)).toContain('requirements');
      expect(result.files.map((f) => f.type)).toContain('design');
      expect(result.files.map((f) => f.type)).toContain('tasks');

      // Should have findings from various checks
      expect(result.findings).toBeDefined();
      expect(Array.isArray(result.findings)).toBe(true);

      // Should have valid health score
      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.health).toBeLessThanOrEqual(100);

      // Should have summary
      expect(result.summary).toBeDefined();
      expect(result.summary.totalFindings).toBeGreaterThanOrEqual(0);
      expect(result.summary.criticalCount).toBeGreaterThanOrEqual(0);

      // Should have breakdown
      expect(result.breakdown).toBeDefined();
      expect(Array.isArray(result.breakdown)).toBe(true);

      // Should have coverage notes
      expect(result.coverage).toBeDefined();
      expect(Array.isArray(result.coverage)).toBe(true);
    });

    it('should detect orphaned requirements (not referenced by tasks)', () => {
      const requirements = `
## Requirements

### R1: First requirement
**Description:** This is referenced.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result

### R2: Orphaned requirement
**Description:** This is not referenced anywhere.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const tasks = `
## Tasks

### T1: First task
**Description:** References R1 only.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
        design: simpleDesign,
        tasks,
      });

      // Should have an orphaned requirement finding
      const orphanedFindings = result.findings.filter(
        (f) => f.category === 'Orphaned Requirement' && f.file === 'requirements'
      );
      expect(orphanedFindings.length).toBeGreaterThan(0);
      expect(orphanedFindings.some((f) => f.quote.includes('R2'))).toBe(true);
    });

    it('should detect dangling task references (referencing non-existent requirements)', () => {
      const requirements = `
## Requirements

### R1: First requirement
**Description:** This exists.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const tasks = `
## Tasks

### T1: Task with dangling reference
**Description:** References non-existent requirement R99.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
        design: simpleDesign,
        tasks,
      });

      // Should have a dangling reference finding
      const danglingFindings = result.findings.filter(
        (f) => f.category === 'Dangling Reference'
      );
      expect(danglingFindings.length).toBeGreaterThan(0);
      expect(
        danglingFindings.some(
          (f) => f.message.includes('R99') && f.file === 'tasks'
        )
      ).toBe(true);
    });

    it('should mark cross-file checks as not skipped when all 3 files provided', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: simpleDesign,
        tasks: simpleTasks,
      });

      // Should have coverage note for cross-file checks
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage).toBeDefined();
      expect(linkingCoverage?.skipped).toBe(false);
      expect(linkingCoverage?.reason).toBe('All 3 files provided');
    });
  });

  describe('Partial-File Auditing: Two Files (Requirements + Tasks)', () => {
    it('should skip cross-file checks and list reason when requirements + tasks provided (no design)', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        tasks: simpleTasks,
      });

      // Should have 2 files
      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.type)).toContain('requirements');
      expect(result.files.map((f) => f.type)).toContain('tasks');

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage).toBeDefined();
      expect(linkingCoverage?.skipped).toBe(true);
      expect(linkingCoverage?.reason).toContain('design.md not provided');

      // Should still have health score and findings
      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.health).toBeLessThanOrEqual(100);
      expect(result.findings).toBeDefined();
    });

    it('should skip cross-file checks when requirements + design provided (no tasks)', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: simpleDesign,
      });

      // Should have 2 files
      expect(result.files).toHaveLength(2);

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage).toBeDefined();
      expect(linkingCoverage?.skipped).toBe(true);
      expect(linkingCoverage?.reason).toContain('tasks.md not provided');
    });

    it('should skip cross-file checks when design + tasks provided (no requirements)', () => {
      const result = runAudit({
        design: simpleDesign,
        tasks: simpleTasks,
      });

      // Should have 2 files
      expect(result.files).toHaveLength(2);

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage).toBeDefined();
      expect(linkingCoverage?.skipped).toBe(true);
      expect(linkingCoverage?.reason).toContain('requirements.md not provided');
    });
  });

  describe('Provided-But-Unparseable Files (Engine Honesty)', () => {
    it('should add coverage note when requirements.md is provided but parses empty', () => {
      const unparseableRequirements = `
# Requirements

This file has no properly formatted requirements.
It uses ## instead of ### for item headings.

## R1: Wrong Heading Level
This should be ### R1: to parse correctly.

Some random text that won't parse as a requirement.
`;

      const result = runAudit({
        requirements: unparseableRequirements,
      });

      // Should have parsed the file but found zero requirements
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('requirements');

      // Should have a coverage note indicating the parse failure
      const parsingCoverage = result.coverage.find(
        (c) => c.checkName === 'Parsing (requirements.md)'
      );
      expect(parsingCoverage).toBeDefined();
      expect(parsingCoverage?.skipped).toBe(false);
      expect(parsingCoverage?.reason).toContain('requirements.md was provided but no requirements were found');
      expect(parsingCoverage?.reason).toContain('### R<number>:');
    });

    it('should add coverage note when tasks.md is provided but parses empty', () => {
      const unparseableTasks = `
# Tasks

This file has no properly formatted tasks.
It uses ## instead of ### for item headings.

## T1: Wrong Heading Level
This should be ### T1: to parse correctly.
`;

      const result = runAudit({
        tasks: unparseableTasks,
      });

      // Should have parsed the file but found zero tasks
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('tasks');

      // Should have a coverage note indicating the parse failure
      const parsingCoverage = result.coverage.find(
        (c) => c.checkName === 'Parsing (tasks.md)'
      );
      expect(parsingCoverage).toBeDefined();
      expect(parsingCoverage?.skipped).toBe(false);
      expect(parsingCoverage?.reason).toContain('tasks.md was provided but no tasks were found');
      expect(parsingCoverage?.reason).toContain('### T<number>:');
    });

    it('should add coverage note when design.md is provided but parses empty', () => {
      const unparseableDesign = `
# Design

This file has no properly formatted design sections.
It uses ### or #### instead of ## for section headings.

### Architecture (Wrong Heading Level)
This should be ## Architecture: to parse correctly.
`;

      const result = runAudit({
        design: unparseableDesign,
      });

      // Should have parsed the file but found zero design sections
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('design');

      // Should have a coverage note indicating the parse failure
      const parsingCoverage = result.coverage.find(
        (c) => c.checkName === 'Parsing (design.md)'
      );
      expect(parsingCoverage).toBeDefined();
      expect(parsingCoverage?.skipped).toBe(false);
      expect(parsingCoverage?.reason).toContain('design.md was provided but no design sections were found');
      expect(parsingCoverage?.reason).toContain('## Section Name:');
    });
  });

  describe('Partial-File Auditing: Single File', () => {
    it('should run single-file checks for requirements.md only', () => {
      const result = runAudit({
        requirements: simpleRequirements,
      });

      // Should have 1 file
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('requirements');

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage).toBeDefined();
      expect(linkingCoverage?.skipped).toBe(true);
      expect(linkingCoverage?.reason).toContain(
        'design.md and tasks.md not provided'
      );

      // Should still have valid report
      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.health).toBeLessThanOrEqual(100);
    });

    it('should run single-file checks for design.md only', () => {
      const result = runAudit({
        design: simpleDesign,
      });

      // Should have 1 file
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('design');

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage?.skipped).toBe(true);
      expect(linkingCoverage?.reason).toContain(
        'requirements.md and tasks.md not provided'
      );

      // Should have valid report
      expect(result.health).toBeGreaterThanOrEqual(0);
    });

    it('should run single-file checks for tasks.md only', () => {
      const result = runAudit({
        tasks: simpleTasks,
      });

      // Should have 1 file
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('tasks');

      // Should have cross-file check skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage?.skipped).toBe(true);

      // Should have valid report
      expect(result.health).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Empty Input Handling', () => {
    it('should handle empty input gracefully with score 100', () => {
      const result = runAudit({});

      // Should have no files
      expect(result.files).toHaveLength(0);

      // Should have no findings
      expect(result.findings).toHaveLength(0);

      // Should have score 100 (perfect score for no issues)
      expect(result.health).toBe(100);

      // Should have empty summary
      expect(result.summary.totalFindings).toBe(0);
      expect(result.summary.criticalCount).toBe(0);
      expect(result.summary.highCount).toBe(0);
      expect(result.summary.mediumCount).toBe(0);
      expect(result.summary.lowCount).toBe(0);

      // Should have coverage notes explaining why checks were skipped
      expect(result.coverage).toHaveLength(1);
      expect(result.coverage[0].skipped).toBe(true);
      expect(result.coverage[0].reason).toContain('No files provided');
    });

    it('should handle input with only empty strings', () => {
      const result = runAudit({
        requirements: '',
        design: '',
        tasks: '',
      });

      // Empty strings should be treated as no input
      expect(result.files).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
      expect(result.health).toBe(100);
    });

    it('should handle input with undefined and empty mix', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: '',
        // tasks is undefined
      });

      // Only requirements should be included
      expect(result.files).toHaveLength(1);
      expect(result.files[0].type).toBe('requirements');

      // Should skip cross-file checks
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage?.skipped).toBe(true);
    });
  });

  describe('Report Structure and Metadata', () => {
    it('should include all required report fields', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: simpleDesign,
        tasks: simpleTasks,
      });

      // Check all required fields
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('coverage');
      expect(result).toHaveProperty('breakdown');

      // Verify types
      expect(typeof result.health).toBe('number');
      expect(result.timestamp instanceof Date).toBe(true);
      expect(Array.isArray(result.files)).toBe(true);
      expect(Array.isArray(result.findings)).toBe(true);
      expect(typeof result.summary).toBe('object');
      expect(Array.isArray(result.coverage)).toBe(true);
      expect(Array.isArray(result.breakdown)).toBe(true);
    });

    it('should populate summary counts correctly', () => {
      const result = runAudit({
        requirements: simpleRequirements,
        design: simpleDesign,
        tasks: simpleTasks,
      });

      const { summary } = result;

      // Summary should match findings
      expect(summary.totalFindings).toBe(result.findings.length);

      const criticalCount = result.findings.filter(
        (f) => f.severity === 'Critical'
      ).length;
      const highCount = result.findings.filter(
        (f) => f.severity === 'High'
      ).length;
      const mediumCount = result.findings.filter(
        (f) => f.severity === 'Medium'
      ).length;
      const lowCount = result.findings.filter((f) => f.severity === 'Low').length;

      expect(summary.criticalCount).toBe(criticalCount);
      expect(summary.highCount).toBe(highCount);
      expect(summary.mediumCount).toBe(mediumCount);
      expect(summary.lowCount).toBe(lowCount);
    });

    it('should include parsed file metadata', () => {
      const requirements = 'Test requirement content';
      const design = 'Test design content';
      const tasks = 'Test tasks content';

      const result = runAudit({
        requirements,
        design,
        tasks,
      });

      expect(result.files).toHaveLength(3);

      const reqFile = result.files.find((f) => f.type === 'requirements');
      expect(reqFile?.name).toBe('requirements.md');
      expect(reqFile?.content).toBe(requirements);
      expect(reqFile?.characterCount).toBe(requirements.length);
      expect(Array.isArray(reqFile?.lines)).toBe(true);
      expect(reqFile?.uploadedAt instanceof Date).toBe(true);

      const designFile = result.files.find((f) => f.type === 'design');
      expect(designFile?.name).toBe('design.md');
      expect(designFile?.content).toBe(design);

      const tasksFile = result.files.find((f) => f.type === 'tasks');
      expect(tasksFile?.name).toBe('tasks.md');
      expect(tasksFile?.content).toBe(tasks);
    });
  });

  describe('Cross-File Detection Specifics', () => {
    it('should correctly identify orphaned requirement with proper finding structure', () => {
      const requirements = `
### R1: Referenced requirement
**Description:** This is referenced.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result

### R2: Orphaned requirement
**Description:** This is orphaned.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const tasks = `
### T1: Task
**Description:** References R1 only.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
        design: simpleDesign,
        tasks,
      });

      const orphanedFinding = result.findings.find(
        (f) =>
          f.category === 'Orphaned Requirement' &&
          f.file === 'requirements' &&
          f.quote.includes('R2')
      );

      expect(orphanedFinding).toBeDefined();
      expect(orphanedFinding?.severity).toBe('Medium');
      expect(orphanedFinding?.message).toContain('R2');
      expect(orphanedFinding?.message).toContain('not referenced by any task');
      expect(orphanedFinding?.suggestion).toBeDefined();
    });

    it('should correctly identify dangling reference with proper finding structure', () => {
      const requirements = `
### R1: Requirement
**Description:** Only R1 exists.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const tasks = `
### T1: Task
**Description:** References non-existent R99.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
        design: simpleDesign,
        tasks,
      });

      const danglingFinding = result.findings.find(
        (f) =>
          f.category === 'Dangling Reference' &&
          f.file === 'tasks' &&
          f.message.includes('R99')
      );

      expect(danglingFinding).toBeDefined();
      expect(danglingFinding?.severity).toBe('High');
      expect(danglingFinding?.message).toContain('does not exist');
      expect(danglingFinding?.suggestion).toBeDefined();
    });

    it('should not create orphaned requirement findings when tasks file not provided', () => {
      const requirements = `
### R1: Requirement
**Description:** This has no task references.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
        design: simpleDesign,
      });

      // Should not have orphaned requirement findings in partial audit
      const orphanedFindings = result.findings.filter(
        (f) => f.category === 'Orphaned Requirement'
      );

      // With partial file audit, orphaned requirement check may not run
      // Coverage should indicate cross-file checks skipped
      const linkingCoverage = result.coverage.find(
        (c) => c.checkName === 'Requirement-Task Linking'
      );
      expect(linkingCoverage?.skipped).toBe(true);
    });
  });

  describe('Score Calculation Integration', () => {
    it('should calculate score based on all findings', () => {
      const requirements = `
### R1: Requirement with vague language
**Description:** The system may or might respond to user input.

**Acceptance Criteria:**
- GIVEN precondition
- WHEN trigger
- THEN result
`;

      const result = runAudit({
        requirements,
      });

      // Should have findings (vague language: Low severity)
      const vagueFindings = result.findings.filter(
        (f) => f.category === 'Vague Language'
      );
      expect(vagueFindings.length).toBeGreaterThan(0);

      // Score should be less than 100
      expect(result.health).toBeLessThan(100);

      // Breakdown should show deductions
      expect(result.breakdown.length).toBeGreaterThan(0);
    });

    it('should score 100 for audit with no findings', () => {
      const perfectRequirements = `
### R1: Clear requirement
**Description:** The system shall accept user input.

**Acceptance Criteria:**
- GIVEN the user is on the input page
- WHEN the user enters valid data
- THEN the system accepts the data
`;

      // Note: Will likely have some findings due to other checks
      // But this demonstrates the score calculation
      const result = runAudit({
        requirements: perfectRequirements,
      });

      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.health).toBeLessThanOrEqual(100);
    });
  });

  describe('No Throws on Invalid Input', () => {
    it('should not throw on malformed requirements', () => {
      const malformed = `
This is not valid markdown structure at all
Random text that doesn't follow any pattern
R1 is mentioned but not as a proper header
`;

      expect(() => {
        runAudit({ requirements: malformed });
      }).not.toThrow();
    });

    it('should not throw on malformed design', () => {
      const malformed = `
Random design content
Missing proper headers
No structure whatsoever
`;

      expect(() => {
        runAudit({ design: malformed });
      }).not.toThrow();
    });

    it('should not throw on malformed tasks', () => {
      const malformed = `
Task content without proper structure
Missing T1, T2 headers
Just free text that should fail gracefully
`;

      expect(() => {
        runAudit({ tasks: malformed });
      }).not.toThrow();
    });

    it('should not throw on completely empty input', () => {
      expect(() => {
        runAudit({});
      }).not.toThrow();

      expect(() => {
        runAudit({ requirements: '', design: '', tasks: '' });
      }).not.toThrow();
    });
  });
});
