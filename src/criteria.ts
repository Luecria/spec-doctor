/**
 * Criterion classification utilities.
 * Determines format (GIVEN/WHEN/THEN, EARS, or unstructured) and testability.
 */

/**
 * Classifies a criterion text and returns its format and testability assessment.
 *
 * @param text The criterion text (trimmed)
 * @returns Object with format, isTestable flag, and issues array
 */
export function classifyCriterion(text: string): {
  format: 'given-when-then' | 'ears' | 'unstructured';
  isTestable: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  let format: 'given-when-then' | 'ears' | 'unstructured' = 'unstructured';

  // (a) Check for GIVEN/WHEN/THEN format (case-insensitive prefix matching)
  // Trimmed text must start with GIVEN (case-insensitive)
  // 'when' must appear after 'given'
  // 'then' must appear after 'when'
  // Mid-sentence occurrences do not count
  const trimmed = text.trim();
  // Derive lowerText from trimmed text properly
  const lowerText = trimmed.toLowerCase();

  if (lowerText.startsWith('given')) {
    // Find 'given' at the start, then look for 'when' after it, then 'then' after that
    const givenIdx = 0; // already at start
    const whenIdx = lowerText.indexOf('when', givenIdx);
    const thenIdx = whenIdx >= 0 ? lowerText.indexOf('then', whenIdx) : -1;

    if (whenIdx > givenIdx && thenIdx > whenIdx) {
      format = 'given-when-then';
    }
  }

  // (b) Check for EARS patterns (anchored regexes)
  const earsPatterns = [
    /^the\s+system\s+shall/i, // Ubiquitous
    /^when\s+.+,\s+the\s+system\s+shall/i, // Event-driven
    /^while\s+.+,\s+the\s+system\s+shall/i, // State-driven
    /^if\s+.+,\s+then\s+the\s+system\s+shall/i, // Unwanted
    /^where\s+.+,\s+the\s+system\s+shall/i, // Optional
  ];

  const matchesEars = earsPatterns.some((pattern) => pattern.test(trimmed));
  if (matchesEars) {
    format = 'ears';
  }

  // (c) Check for untestable terms (narrowed list, word/phrase bounded)
  // Normalize hyphens to spaces for matching untestable phrases
  const normalizedText = trimmed.replace(/-/g, ' ');
  const normalizedLower = normalizedText.toLowerCase();

  const untestablePhrases = [
    'should be happy',
    'should be nice',
    'user friendly',
    'easy to use',
  ];

  const untestableWords = ['fast', 'slow', 'intuitive', 'unintuitive'];

  let isTestable = true;

  // Check phrase-bounded items (case-insensitive)
  for (const phrase of untestablePhrases) {
    if (normalizedLower.includes(phrase)) {
      isTestable = false;
      break;
    }
  }

  // Check word-bounded items (case-insensitive)
  if (isTestable) {
    for (const word of untestableWords) {
      const pattern = new RegExp(`\\b${word}\\b`, 'i');
      if (pattern.test(normalizedLower)) {
        isTestable = false;
        break;
      }
    }
  }

  // Populate issues
  if (!isTestable) {
    issues.push('Criterion is not testable');
  }

  if (format === 'unstructured') {
    issues.push('Criterion does not follow GIVEN/WHEN/THEN or EARS format');
  }

  return {
    format,
    isTestable,
    issues,
  };
}
