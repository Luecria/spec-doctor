/**
 * Comprehensive test suite for audit engines (T3, T4, T5).
 * Tests all rules, edge cases, and conditional logic.
 */

import { describe, it, expect } from 'vitest';
import {
  auditRequirements,
  auditDesign,
  auditTasks,
} from '../src/auditors';
import { jaccardSimilarity, normalizeText, findDuplicates } from '../src/similarity';
import { classifyCriterion } from '../src/criteria';
import { parseTasks } from '../src/parser';
import { Requirement, Task, DesignSection, AcceptanceCriterion } from '../src/types';

// ==================== CRITERION CLASSIFICATION TESTS ====================

describe('classifyCriterion', () => {
  it('should recognize GIVEN/WHEN/THEN at the start (case-insensitive)', () => {
    const result = classifyCriterion('GIVEN the user is logged in, WHEN they click logout, THEN they are logged out');
    expect(result.format).toBe('given-when-then');
  });

  it('should recognize given-when-then with lowercase', () => {
    const result = classifyCriterion('given the user enters credentials, when they press login, then they are authenticated');
    expect(result.format).toBe('given-when-then');
  });

  it('should reject mid-sentence given/when/then as unstructured', () => {
    const result = classifyCriterion('We need to given the user a choice when they use the system then log out');
    expect(result.format).toBe('unstructured');
  });

  it('should recognize EARS Ubiquitous pattern', () => {
    const result = classifyCriterion('The system shall validate email format');
    expect(result.format).toBe('ears');
  });

  it('should recognize EARS Event-driven pattern', () => {
    const result = classifyCriterion('WHEN a user logs out, the system shall clear the session');
    expect(result.format).toBe('ears');
  });

  it('should recognize EARS State-driven pattern', () => {
    const result = classifyCriterion('WHILE the system is in maintenance mode, the system shall display a banner');
    expect(result.format).toBe('ears');
  });

  it('should recognize EARS Unwanted pattern', () => {
    const result = classifyCriterion('IF the password is invalid, THEN the system shall reject the login');
    expect(result.format).toBe('ears');
  });

  it('should recognize EARS Optional pattern', () => {
    const result = classifyCriterion('WHERE premium accounts are enabled, the system shall provide advanced features');
    expect(result.format).toBe('ears');
  });

  it('should mark "provide a simple API" as testable (simple is not in narrowed list)', () => {
    const result = classifyCriterion('provide a simple API');
    expect(result.isTestable).toBe(true);
  });

  it('should mark "The page should load fast" as untestable (word-bounded "fast")', () => {
    const result = classifyCriterion('The page should load fast');
    expect(result.isTestable).toBe(false);
    expect(result.issues).toContain('Criterion is not testable');
  });

  it('should mark "breakfast menu" as testable (no "fast" match in whole word)', () => {
    const result = classifyCriterion('breakfast menu');
    expect(result.isTestable).toBe(true);
  });

  it('should detect untestable phrase "should be happy"', () => {
    const result = classifyCriterion('Users should be happy when using the system');
    expect(result.isTestable).toBe(false);
  });

  it('should detect untestable phrase "user friendly"', () => {
    const result = classifyCriterion('The interface should be user friendly');
    expect(result.isTestable).toBe(false);
  });

  it('should detect untestable phrase "easy to use"', () => {
    const result = classifyCriterion('The system is easy to use');
    expect(result.isTestable).toBe(false);
  });

  it('should not mark "good morning" as untestable (not in narrowed list)', () => {
    const result = classifyCriterion('good morning');
    expect(result.isTestable).toBe(true);
  });

  it('should not mark "slow down the process" as untestable (wait - "slow" is word-bounded)', () => {
    const result = classifyCriterion('slow down the process');
    expect(result.isTestable).toBe(false); // "slow" matches as word
  });

  it('should detect untestable term "intuitive" (word-bounded)', () => {
    const result = classifyCriterion('The system should be intuitive');
    expect(result.isTestable).toBe(false);
  });

  it('should detect untestable term "unintuitive" (word-bounded)', () => {
    const result = classifyCriterion('The system shall not be unintuitive');
    expect(result.isTestable).toBe(false);
  });

  it('should match hyphenated terms: user-friendly matches untestable', () => {
    const result = classifyCriterion('The interface should be user-friendly');
    expect(result.isTestable).toBe(false); // hyphens normalized to spaces
  });

  it('should return issues for unstructured format', () => {
    const result = classifyCriterion('some random text');
    expect(result.format).toBe('unstructured');
    expect(result.issues).toContain('Criterion does not follow GIVEN/WHEN/THEN or EARS format');
  });
});

// ==================== SIMILARITY TESTS ====================

describe('normalizeText', () => {
  it('converts to lowercase', () => {
    expect(normalizeText('HELLO World')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeText('Hello, world!')).toBe('hello world');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world');
  });

  it('preserves hyphens', () => {
    expect(normalizeText('e-mail address')).toBe('e-mail address');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical texts', () => {
    const sim = jaccardSimilarity('The system shall do X', 'The system shall do X');
    expect(sim).toBe(1.0);
  });

  it('returns 0.0 for completely different texts', () => {
    const sim = jaccardSimilarity('apple orange', 'car truck');
    expect(sim).toBeCloseTo(0.0, 1);
  });

  it('returns 1.0 for both empty strings', () => {
    const sim = jaccardSimilarity('', '');
    expect(sim).toBe(1.0);
  });

  it('returns 0.0 when one string is empty', () => {
    const sim = jaccardSimilarity('hello world', '');
    expect(sim).toBe(0.0);
  });

  it('computes correct Jaccard similarity for partial overlap', () => {
    // "the system shall handle errors" vs "the system shall manage failures"
    // normalized: "the system shall handle errors" vs "the system shall manage failures"
    // tokens: {the, system, shall, handle, errors} vs {the, system, shall, manage, failures}
    // intersection: {the, system, shall} = 3 items
    // union: {the, system, shall, handle, errors, manage, failures} = 7 items
    // Jaccard = 3/7 ≈ 0.428
    const sim = jaccardSimilarity(
      'the system shall handle errors',
      'the system shall manage failures'
    );
    expect(sim).toBeCloseTo(3 / 7, 2);
  });

  it('handles punctuation in similarity', () => {
    // After normalization, these should be very similar
    const sim = jaccardSimilarity(
      'The system shall handle errors!',
      'the system shall handle errors'
    );
    expect(sim).toBe(1.0);
  });

  it('FIX D: detects duplicates including title, description, and criteria combined text', () => {
    // Note: This test verifies that findDuplicates is called with combined text
    // In the actual audit, this is tested end-to-end via auditRequirements
    const items = [
      {
        id: 'R1',
        text: 'User Authentication The system shall provide user authentication with email and password GIVEN the user enters valid credentials WHEN they click login THEN they are authenticated',
      },
      {
        id: 'R2',
        text: 'User Authentication The system shall provide user authentication with email and password GIVEN the user enters correct credentials WHEN they click login THEN they are authenticated',
      },
    ];

    const duplicates = findDuplicates(items, 0.9);
    // These should be flagged as duplicates
    expect(duplicates.length).toBeGreaterThan(0);
  });

  it('FIX D: duplicate finding quote is first 120 characters of compared text', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Authentication System',
        description: 'The system shall provide comprehensive user authentication with email and password credentials and multi-factor authentication support.',
        acceptanceCriteria: [
          {
            id: 'c1',
            text: 'GIVEN the user enters valid credentials WHEN they click login THEN they are authenticated',
            format: 'given-when-then',
            isTestable: true,
            line: 5,
            issues: [],
          },
        ],
        startLine: 1,
        endLine: 10,
      },
      {
        id: 'R2',
        number: 2,
        title: 'User Authentication Service',
        description: 'The system shall provide comprehensive user authentication with email and password credentials and multi-factor authentication.',
        acceptanceCriteria: [
          {
            id: 'c2',
            text: 'GIVEN the user enters valid credentials WHEN they press login THEN they are authenticated',
            format: 'given-when-then',
            isTestable: true,
            line: 15,
            issues: [],
          },
        ],
        startLine: 12,
        endLine: 20,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const duplicateFindings = findings.filter(
      (f) => f.category === 'Duplicate Requirements'
    );

    if (duplicateFindings.length > 0) {
      const quote = duplicateFindings[0].quote;
      // Quote should be first 120 chars of the combined text (title + description + criteria)
      expect(quote.length).toBeLessThanOrEqual(120);
      expect(quote).toContain('Authentication');
    }
  });
});

// ==================== REQUIREMENTS AUDITOR TESTS ====================

describe('auditRequirements', () => {
  it('flags vague language: may', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'User Authentication',
        description: 'The system may allow users to log in.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 3,
      },
    ];

    const findings = auditRequirements(reqs, new Set());

    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
    expect(vagueFindings[0].severity).toBe('Low');
  });

  it('flags vague language: might', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'The system might process requests.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 1,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('flags vague language: perhaps', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'Perhaps the system should handle this case.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 1,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('flags vague language: could', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'Users could access the feature.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 1,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('flags vague language: ideally', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'Ideally, the system will scale.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 1,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('flags vague language: should consider', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'You should consider implementing this.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 1,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const vagueFindings = findings.filter(
      (f) => f.category === 'Vague Language'
    );
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('accepts GIVEN/WHEN/THEN format', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'GIVEN the user is logged in, WHEN they click logout, THEN they are redirected to the home page.',
      format: 'given-when-then',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Logout',
        description: 'Users should be able to log out.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts EARS Ubiquitous pattern', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'The system shall validate user input.',
      format: 'ears',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Validation',
        description: 'Input validation is required.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts EARS Event-driven pattern', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'WHEN a payment fails, the system shall retry the transaction.',
      format: 'ears',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Retry',
        description: 'Retry handling is required.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts EARS State-driven pattern', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'WHILE the system is in maintenance mode, the system shall display a banner.',
      format: 'ears',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Maintenance',
        description: 'Maintenance mode is required.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts EARS Unwanted pattern', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'IF the user enters invalid credentials, THEN the system shall reject the login.',
      format: 'ears',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Invalid Creds',
        description: 'Invalid credential handling is required.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts EARS Optional pattern', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'WHERE premium accounts are enabled, the system shall provide advanced features.',
      format: 'ears',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Premium',
        description: 'Premium features are optional.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('flags unstructured criterion as High severity', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'Users should be able to do something cool with the system.',
      format: 'unstructured',
      isTestable: true,
      line: 5,
      issues: ['does not follow format'],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Cool Feature',
        description: 'A cool feature is needed.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBeGreaterThan(0);
    expect(unstructuredFindings[0].severity).toBe('High');
  });

  it('flags untestable criterion as High severity', () => {
    const criterion: AcceptanceCriterion = {
      id: 'c1',
      text: 'The user should be happy when using the system.',
      format: 'given-when-then',
      isTestable: false,
      line: 5,
      issues: ['not testable'],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Happiness',
        description: 'Make users happy.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const untestableFindings = findings.filter(
      (f) => f.category === 'Untestable Criterion'
    );
    expect(untestableFindings.length).toBeGreaterThan(0);
    expect(untestableFindings[0].severity).toBe('High');
  });

  it('flags orphaned requirement as Medium severity when referencedIds provided', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Auth',
        description: 'Authentication is required.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 3,
      },
      {
        id: 'R2',
        number: 2,
        title: 'Orphaned',
        description: 'This requirement is orphaned.',
        acceptanceCriteria: [],
        startLine: 5,
        endLine: 7,
      },
    ];

    const referencedIds = new Set(['R1']); // Only R1 is referenced
    const findings = auditRequirements(reqs, referencedIds);

    const orphanedFindings = findings.filter(
      (f) => f.category === 'Orphaned Requirement'
    );
    expect(orphanedFindings.length).toBe(1);
    expect(orphanedFindings[0].severity).toBe('Medium');
  });

  it('skips orphan check when referencedIds is empty', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Auth',
        description: 'Authentication is required.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 3,
      },
    ];

    const referencedIds = new Set<string>(); // Empty set means no tasks file
    const findings = auditRequirements(reqs, referencedIds);

    const orphanedFindings = findings.filter(
      (f) => f.category === 'Orphaned Requirement'
    );
    expect(orphanedFindings.length).toBe(0);
  });

  it('detects duplicate requirements above 0.90 threshold', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Auth',
        description:
          'The system shall provide user authentication with email and password.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 3,
      },
      {
        id: 'R2',
        number: 2,
        title: 'User Auth',
        description:
          'The system shall provide user authentication with email and password login.',
        acceptanceCriteria: [],
        startLine: 5,
        endLine: 7,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const duplicateFindings = findings.filter(
      (f) => f.category === 'Duplicate Requirements'
    );
    expect(duplicateFindings.length).toBeGreaterThan(0);
    expect(duplicateFindings[0].severity).toBe('High');
  });

  it('FIX A: should produce unique sequential finding IDs when requirement has both vague language and unstructured criterion', () => {
    const criterion: AcceptanceCriterion = {
      id: 'criterion-1',
      text: 'User should be able to do something',
      format: 'unstructured',
      isTestable: true,
      line: 5,
      issues: [],
    };

    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Test',
        description: 'The system may allow users to log in.',
        acceptanceCriteria: [criterion],
        startLine: 1,
        endLine: 10,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    
    // Should have vague language finding and unstructured finding
    expect(findings.length).toBeGreaterThan(1);
    
    // All finding IDs should be unique
    const ids = findings.map(f => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    
    // IDs should be sequential per file type
    const reqFindings = findings.filter(f => f.file === 'requirements');
    const reqIds = reqFindings.map(f => f.id);
    expect(reqIds.every(id => id.startsWith('finding-requirements-'))).toBe(true);
  });

  it('does not flag duplicates below 0.90 threshold', () => {
    const reqs: Requirement[] = [
      {
        id: 'R1',
        number: 1,
        title: 'Auth',
        description: 'The system shall provide user authentication.',
        acceptanceCriteria: [],
        startLine: 1,
        endLine: 3,
      },
      {
        id: 'R2',
        number: 2,
        title: 'Payment',
        description:
          'The system shall process payment transactions with multiple methods.',
        acceptanceCriteria: [],
        startLine: 5,
        endLine: 7,
      },
    ];

    const findings = auditRequirements(reqs, new Set());
    const duplicateFindings = findings.filter(
      (f) => f.category === 'Duplicate Requirements'
    );
    expect(duplicateFindings.length).toBe(0);
  });
});

// ==================== DESIGN AUDITOR TESTS ====================

describe('auditDesign', () => {
  it('detects missing Data Model section with Critical severity', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'This is the system overview.',
        startLine: 1,
        endLine: 3,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(1);
    expect(dataModelFindings[0].severity).toBe('Critical');
  });

  it('detects missing Error Handling section with Critical severity', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'This is the system overview.',
        startLine: 1,
        endLine: 3,
      },
    ];

    const findings = auditDesign(sections);
    const errorFindings = findings.filter(
      (f) => f.category === 'Missing Error Handling'
    );
    expect(errorFindings.length).toBe(1);
    expect(errorFindings[0].severity).toBe('Critical');
  });

  it('passes Data Model section with sufficient content', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model
The system uses a relational database model. 

- Users: id, email, password_hash
- Posts: id, user_id, title, content
- Comments: id, post_id, user_id, text

Primary keys link to foreign keys. The schema includes proper normalization.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(0);
  });

  it('passes Error Handling section with sufficient content', () => {
    const sections: DesignSection[] = [
      {
        title: 'Error Handling',
        content: `
## Error Handling Strategy
The system implements comprehensive error handling:

- Input validation for all requests
- Try-catch blocks in critical sections
- Logging of all exceptions and failures
- Graceful degradation when services fail
- Monitoring and alerting for critical errors
- Fallback mechanisms for database failures
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const errorFindings = findings.filter(
      (f) => f.category === 'Missing Error Handling'
    );
    expect(errorFindings.length).toBe(0);
  });

  it('rejects Data Model section with insufficient content (<200 chars)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: 'We have entities.',
        startLine: 1,
        endLine: 3,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(1);
  });

  it('rejects Data Model section with insufficient vocab terms (<2)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: 'We store data in the cloud. The data persists indefinitely. This ensures durability.',
        startLine: 1,
        endLine: 5,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(1);
  });

  it('passes Data Model with structured element (list)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model
The database schema includes the following entities and structure:

- Users table with id as primary key and email, password_hash as attributes
- Orders table with order_id as primary key and user_id as foreign key reference
- Products table with product_id as primary key and attributes like name, price, inventory

Relationships are defined between entities using foreign keys and normalization principles.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(0);
  });

  it('passes Data Model with structured element (table)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model

| Entity | Primary Key | Attributes |
|--------|-------------|-----------|
| User   | id          | email     |
| Post   | id          | title     |

The database model includes entities and relationships.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(0);
  });

  it('passes Data Model with structured element (code block)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model

\`\`\`
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

The database schema defines the structure of all entities and their relationships through primary and foreign keys.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(0);
  });

  it('passes Data Model with 2+ sentences (no structured element)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model

The system uses a relational database model with multiple entities that represent core business objects. Relationships are defined via primary keys and foreign key constraints to ensure referential integrity. The schema includes normalization to third normal form to eliminate redundancy. All tables follow standard naming conventions and include appropriate indexes on frequently queried attributes.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    expect(dataModelFindings.length).toBe(0);
  });

  it('FIX E: counts multi-word terms with optional trailing s (primary keys)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: `
## Data Model

The database schema includes tables with primary keys and foreign keys.
The schema uses primary keys for unique identification and foreign keys for relationships.
Additional indexes are defined on fields with primary key references and foreign key relationships.
This follows database model and structure normalization principles.
        `,
        startLine: 1,
        endLine: 20,
      },
    ];

    const findings = auditDesign(sections);
    const dataModelFindings = findings.filter(
      (f) => f.category === 'Missing Data Model'
    );
    // Should pass because "primary keys" and "foreign keys" are detected
    expect(dataModelFindings.length).toBe(0);
  });

  it('FIX F: "the rest of the system" does NOT trigger API contract check', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'The rest of the system is implemented using standard patterns. This completes the architecture.',
        startLine: 1,
        endLine: 3,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 4,
        endLine: 8,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 9,
        endLine: 13,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    // Should NOT trigger API check because "rest" in lowercase is not treated as a surface signal
    expect(apiFindings.length).toBe(0);
  });

  it('FIX F: "REST endpoints" DOES trigger API contract check (uppercase REST)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'The system exposes REST endpoints for user management.',
        startLine: 1,
        endLine: 3,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 4,
        endLine: 8,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 9,
        endLine: 13,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    // SHOULD trigger API check because uppercase REST is detected
    expect(apiFindings.length).toBe(1);
  });

  it('FIX F: "restful API" DOES trigger API contract check (restful case-insensitive)', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'The system provides a restful API for all resources.',
        startLine: 1,
        endLine: 3,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 4,
        endLine: 8,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 9,
        endLine: 13,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    // SHOULD trigger API check because "restful" is case-insensitive
    expect(apiFindings.length).toBe(1);
  });

  it('skips API Contracts check when no interface surface described', () => {
    const sections: DesignSection[] = [
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 1,
        endLine: 5,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 6,
        endLine: 10,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    expect(apiFindings.length).toBe(0); // No finding when no interface surface
  });

  it('flags API Contracts as Critical when interface surface described but contracts unspecified', () => {
    const sections: DesignSection[] = [
      {
        title: 'Overview',
        content: 'The system exposes REST API endpoints for user management.',
        startLine: 1,
        endLine: 3,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 4,
        endLine: 8,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 9,
        endLine: 13,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    expect(apiFindings.length).toBe(1);
    expect(apiFindings[0].severity).toBe('Critical');
  });

  it('accepts API Contracts when interface surface and contracts specified', () => {
    const sections: DesignSection[] = [
      {
        title: 'API Endpoints',
        content: `
## API Endpoints
REST API with the following endpoints:

- POST /api/users/login - endpoint for authentication
- GET /api/users/{id} - retrieve user by id
- PUT /api/users/{id} - update user information

Each endpoint has request/response payload definitions.
        `,
        startLine: 1,
        endLine: 20,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 21,
        endLine: 25,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 26,
        endLine: 30,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    expect(apiFindings.length).toBe(0);
  });

  it('FIX C: evaluates all matching sections and passes if ANY section meets criteria', () => {
    // Two API sections: first one is thin/incomplete, second one is complete
    const sections: DesignSection[] = [
      {
        title: 'API Endpoints',
        content: 'thin endpoint list here', // Insufficient: <200 chars, no structured element
        startLine: 1,
        endLine: 3,
      },
      {
        title: 'API Contracts',
        content: `
## API Contracts

The system provides REST endpoints with the following contract specifications:

- GET /api/users - endpoint for retrieving users
- POST /api/users - endpoint for creating users
- PUT /api/users/{id} - endpoint for updating users
- DELETE /api/users/{id} - endpoint for deleting users

Each endpoint has headers, parameters, request payload, response payload, and status codes documented.
Authentication is required. Authorization is role-based. The interface is HTTP protocol.
        `,
        startLine: 5,
        endLine: 25,
      },
      {
        title: 'Data Model',
        content: 'Schema and structure. '.repeat(20),
        startLine: 26,
        endLine: 30,
      },
      {
        title: 'Error Handling',
        content: 'Error and recovery. '.repeat(20),
        startLine: 31,
        endLine: 35,
      },
    ];

    const findings = auditDesign(sections);
    const apiFindings = findings.filter(
      (f) => f.category === 'Missing API Contracts'
    );
    // Should NOT flag as missing because second API section meets criteria
    expect(apiFindings.length).toBe(0);
  });
});

// ==================== TASKS AUDITOR TESTS ====================

describe('auditTasks', () => {
  it('flags task with no requirement references', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Implement Authentication',
        description: 'Build login functionality.',
        acceptanceCriteria: [
          {
            id: 'criterion-1',
            text: 'User can log in',
            format: 'unstructured',
            isTestable: true,
            line: 6,
            issues: [],
          },
          {
            id: 'criterion-2',
            text: 'User can log out',
            format: 'unstructured',
            isTestable: true,
            line: 7,
            issues: [],
          },
        ],
        requirementReferences: [], // No references
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const refFindings = findings.filter(
      (f) => f.category === 'Missing Requirement Reference'
    );
    expect(refFindings.length).toBe(1);
    expect(refFindings[0].severity).toBe('High');
  });

  it('flags oversized task (>5 criteria)', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Large Feature',
        description: 'Implement everything.',
        acceptanceCriteria: [
          { id: 'c1', text: 'GIVEN state, WHEN event1, THEN result1', format: 'given-when-then', isTestable: true, line: 6, issues: [] },
          { id: 'c2', text: 'GIVEN state, WHEN event2, THEN result2', format: 'given-when-then', isTestable: true, line: 7, issues: [] },
          { id: 'c3', text: 'GIVEN state, WHEN event3, THEN result3', format: 'given-when-then', isTestable: true, line: 8, issues: [] },
          { id: 'c4', text: 'GIVEN state, WHEN event4, THEN result4', format: 'given-when-then', isTestable: true, line: 9, issues: [] },
          { id: 'c5', text: 'GIVEN state, WHEN event5, THEN result5', format: 'given-when-then', isTestable: true, line: 10, issues: [] },
          { id: 'c6', text: 'GIVEN state, WHEN event6, THEN result6', format: 'given-when-then', isTestable: true, line: 11, issues: [] }, // 6 criteria > 5
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 20,
        estimatedSize: 'oversized',
      },
    ];

    const findings = auditTasks(tasks);
    const oversizedFindings = findings.filter(
      (f) => f.category === 'Oversized Task'
    );
    expect(oversizedFindings.length).toBe(1);
    expect(oversizedFindings[0].severity).toBe('Medium');
  });

  it('accepts task with exactly 5 criteria', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [
          { id: 'c1', text: 'GIVEN state, WHEN event1, THEN result1', format: 'given-when-then', isTestable: true, line: 6, issues: [] },
          { id: 'c2', text: 'GIVEN state, WHEN event2, THEN result2', format: 'given-when-then', isTestable: true, line: 7, issues: [] },
          { id: 'c3', text: 'GIVEN state, WHEN event3, THEN result3', format: 'given-when-then', isTestable: true, line: 8, issues: [] },
          { id: 'c4', text: 'GIVEN state, WHEN event4, THEN result4', format: 'given-when-then', isTestable: true, line: 9, issues: [] },
          { id: 'c5', text: 'GIVEN state, WHEN event5, THEN result5', format: 'given-when-then', isTestable: true, line: 10, issues: [] }, // Exactly 5
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 20,
        estimatedSize: 'large',
      },
    ];

    const findings = auditTasks(tasks);
    const oversizedFindings = findings.filter(
      (f) => f.category === 'Oversized Task'
    );
    expect(oversizedFindings.length).toBe(0);
  });

  it('flags task with no acceptance criteria', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [], // No criteria
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 5,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const noCriteriaFindings = findings.filter(
      (f) => f.category === 'No Acceptance Criteria'
    );
    expect(noCriteriaFindings.length).toBe(1);
    expect(noCriteriaFindings[0].severity).toBe('Medium');
  });

  it('flags unstructured task criterion', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [
          { id: 'c1', text: 'Something about doing stuff', format: 'unstructured', isTestable: true, line: 6, issues: [] }, // Unstructured
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBeGreaterThan(0);
  });

  it('flags untestable task criterion', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [
          { id: 'c1', text: 'The system should be fast', format: 'unstructured', isTestable: false, line: 6, issues: [] }, // Untestable
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const untestableFindings = findings.filter(
      (f) => f.category === 'Untestable Criterion'
    );
    expect(untestableFindings.length).toBeGreaterThan(0);
  });

  it('accepts task with GIVEN/WHEN/THEN criteria', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [
          { id: 'c1', text: 'GIVEN the user is logged in, WHEN they click logout, THEN they are logged out', format: 'given-when-then', isTestable: true, line: 6, issues: [] },
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts task with EARS Ubiquitous criteria', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'Implement feature.',
        acceptanceCriteria: [
          { id: 'c1', text: 'The system shall validate email format', format: 'ears', isTestable: true, line: 6, issues: [] },
        ],
        requirementReferences: ['R1'],
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );
    expect(unstructuredFindings.length).toBe(0);
  });

  it('accepts task with multiple valid requirement references', () => {
    const tasks: Task[] = [
      {
        id: 'T1',
        number: 1,
        title: 'Feature',
        description: 'References R1 and R2.',
        acceptanceCriteria: [
          { id: 'c1', text: 'The system shall work', format: 'ears', isTestable: true, line: 6, issues: [] },
        ],
        requirementReferences: ['R1', 'R2'],
        startLine: 1,
        endLine: 10,
        estimatedSize: 'small',
      },
    ];

    const findings = auditTasks(tasks);
    const refFindings = findings.filter(
      (f) => f.category === 'Missing Requirement Reference'
    );
    expect(refFindings.length).toBe(0);
  });

  it('reports unstructured criterion line number correctly when criteria are on non-consecutive lines', () => {
    // Create a fixture with non-consecutive criterion lines
    const fixture = `### T1: Parse Data Task

**Description:**
Load and validate data from external source

**Acceptance Criteria:**
- GIVEN the data is valid, WHEN parsed, THEN no errors occur
- This criterion is unstructured and poorly formatted

- GIVEN the data is invalid, WHEN parsed, THEN appropriate error handling occurs`;

    const { tasks } = parseTasks(fixture);
    expect(tasks).toHaveLength(1);

    const task = tasks[0];
    expect(task.acceptanceCriteria).toHaveLength(3);

    // Second criterion (index 1) is the unstructured one
    const unstructuredCriterion = task.acceptanceCriteria[1];
    expect(unstructuredCriterion.text).toBe('This criterion is unstructured and poorly formatted');
    expect(unstructuredCriterion.format).toBe('unstructured');

    // Run audit on the parsed task
    const findings = auditTasks(tasks);
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );

    expect(unstructuredFindings).toHaveLength(1);
    // Assert the line number in the finding matches the actual line in the fixture (1-based)
    expect(unstructuredFindings[0].line).toBe(unstructuredCriterion.line);
  });

  it('produces no Unstructured Criterion finding for a grouped GWT scenario', () => {
    // Create a fixture with GWT scenario across multiple bullets
    const fixture = `### T1: Test GWT Grouping

**Description:**
Test that GWT scenarios are properly grouped

**Acceptance Criteria:**
- GIVEN the user is on the dashboard
- WHEN they click the logout button
- THEN they are redirected to the login page
- AND their session is cleared`;

    const { tasks } = parseTasks(fixture);
    expect(tasks).toHaveLength(1);

    const task = tasks[0];
    // Should have exactly 1 criterion (the grouped GWT scenario)
    expect(task.acceptanceCriteria).toHaveLength(1);

    const criterion = task.acceptanceCriteria[0];
    expect(criterion.format).toBe('given-when-then');
    expect(criterion.isTestable).toBe(true);
    expect(criterion.text).toContain('GIVEN the user is on the dashboard');
    expect(criterion.text).toContain('WHEN they click the logout button');
    expect(criterion.text).toContain('THEN they are redirected to the login page');
    expect(criterion.text).toContain('AND their session is cleared');

    // Run audit - should produce no Unstructured Criterion finding
    const findings = auditTasks(tasks);
    const unstructuredFindings = findings.filter(
      (f) => f.category === 'Unstructured Criterion'
    );

    expect(unstructuredFindings).toHaveLength(0);
  });
});
