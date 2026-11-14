/**
 * File parser for Spec Doctor.
 * Converts raw specification file content into structured objects.
 * Implements graceful fallback for unnumbered items and malformed sections.
 */

import {
  Requirement,
  Task,
  DesignSection,
  AcceptanceCriterion,
  ParseNote,
} from './types';
import { classifyCriterion } from './criteria';

/**
 * Parses a requirements.md file into an array of Requirement objects.
 *
 * Extracts:
 * - Requirement blocks with IDs matching R\d+ pattern
 * - Requirement titles and descriptions
 * - Acceptance criteria blocks
 * - Line numbers (1-based)
 *
 * Fallback:
 * - Unnumbered requirements are assigned sequential IDs (e.g., R5 if R4 is the highest)
 *
 * Graceful handling:
 * - Malformed or incomplete sections return what was parsed plus parse notes
 * - Missing acceptance criteria sections do not cause errors
 *
 * @param content The raw text content of requirements.md
 * @returns Object with parsed requirements array and parse notes
 */
export function parseRequirements(content: string): {
  requirements: Requirement[];
  parseNotes: ParseNote[];
} {
  const lines = content.split('\n');
  const requirements: Requirement[] = [];
  const parseNotes: ParseNote[] = [];
  let currentRequirement: Partial<Requirement> | null = null;
  let currentCriteria: AcceptanceCriterion[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1; // 1-based line numbering

    // Match requirement header: ### R1: Title or ### Title (unnumbered)
    const reqHeaderMatch = trimmedLine.match(/^###\s+(?:([RT]\d+):\s+)?(.+?)$/i);

    if (reqHeaderMatch) {
      // Save previous requirement if exists
      if (currentRequirement) {
        currentRequirement.acceptanceCriteria = currentCriteria;
        currentRequirement.endLine = i;
        requirements.push(currentRequirement as Requirement);
      }

      const idPart = reqHeaderMatch[1];
      const title = reqHeaderMatch[2].trim();

      // Extract ID or mark as unnumbered
      let id: string;
      let number: number;

      if (idPart) {
        id = idPart;
        const numMatch = idPart.match(/R(\d+)/);
        number = numMatch ? parseInt(numMatch[1], 10) : 0;
      } else {
        // Unnumbered requirement - will assign later
        id = '';
        number = 0;
      }

      currentRequirement = {
        id,
        number,
        title,
        description: '',
        acceptanceCriteria: [],
        startLine: lineNumber,
        endLine: lineNumber,
      };

      currentCriteria = [];
    } else if (
      currentRequirement &&
      trimmedLine.startsWith('**Acceptance Criteria:**')
    ) {
      // Start of acceptance criteria block
      i++;
      const criteriaLines: Array<{ index: number; text: string; lineNumber: number }> = [];

      // First pass: collect all criterion bullets
      while (i < lines.length) {
        const acLine = lines[i];
        const acTrimmed = acLine.trim();
        const acLineNumber = i + 1;

        // Check for next requirement or end of criteria
        if (acTrimmed.startsWith('###') || acTrimmed.startsWith('##')) {
          i--;
          break;
        }

        // Match bullet point: - text or numbered like 1. text
        const criteriaMatch = acTrimmed.match(/^[-*]\s+(.+?)$|^\d+\.\s+(.+?)$/);
        if (criteriaMatch) {
          const criteriaText = (criteriaMatch[1] || criteriaMatch[2]).trim();
          criteriaLines.push({ index: criteriaLines.length, text: criteriaText, lineNumber: acLineNumber });
        }

        i++;
      }

      // Second pass: group GWT scenarios
      currentCriteria = groupGWTScenarios(criteriaLines);
    } else if (currentRequirement && trimmedLine.length > 0) {
      // Accumulate description text
      if (currentRequirement.description) {
        currentRequirement.description += '\n' + trimmedLine;
      } else {
        currentRequirement.description = trimmedLine;
      }
    }

    i++;
  }

  // Save last requirement
  if (currentRequirement) {
    currentRequirement.acceptanceCriteria = currentCriteria;
    currentRequirement.endLine = lines.length;
    requirements.push(currentRequirement as Requirement);
  }

  // Assign sequential IDs to unnumbered requirements (gap-filling)
  const numberedReqs = requirements.filter((r) => r.id);
  const usedNumbers = new Set(numberedReqs.map((r) => r.number));

  const finalRequirements = requirements.map((req) => {
    if (!req.id) {
      // Find smallest unused positive integer
      let nextId = 1;
      while (usedNumbers.has(nextId)) {
        nextId++;
      }
      req.id = `R${nextId}`;
      req.number = nextId;
      usedNumbers.add(nextId);
      parseNotes.push({
        severity: 'warning',
        message: `Unnumbered requirement at line ${req.startLine} assigned ID ${req.id}`,
        line: req.startLine,
      });
    }
    return req;
  });

  return {
    requirements: finalRequirements as Requirement[],
    parseNotes,
  };
}

/**
 * Parses a tasks.md file into an array of Task objects.
 *
 * Extracts:
 * - Task blocks with IDs matching T\d+ pattern
 * - Task titles, descriptions, and acceptance criteria
 * - Requirement references (e.g., R1, R2, T3)
 * - Line numbers (1-based)
 *
 * Fallback:
 * - Unnumbered tasks are assigned sequential IDs
 *
 * @param content The raw text content of tasks.md
 * @returns Object with parsed tasks array and parse notes
 */
export function parseTasks(content: string): {
  tasks: Task[];
  parseNotes: ParseNote[];
} {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  const parseNotes: ParseNote[] = [];
  let currentTask: Partial<Task> | null = null;
  let currentCriteria: AcceptanceCriterion[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1; // 1-based line numbering

    // Match task header: ### T1: Title or ### Title (unnumbered)
    const taskHeaderMatch = trimmedLine.match(/^###\s+(?:([RT]\d+):\s+)?(.+?)$/i);

    if (taskHeaderMatch) {
      // Save previous task if exists
      if (currentTask) {
        currentTask.acceptanceCriteria = currentCriteria;
        currentTask.endLine = i;
        currentTask.estimatedSize = estimateTaskSize(currentTask.acceptanceCriteria as AcceptanceCriterion[]);
        tasks.push(currentTask as Task);
      }

      const idPart = taskHeaderMatch[1];
      const title = taskHeaderMatch[2].trim();

      let id: string;
      let number: number;

      if (idPart) {
        id = idPart;
        const numMatch = idPart.match(/T(\d+)/);
        number = numMatch ? parseInt(numMatch[1], 10) : 0;
      } else {
        id = '';
        number = 0;
      }

      currentTask = {
        id,
        number,
        title,
        description: '',
        acceptanceCriteria: [],
        requirementReferences: [],
        startLine: lineNumber,
        endLine: lineNumber,
        estimatedSize: 'small',
      };

      currentCriteria = [];
    } else if (
      currentTask &&
      trimmedLine.startsWith('**Description:**')
    ) {
      // Parse description (typically on next lines until we hit another section)
      i++;
      let descText = '';
      while (i < lines.length) {
        const descLine = lines[i];
        const descTrimmed = descLine.trim();

        if (
          descTrimmed.startsWith('###') ||
          descTrimmed.startsWith('**') ||
          descTrimmed.startsWith('##')
        ) {
          i--;
          break;
        }

        if (descTrimmed.length > 0) {
          if (descText) {
            descText += '\n' + descTrimmed;
          } else {
            descText = descTrimmed;
          }
        }
        i++;
      }
      if (currentTask) {
        currentTask.description = descText;
      }
    } else if (
      currentTask &&
      trimmedLine.startsWith('**Acceptance Criteria:**')
    ) {
      i++;
      const criteriaLines: Array<{ index: number; text: string; lineNumber: number }> = [];

      // First pass: collect all criterion bullets
      while (i < lines.length) {
        const acLine = lines[i];
        const acTrimmed = acLine.trim();
        const acLineNumber = i + 1;

        if (acTrimmed.startsWith('###') || acTrimmed.startsWith('##')) {
          i--;
          break;
        }

        const criteriaMatch = acTrimmed.match(/^[-*]\s+(.+?)$|^\d+\.\s+(.+?)$/);
        if (criteriaMatch) {
          const criteriaText = (criteriaMatch[1] || criteriaMatch[2]).trim();
          criteriaLines.push({ index: criteriaLines.length, text: criteriaText, lineNumber: acLineNumber });
        }

        i++;
      }

      // Second pass: group GWT scenarios
      currentCriteria = groupGWTScenarios(criteriaLines);
    } else if (currentTask && trimmedLine.length > 0) {
      // Accumulate other content into description
      if (currentTask.description) {
        currentTask.description += '\n' + trimmedLine;
      } else {
        currentTask.description = trimmedLine;
      }
    }

    i++;
  }

  // Save last task
  if (currentTask) {
    currentTask.acceptanceCriteria = currentCriteria;
    currentTask.endLine = lines.length;
    currentTask.estimatedSize = estimateTaskSize(currentCriteria);
    tasks.push(currentTask as Task);
  }

  // Extract references from task body only (excluding header line)
  const tasksWithReferences = tasks.map((task) => {
    const taskBlockStart = task.startLine - 1;
    const taskBlockEnd = task.endLine;
    const taskBlockLines = lines.slice(taskBlockStart, taskBlockEnd);
    // Exclude the header line (first line), include description, References line, and acceptance criteria
    const taskBodyLines = taskBlockLines.slice(1);
    const fullTaskText = taskBodyLines.join('\n');
    // Extract all references and deduplicate
    task.requirementReferences = extractReferences(fullTaskText);
    return task;
  });

  // Assign sequential IDs to unnumbered tasks (gap-filling)
  const numberedTasks = tasksWithReferences.filter((t) => t.id);
  const usedNumbers = new Set(numberedTasks.map((t) => t.number));

  let nextId = 1;
  const finalTasks = tasksWithReferences.map((task) => {
    if (!task.id) {
      // Find smallest unused positive integer
      while (usedNumbers.has(nextId)) {
        nextId++;
      }
      task.id = `T${nextId}`;
      task.number = nextId;
      usedNumbers.add(nextId);
      parseNotes.push({
        severity: 'warning',
        message: `Unnumbered task at line ${task.startLine} assigned ID ${task.id}`,
        line: task.startLine,
      });
      nextId++;
    }
    return task;
  });

  return {
    tasks: finalTasks as Task[],
    parseNotes,
  };
}

/**
 * Parses a design.md file into an array of DesignSection objects.
 *
 * Extracts:
 * - Section headers (H2 level: ##)
 * - Section content and line numbers (1-based)
 *
 * @param content The raw text content of design.md
 * @returns Object with parsed design sections and parse notes
 */
export function parseDesign(content: string): {
  sections: DesignSection[];
  parseNotes: ParseNote[];
} {
  const lines = content.split('\n');
  const sections: DesignSection[] = [];
  const parseNotes: ParseNote[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1;

    // Match section header (## Title)
    const sectionMatch = trimmedLine.match(/^##\s+(.+?)$/);

    if (sectionMatch) {
      const title = sectionMatch[1].trim();
      const startLine = lineNumber;
      let content = '';
      let endLine = lineNumber;

      // Collect content until next section or EOF
      i++;
      while (i < lines.length) {
        const contentLine = lines[i];
        const contentTrimmed = contentLine.trim();

        // Stop ONLY at H2 or H1 section headers, never at H3
        if (contentTrimmed.match(/^##\s/) || contentTrimmed.match(/^#\s/)) {
          i--;
          break;
        }

        if (contentTrimmed.length > 0) {
          if (content) {
            content += '\n' + contentLine;
          } else {
            content = contentLine;
          }
          endLine = i + 1;
        }

        i++;
      }

      sections.push({
        title,
        content: content.trim(),
        startLine,
        endLine,
      });
    }

    i++;
  }

  return {
    sections,
    parseNotes,
  };
}

/**
 * Parses a single acceptance criterion to determine its format and testability.
 *
 * @param text The criterion text
 * @param line The line number (1-based)
 * @returns AcceptanceCriterion object
 */
function parseAcceptanceCriterion(
  text: string,
  line: number
): AcceptanceCriterion {
  const classified = classifyCriterion(text.trim());

  return {
    id: `criterion-${line}`,
    text,
    format: classified.format,
    isTestable: classified.isTestable,
    line,
    issues: classified.issues,
  };
}

/**
 * Groups GWT scenarios from a list of criterion lines.
 * 
 * When a criterion starts with GIVEN (case-insensitive), it begins a scenario.
 * Each immediately following bullet starting with WHEN, THEN, or AND joins that scenario
 * (texts joined with single spaces).
 * The scenario ends at the first following bullet not starting with one of those keywords,
 * at a non-bullet line, or at the end.
 * 
 * A GIVEN with no following WHEN/THEN stays a single criterion (will classify as unstructured).
 * Standalone WHEN/THEN/AND with no preceding GIVEN stay separate (dangling clauses).
 * 
 * @param criteriaLines Array of criterion lines with text and line numbers
 * @returns Array of AcceptanceCriterion objects with GWT scenarios grouped
 */
function groupGWTScenarios(
  criteriaLines: Array<{ index: number; text: string; lineNumber: number }>
): AcceptanceCriterion[] {
  const result: AcceptanceCriterion[] = [];
  let i = 0;

  while (i < criteriaLines.length) {
    const currentLine = criteriaLines[i];
    const currentLower = currentLine.text.toLowerCase();

    if (currentLower.startsWith('given')) {
      // This is the start of a potential GWT scenario
      const givenStartIndex = i;
      const givenLineNumber = currentLine.lineNumber;
      const parts = [currentLine.text];

      i++;

      // Look ahead for WHEN, THEN, AND
      while (i < criteriaLines.length) {
        const nextLine = criteriaLines[i];
        const nextLower = nextLine.text.toLowerCase();

        if (
          nextLower.startsWith('when') ||
          nextLower.startsWith('then') ||
          nextLower.startsWith('and')
        ) {
          parts.push(nextLine.text);
          i++;
        } else {
          // End of scenario
          break;
        }
      }

      // Create grouped criterion
      const groupedText = parts.join(' ');
      const criterion = parseAcceptanceCriterion(groupedText, givenLineNumber);
      result.push(criterion);
    } else {
      // Not a GIVEN, treat as standalone (dangling clause or other criterion)
      const criterion = parseAcceptanceCriterion(currentLine.text, currentLine.lineNumber);
      result.push(criterion);
      i++;
    }
  }

  return result;
}

/**
 * Extracts requirement and task references from text.
 * Matches patterns like R1, R2, T3, etc.
 *
 * @param text The text to search for references
 * @returns Array of requirement/task IDs found
 */
function extractReferences(text: string): string[] {
  const matches = text.match(/\b([RT]\d+)\b/g) || [];
  // Return unique references
  return [...new Set(matches)];
}

/**
 * Estimates task size based on number of acceptance criteria.
 *
 * @param criteria The criteria array
 * @returns Size estimate: small, medium, large, or oversized
 */
function estimateTaskSize(
  criteria: AcceptanceCriterion[]
): 'small' | 'medium' | 'large' | 'oversized' {
  if (criteria.length > 5) {
    return 'oversized';
  } else if (criteria.length > 3) {
    return 'large';
  } else if (criteria.length > 1) {
    return 'medium';
  }
  return 'small';
}
