/**
 * TypeScript interfaces for Spec Doctor data model.
 * These types represent the parsed structure of specification files.
 */

/**
 * Represents a specification file (requirements.md, design.md, or tasks.md).
 */
export interface SpecFile {
  type: 'requirements' | 'design' | 'tasks';
  name: string;
  content: string;
  lines: string[];
  characterCount: number;
  uploadedAt: Date;
}

/**
 * Represents a single acceptance criterion within a requirement or task.
 * Format can be GIVEN/WHEN/THEN (BDD) or EARS patterns.
 */
export interface AcceptanceCriterion {
  id: string;
  text: string;
  format: 'given-when-then' | 'ears' | 'unstructured';
  isTestable: boolean;
  line: number;
  issues: string[];
}

/**
 * Represents a requirement extracted from requirements.md.
 * Requirements have IDs matching pattern R\d+ and contain acceptance criteria.
 */
export interface Requirement {
  id: string;
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  startLine: number;
  endLine: number;
}

/**
 * Represents a task extracted from tasks.md.
 * Tasks have IDs matching pattern T\d+ and may reference requirements.
 */
export interface Task {
  id: string;
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  requirementReferences: string[];
  startLine: number;
  endLine: number;
  estimatedSize: 'small' | 'medium' | 'large' | 'oversized';
}

/**
 * Represents a section from design.md with its content and line location.
 */
export interface DesignSection {
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Represents a single audit finding (issue discovered during auditing).
 */
export interface Finding {
  id: string;
  file: 'requirements' | 'design' | 'tasks';
  line: number;
  lineRange: [number, number];
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  category: string;
  quote: string;
  message: string;
  suggestion: string;
}

/**
 * Represents the complete audit report including health score and all findings.
 */
export interface AuditReport {
  health: number;
  timestamp: Date;
  files: SpecFile[];
  findings: Finding[];
  summary: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  llmFindings?: string[]; // Optional LLM findings (does not affect health score)
}

/**
 * Represents a parse note for graceful handling of malformed input.
 */
export interface ParseNote {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}
