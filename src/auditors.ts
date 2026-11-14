/**
 * Audit engines for Spec Doctor.
 * Implements auditing logic for requirements.md, design.md, and tasks.md.
 *
 * T3: Requirements Auditor
 * T4: Design Auditor
 * T5: Tasks Auditor
 */

import { Finding, Requirement, Task, DesignSection, AcceptanceCriterion } from './types';
import { jaccardSimilarity, findDuplicates, normalizeText } from './similarity';
import { classifyCriterion } from './criteria';

const VAGUE_TERMS = [
  'may',
  'might',
  'perhaps',
  'ideally',
  'could',
  'should consider',
];

const DESIGN_VOCABULARIES = {
  dataModel: new Set([
    'schema',
    'structure',
    'entity',
    'database',
    'model',
    'table',
    'class',
    'object',
    'field',
    'attribute',
    'relationship',
    'diagram',
    'er',
    'normalization',
    'primary key',
    'foreign key',
  ]),
  errorHandling: new Set([
    'error',
    'exception',
    'failure',
    'retry',
    'validation',
    'assert',
    'throw',
    'catch',
    'try',
    'fault',
    'crash',
    'recovery',
    'logging',
    'monitoring',
    'graceful',
    'degradation',
    'fallback',
  ]),
  apiContracts: new Set([
    'endpoint',
    'interface',
    'protocol',
    'contract',
    'method',
    'parameter',
    'request',
    'response',
    'payload',
    'header',
    'status code',
    'rest',
    'grpc',
    'graphql',
    'http',
    'tcp',
    'authentication',
    'authorization',
  ]),
};

/**
 * Audits a parsed requirements file.
 *
 * Checks:
 * 1. Vague language: flags terms like "may", "might", "perhaps", etc.
 * 2. Format validation: ensures acceptance criteria match GIVEN/WHEN/THEN or EARS patterns
 * 3. Testability: flags untestable criteria
 * 4. Orphaned requirements: flags requirements not referenced in referencedIds
 *    (skipped entirely if referencedIds is empty)
 * 5. Duplicate detection: flags duplicate/near-duplicate pairs via Jaccard similarity > 0.90
 *
 * @param requirements Parsed requirements array
 * @param referencedIds Set of requirement IDs referenced from tasks (empty set means no tasks file provided)
 * @returns Array of findings
 */
export function auditRequirements(
  requirements: Requirement[],
  referencedIds: Set<string>
): Finding[] {
  const findings: Finding[] = [];
  const findingIdCounter = { count: 0 };

  // 1. Check for vague language and format issues in each requirement
  requirements.forEach((req) => {
    // Check vague language in description
    const vagueInDesc = checkVagueLanguage(req.description, req.startLine, 'requirements', findingIdCounter);
    findings.push(...vagueInDesc);

    // Check each acceptance criterion
    req.acceptanceCriteria.forEach((criterion) => {
      // Check vague language in criterion
      const vagueInCriterion = checkVagueLanguage(
        criterion.text,
        criterion.line,
        'requirements',
        findingIdCounter
      );
      findings.push(...vagueInCriterion);

      // Check format
      if (criterion.format === 'unstructured') {
        findings.push(
          createFinding(
            findingIdCounter,
            'requirements',
            criterion.line,
            criterion.text,
            'High',
            'Unstructured Criterion',
            `Criterion does not follow GIVEN/WHEN/THEN or EARS format.`,
            `Rewrite using GIVEN/WHEN/THEN: "GIVEN <precondition>, WHEN <trigger>, THEN <result>" or use an EARS pattern (e.g., "The system shall <behavior>").`
          )
        );
      }

      // Check testability
      if (!criterion.isTestable) {
        findings.push(
          createFinding(
            findingIdCounter,
            'requirements',
            criterion.line,
            criterion.text,
            'High',
            'Untestable Criterion',
            `Criterion is not testable. Avoid vague terms like "user should be happy".`,
            `Rewrite with measurable outcomes: "The system shall respond in < 1 second" instead of "should be fast".`
          )
        );
      }
    });

    // 4. Check orphaned requirement (only if referencedIds is not empty)
    if (referencedIds.size > 0 && !referencedIds.has(req.id)) {
      findings.push(
        createFinding(
          findingIdCounter,
          'requirements',
          req.startLine,
          req.id,
          'Medium',
          'Orphaned Requirement',
          `Requirement ${req.id} is not referenced by any task.`,
          `Add a task reference in tasks.md or remove this requirement if it's no longer needed.`
        )
      );
    }
  });

  // 5. Detect duplicates
  const duplicates = findDuplicates(
    requirements.map((r) => ({
      id: r.id,
      text: `${r.title} ${r.description} ${r.acceptanceCriteria.map((c) => c.text).join(' ')}`,
    })),
    0.9
  );

  duplicates.forEach((dup) => {
    const req1 = requirements.find((r) => r.id === dup.id1);
    const req2 = requirements.find((r) => r.id === dup.id2);

    if (req1 && req2) {
      findings.push(
        createFinding(
          findingIdCounter,
          'requirements',
          req1.startLine,
          dup.excerpt,
          'High',
          'Duplicate Requirements',
          `Requirements ${req1.id} and ${req2.id} are duplicates (similarity: ${(dup.similarity * 100).toFixed(1)}%).`,
          `Merge the two requirements or clarify their distinct purposes.`
        )
      );
    }
  });

  return findings;
}

/**
 * Audits a parsed design file.
 *
 * Checks:
 * 1. Data Model presence: section must have 2+ distinct terms from vocabulary, 200+ chars, and structured element or 2+ sentences
 * 2. Error Handling presence: same criteria as Data Model
 * 3. API Contracts: conditional check
 *    - If no interface surface described: skip (no finding)
 *    - If interface surfaces described but contracts unspecified: Critical finding
 *    - If both present: validate completeness (future enhancement)
 *
 * @param sections Parsed design sections
 * @returns Array of findings
 */
export function auditDesign(sections: DesignSection[]): Finding[] {
  const findings: Finding[] = [];
  const findingIdCounter = { count: 0 };

  // Helper: extract non-heading content
  const extractNonHeadingContent = (content: string): string => {
    return content
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
  };

  // Helper: count distinct vocabulary terms with word-bounded matching
  const countDistinctVocabTerms = (
    content: string,
    vocab: Set<string>
  ): number => {
    const lowerContent = content.toLowerCase();
    const found = new Set<string>();

    vocab.forEach((term) => {
      // Single-word term: match with optional trailing 's'
      if (!term.includes(' ')) {
        // Create pattern: \bterm(s)?\b
        const pattern = new RegExp(`\\b${term}s?\\b`, 'i');
        if (pattern.test(lowerContent)) {
          found.add(term);
        }
      } else {
        // Multi-word term: match phrase with optional trailing 's' on last word
        const words = term.split(' ');
        const lastWord = words[words.length - 1];
        const precedingWords = words.slice(0, -1).join(' ');
        const escapedPreceding = precedingWords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedLastWord = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Pattern: preceding words, then last word with optional 's'
        const pattern = new RegExp(`\\b${escapedPreceding}\\s+${escapedLastWord}s?\\b`, 'i');
        if (pattern.test(lowerContent)) {
          found.add(term);
        }
      }
    });

    return found.size;
  };

  // Helper: detect structured elements (list, table, code block)
  const hasStructuredElement = (content: string): boolean => {
    // List: lines starting with - or *
    // Table: lines with |
    // Code block: ``` or ~~~
    const hasLists = /^\s*[-*]\s+/m.test(content);
    const hasTable = /\|/.test(content);
    const hasCodeBlock = /```|~~~/.test(content);

    return hasLists || hasTable || hasCodeBlock;
  };

  // Helper: count sentences (roughly: text ending with . ! or ?)
  const countSentences = (content: string): number => {
    return (content.match(/[.!?]/g) || []).length;
  };

  // Helper: section is present and meets criteria
  const isSectionPresent = (
    sectionTitle: string,
    vocab: Set<string>
  ): { present: boolean; contentLength: number } => {
    const lowerSectionTitle = sectionTitle.toLowerCase();
    let matchedSections: DesignSection[] = [];

    // Find ALL sections by keyword matching
    for (const section of sections) {
      const titleLower = section.title.toLowerCase();
      if (
        (titleLower.includes('data model') ||
        titleLower.includes('data flow')) &&
        vocab === DESIGN_VOCABULARIES.dataModel
      ) {
        matchedSections.push(section);
      } else if (
        titleLower.includes('error handling') &&
        vocab === DESIGN_VOCABULARIES.errorHandling
      ) {
        matchedSections.push(section);
      } else if (
        (titleLower.includes('api') ||
        titleLower.includes('endpoint') ||
        titleLower.includes('interface') ||
        titleLower.includes('contract')) &&
        vocab === DESIGN_VOCABULARIES.apiContracts
      ) {
        matchedSections.push(section);
      }
    }

    if (matchedSections.length === 0) {
      return { present: false, contentLength: 0 };
    }

    // Check if ANY matching section meets criteria
    for (const matchedSection of matchedSections) {
      const nonHeadingContent = extractNonHeadingContent(matchedSection.content);
      const contentLength = nonHeadingContent.length;
      const distinctTerms = countDistinctVocabTerms(nonHeadingContent, vocab);
      const hasStructured = hasStructuredElement(nonHeadingContent);
      const sentences = countSentences(nonHeadingContent);

      // Presence criteria: 2+ distinct terms AND 200+ chars AND (structured element OR 2+ sentences)
      const meetsTerms = distinctTerms >= 2;
      const meetsLength = contentLength >= 200;
      const meetsStructure = hasStructured || sentences >= 2;

      if (meetsTerms && meetsLength && meetsStructure) {
        return { present: true, contentLength };
      }
    }

    // None of the matching sections met criteria
    return { present: false, contentLength: 0 };
  };

  // 1. Check Data Model
  const dataModelPresent = isSectionPresent('Data Model', DESIGN_VOCABULARIES.dataModel);
  if (!dataModelPresent.present) {
    findings.push(
      createFinding(
        findingIdCounter,
        'design',
        1,
        'Data Model section missing',
        'Critical',
        'Missing Data Model',
        `Design does not include data model documentation. It should contain at least 2 distinct data model terms (schema, structure, entity, database, model, table, class, object, field, attribute, relationship, diagram, ER, normalization, primary key, foreign key), at least 200 characters, and either a structured element (list, table, code block) or 2+ sentences.`,
        `Add a "Data Model" section describing the data structures, entities, and relationships in your system.`
      )
    );
  }

  // 2. Check Error Handling
  const errorHandlingPresent = isSectionPresent(
    'Error Handling',
    DESIGN_VOCABULARIES.errorHandling
  );
  if (!errorHandlingPresent.present) {
    findings.push(
      createFinding(
        findingIdCounter,
        'design',
        1,
        'Error Handling section missing',
        'Critical',
        'Missing Error Handling',
        `Design does not include error handling strategy. It should contain at least 2 distinct error handling terms (error, exception, failure, retry, validation, assert, throw, catch, try, fault, crash, recovery, logging, monitoring, graceful, degradation, fallback), at least 200 characters, and either a structured element or 2+ sentences.`,
        `Add an "Error Handling" section describing how the system handles failures, exceptions, and edge cases.`
      )
    );
  }

  // 3. Check API Contracts (conditional)
  // Check if any API/interface surface is described (from titles OR content)
  // 'rest' must match as uppercase token REST (case-sensitive)
  // 'restful' matches case-insensitive
  const surfaceSignalsLowerCase = ['api', 'endpoint', 'interface', 'service boundary', 'grpc', 'graphql', 'http', 'tcp', 'protocol', 'restful'];
  const surfaceSignalsExact = ['REST']; // case-sensitive uppercase only
  
  const interfaceDescribed = sections.some((s) => {
    const titleLower = s.title.toLowerCase();
    const contentLower = s.content.toLowerCase();
    const contentOriginal = s.content;
    
    // Check lowercase signals in title and content (case-insensitive)
    const foundLowerInTitle = surfaceSignalsLowerCase.some(signal => {
      const regex = new RegExp(`\\b${signal}\\b`, 'i');
      return regex.test(titleLower);
    });
    
    const foundLowerInContent = surfaceSignalsLowerCase.some(signal => {
      const regex = new RegExp(`\\b${signal}\\b`, 'i');
      return regex.test(contentLower);
    });
    
    // Check uppercase REST (case-sensitive) only in original content
    const foundRestExact = /\bREST\b/.test(contentOriginal);
    
    return foundLowerInTitle || foundLowerInContent || foundRestExact;
  });

  if (interfaceDescribed) {
    // Interface surfaces are described - check if contracts are specified
    const contractsPresent = isSectionPresent(
      'API Contracts',
      DESIGN_VOCABULARIES.apiContracts
    );

    if (!contractsPresent.present) {
      findings.push(
        createFinding(
          findingIdCounter,
          'design',
          1,
          'API Contracts section missing',
          'Critical',
          'Missing API Contracts',
          `Design describes interface surfaces (APIs, endpoints, or service boundaries) but does not specify API contracts. This is critical for implementation clarity.`,
          `Add an "API Contracts" section documenting request/response formats, parameters, headers, status codes, and authentication requirements.`
        )
      );
    }
  }
  // If no interface surface described, skip API contracts check (no finding)

  return findings;
}

/**
 * Audits a parsed tasks file.
 *
 * Checks:
 * 1. Requirement references: each task must reference at least one requirement
 * 2. Oversized tasks: flag tasks with > 5 acceptance criteria
 * 3. No acceptance criteria: flag tasks missing criteria
 * 4. Unstructured/untestable criteria: flag within tasks
 *
 * @param tasks Parsed tasks array
 * @returns Array of findings
 */
export function auditTasks(tasks: Task[]): Finding[] {
  const findings: Finding[] = [];
  const findingIdCounter = { count: 0 };

  tasks.forEach((task) => {
    // 1. Check requirement references
    if (task.requirementReferences.length === 0) {
      findings.push(
        createFinding(
          findingIdCounter,
          'tasks',
          task.startLine,
          task.id,
          'High',
          'Missing Requirement Reference',
          `Task ${task.id} does not reference any requirement (R-number).`,
          `Add a requirement reference in the task description: "References: R1, R2" or link in the acceptance criteria.`
        )
      );
    }

    // 2. Check oversized tasks
    if (task.acceptanceCriteria.length > 5) {
      findings.push(
        createFinding(
          findingIdCounter,
          'tasks',
          task.startLine,
          task.id,
          'Medium',
          'Oversized Task',
          `Task ${task.id} has ${task.acceptanceCriteria.length} acceptance criteria (> 5).`,
          `Break this task into smaller, independently implementable tasks. Each task should have at most 5 acceptance criteria.`
        )
      );
    }

    // 3. Check for missing acceptance criteria
    if (task.acceptanceCriteria.length === 0) {
      findings.push(
        createFinding(
          findingIdCounter,
          'tasks',
          task.startLine,
          task.id,
          'Medium',
          'No Acceptance Criteria',
          `Task ${task.id} has no acceptance criteria.`,
          `Add acceptance criteria describing what "done" means for this task.`
        )
      );
    }

    // 4. Check for unstructured or untestable criteria
    task.acceptanceCriteria.forEach((criterion) => {
      if (criterion.format === 'unstructured') {
        findings.push(
          createFinding(
            findingIdCounter,
            'tasks',
            criterion.line,
            criterion.text,
            'Medium',
            'Unstructured Criterion',
            `Task criterion does not follow GIVEN/WHEN/THEN or EARS format.`,
            `Rewrite using: "GIVEN <state>, WHEN <event>, THEN <result>" or "The system shall <behavior>".`
          )
        );
      }

      if (!criterion.isTestable) {
        findings.push(
          createFinding(
            findingIdCounter,
            'tasks',
            criterion.line,
            criterion.text,
            'Medium',
            'Untestable Criterion',
            `Criterion is not testable.`,
            `Use measurable, verifiable language. Example: "Response time < 1 second" instead of "should be fast".`
          )
        );
      }
    });
  });

  return findings;
}

/**
 * Checks a text snippet for vague language.
 * Flags each occurrence of vague terms with specific line number and quote.
 *
 * @param text The text to check
 * @param baseLineNumber The starting line number
 * @param fileType The file type ('requirements', 'design', or 'tasks')
 * @param findingIdCounter Shared counter object from caller to ensure sequential IDs
 * @returns Array of findings for vague language
 */
function checkVagueLanguage(
  text: string,
  baseLineNumber: number,
  fileType: 'requirements' | 'design' | 'tasks',
  findingIdCounter: { count: number }
): Finding[] {
  const findings: Finding[] = [];

  VAGUE_TERMS.forEach((term) => {
    // Case-insensitive search
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      const quote = extractQuote(text, match.index, 100);
      findings.push(
        createFinding(
          findingIdCounter,
          fileType as any,
          baseLineNumber,
          quote,
          'Low',
          'Vague Language',
          `Text contains vague term "${term}".`,
          `Replace with precise language. Examples: "may" → "will" or "optional feature X"; "might" → "will" or "will not"; "could" → specific requirement.`
        )
      );
    }
  });

  return findings;
}

/**
 * Extracts a quote around a match position.
 *
 * @param text The full text
 * @param position The match position
 * @param contextLength Approximate length of context on each side
 * @returns Quoted text with context
 */
function extractQuote(text: string, position: number, contextLength: number): string {
  const start = Math.max(0, position - contextLength);
  const end = Math.min(text.length, position + contextLength);
  const quote = text.substring(start, end).trim();
  return quote.length > 0 ? quote : text.substring(position, position + 20);
}

/**
 * Helper to create a Finding object with auto-incremented ID.
 *
 * @param counter Object to track finding count
 * @param file File type
 * @param line Line number
 * @param quote Quoted text
 * @param severity Severity level
 * @param category Category name
 * @param message Detailed message
 * @param suggestion Fix suggestion
 * @returns Finding object
 */
function createFinding(
  counter: { count: number },
  file: 'requirements' | 'design' | 'tasks',
  line: number,
  quote: string,
  severity: 'Critical' | 'High' | 'Medium' | 'Low',
  category: string,
  message: string,
  suggestion: string
): Finding {
  counter.count++;

  return {
    id: `finding-${file}-${counter.count}`,
    file,
    line,
    lineRange: [line, line],
    severity,
    category,
    quote,
    message,
    suggestion,
  };
}
