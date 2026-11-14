/**
 * Audit engine for Spec Doctor (T6, T9).
 * Orchestrates parsing and auditing of specification files.
 *
 * Features:
 * - T6: Cross-file auditor for traceability and bidirectional references
 * - T9: Partial-file degradation (graceful handling of 1-2 files instead of 3)
 *
 * Flow:
 * 1. Parse provided files (requirements, design, tasks)
 * 2. Run single-file auditors on each provided file
 * 3. If all 3 files provided: run cross-file checks
 * 4. If < 3 files: skip cross-file checks, add coverage notes
 * 5. Return comprehensive AuditReport with findings, score, breakdown, and coverage notes
 */

import { SpecFile, Finding, Requirement, Task, DesignSection, AuditReport } from './types';
import { parseRequirements, parseTasks, parseDesign } from './parser';
import { auditRequirements, auditDesign, auditTasks } from './auditors';
import { calculateScore } from './scoring';

/**
 * Input to runAudit: raw text content for each file type.
 * All fields are optional to support partial-file auditing.
 */
export interface AuditInput {
  requirements?: string;
  design?: string;
  tasks?: string;
}

/**
 * Coverage note describing why a check was skipped.
 */
export interface CoverageNote {
  checkName: string;
  reason: string;
  skipped: boolean;
}

/**
 * Extended audit report with coverage information.
 */
export interface ExtendedAuditReport extends AuditReport {
  coverage: CoverageNote[];
  breakdown: Array<{
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    count: number;
    deductions: number[];
    totalDeducted: number;
  }>;
}

/**
 * Runs the complete audit on provided specification files.
 *
 * Supports partial-file auditing:
 * - 1 file: runs all single-file checks on that file
 * - 2 files: runs all single-file checks on both files, skips cross-file checks
 * - 3 files: runs all single-file checks and cross-file checks
 * - 0 files: returns empty report with score 100 and coverage notes
 *
 * @param files Input with optional requirements, design, and tasks raw text
 * @returns Complete audit report with findings, score, breakdown, and coverage
 */
export function runAudit(files: AuditInput): ExtendedAuditReport {
  const coverage: CoverageNote[] = [];
  const allFindings: Finding[] = [];
  const parsedFiles: SpecFile[] = [];

  // Determine which files are provided
  const hasRequirements = files.requirements !== undefined && files.requirements.length > 0;
  const hasDesign = files.design !== undefined && files.design.length > 0;
  const hasTasks = files.tasks !== undefined && files.tasks.length > 0;
  const filesCount = [hasRequirements, hasDesign, hasTasks].filter(Boolean).length;

  // Track parsed data for cross-file checks
  let requirements: Requirement[] = [];
  let tasks: Task[] = [];
  let designSections: DesignSection[] = [];

  // === PHASE 1: Parse and Audit Requirements ===
  if (hasRequirements) {
    const { requirements: parsed } = parseRequirements(files.requirements!);
    requirements = parsed;

    const specFile: SpecFile = {
      type: 'requirements',
      name: 'requirements.md',
      content: files.requirements!,
      lines: files.requirements!.split('\n'),
      characterCount: files.requirements!.length,
      uploadedAt: new Date(),
    };
    parsedFiles.push(specFile);

    // Check if requirements file was provided but parsed empty
    if (requirements.length === 0) {
      coverage.push({
        checkName: 'Parsing (requirements.md)',
        reason: 'requirements.md was provided but no requirements were found — expected ### R<number>: headings',
        skipped: false,
      });
    }

    // Audit requirements (initial audit without cross-file context yet)
    // We'll re-audit after collecting task references
    const referencedIds = new Set<string>();
    const reqFindings = auditRequirements(requirements, referencedIds);
    allFindings.push(...reqFindings);
  }

  // === PHASE 2: Parse and Audit Design ===
  if (hasDesign) {
    const { sections } = parseDesign(files.design!);
    designSections = sections;

    const specFile: SpecFile = {
      type: 'design',
      name: 'design.md',
      content: files.design!,
      lines: files.design!.split('\n'),
      characterCount: files.design!.length,
      uploadedAt: new Date(),
    };
    parsedFiles.push(specFile);

    // Check if design file was provided but parsed empty
    if (designSections.length === 0) {
      coverage.push({
        checkName: 'Parsing (design.md)',
        reason: 'design.md was provided but no design sections were found — expected ## Section Name: headings',
        skipped: false,
      });
    }

    const designFindings = auditDesign(designSections);
    allFindings.push(...designFindings);
  }

  // === PHASE 3: Parse and Audit Tasks ===
  if (hasTasks) {
    const { tasks: parsed } = parseTasks(files.tasks!);
    tasks = parsed;

    const specFile: SpecFile = {
      type: 'tasks',
      name: 'tasks.md',
      content: files.tasks!,
      lines: files.tasks!.split('\n'),
      characterCount: files.tasks!.length,
      uploadedAt: new Date(),
    };
    parsedFiles.push(specFile);

    // Check if tasks file was provided but parsed empty
    if (tasks.length === 0) {
      coverage.push({
        checkName: 'Parsing (tasks.md)',
        reason: 'tasks.md was provided but no tasks were found — expected ### T<number>: headings',
        skipped: false,
      });
    }

    const taskFindings = auditTasks(tasks);
    allFindings.push(...taskFindings);
  }

  // === PHASE 4: Cross-File Auditing (if all 3 files provided) ===
  if (filesCount === 3) {
    // Re-audit requirements with cross-file context
    const referencedRequirements = new Set<string>();
    tasks.forEach((task) => {
      task.requirementReferences.forEach((ref) => {
        if (ref.startsWith('R')) {
          referencedRequirements.add(ref);
        }
      });
    });

    // Find orphaned requirements (not referenced by any task)
    const orphanRequirements = requirements.filter(
      (req) => !referencedRequirements.has(req.id)
    );

    orphanRequirements.forEach((req) => {
      const findingId = `finding-requirements-orphan-${req.id}`;
      allFindings.push({
        id: findingId,
        file: 'requirements',
        line: req.startLine,
        lineRange: [req.startLine, req.endLine],
        severity: 'Medium',
        category: 'Orphaned Requirement',
        quote: req.id,
        message: `Requirement ${req.id} is not referenced by any task.`,
        suggestion: `Add a task reference in tasks.md or remove this requirement if it's no longer needed.`,
      });
    });

    // Find dangling task references (referencing non-existent requirements)
    const validRequirementIds = new Set(requirements.map((r) => r.id));

    tasks.forEach((task) => {
      task.requirementReferences.forEach((ref) => {
        if (ref.startsWith('R') && !validRequirementIds.has(ref)) {
          const findingId = `finding-tasks-dangling-${task.id}-${ref}`;
          allFindings.push({
            id: findingId,
            file: 'tasks',
            line: task.startLine,
            lineRange: [task.startLine, task.endLine],
            severity: 'High',
            category: 'Dangling Reference',
            quote: `${task.id} references ${ref}`,
            message: `Task ${task.id} references requirement ${ref} which does not exist.`,
            suggestion: `Fix the requirement ID or remove the reference if it's no longer applicable.`,
          });
        }
      });
    });

    coverage.push({
      checkName: 'Requirement-Task Linking',
      reason: 'All 3 files provided',
      skipped: false,
    });
  } else {
    // Partial-file audit: skip cross-file checks
    if (filesCount === 2) {
      coverage.push({
        checkName: 'Requirement-Task Linking',
        reason: !hasRequirements
          ? 'requirements.md not provided'
          : !hasDesign
          ? 'design.md not provided'
          : 'tasks.md not provided',
        skipped: true,
      });
    } else if (filesCount === 1) {
      coverage.push({
        checkName: 'Requirement-Task Linking',
        reason: hasRequirements
          ? 'design.md and tasks.md not provided'
          : hasDesign
          ? 'requirements.md and tasks.md not provided'
          : 'requirements.md and design.md not provided',
        skipped: true,
      });
    } else {
      // No files provided
      coverage.push({
        checkName: 'Requirement-Task Linking',
        reason: 'No files provided',
        skipped: true,
      });
    }
  }

  // === PHASE 5: Calculate Score ===
  // For partial files, score is based only on applicable findings
  const scoreResult = calculateScore(allFindings);

  // === PHASE 6: Generate Summary ===
  const summary = {
    totalFindings: allFindings.length,
    criticalCount: allFindings.filter((f) => f.severity === 'Critical').length,
    highCount: allFindings.filter((f) => f.severity === 'High').length,
    mediumCount: allFindings.filter((f) => f.severity === 'Medium').length,
    lowCount: allFindings.filter((f) => f.severity === 'Low').length,
  };

  // === PHASE 7: Build Report ===
  const report: ExtendedAuditReport = {
    health: scoreResult.score,
    timestamp: new Date(),
    files: parsedFiles,
    findings: allFindings,
    summary,
    coverage,
    breakdown: scoreResult.breakdown,
  };

  return report;
}
