import { describe, it, expect } from 'vitest';
import {
  parseRequirements,
  parseTasks,
  parseDesign,
} from '../src/parser';

describe('parseRequirements', () => {
  it('should extract a single requirement with ID, title, and description', () => {
    const content = `
### R1: User Authentication
This requirement describes user login functionality.

**Acceptance Criteria:**
- GIVEN the user is on the login page
- WHEN they enter credentials
- THEN the system shall authenticate them
`;

    const { requirements } = parseRequirements(content);

    expect(requirements).toHaveLength(1);
    expect(requirements[0].id).toBe('R1');
    expect(requirements[0].number).toBe(1);
    expect(requirements[0].title).toBe('User Authentication');
    expect(requirements[0].description).toContain('login functionality');
  });

  it('should extract multiple requirements with correct IDs and line numbers', () => {
    const content = `
### R1: First Requirement
Description for first.

**Acceptance Criteria:**
- GIVEN condition
- WHEN action
- THEN result

### R2: Second Requirement
Description for second.

**Acceptance Criteria:**
- GIVEN another condition
- WHEN another action
- THEN another result
`;

    const { requirements } = parseRequirements(content);

    expect(requirements).toHaveLength(2);
    expect(requirements[0].id).toBe('R1');
    expect(requirements[0].number).toBe(1);
    expect(requirements[1].id).toBe('R2');
    expect(requirements[1].number).toBe(2);
    expect(requirements[0].startLine).toBeGreaterThan(0);
    expect(requirements[1].startLine).toBeGreaterThan(requirements[0].startLine);
  });

  it('should extract acceptance criteria with correct format classification', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- GIVEN a user is logged in WHEN they visit the dashboard THEN they see their profile
- The system shall display user data
- WHERE admin role, the system shall display admin panel
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(3);
    expect(requirements[0].acceptanceCriteria[0].format).toBe('given-when-then');
    expect(requirements[0].acceptanceCriteria[0].isTestable).toBe(true);
    expect(requirements[0].acceptanceCriteria[1].format).toBe('ears');
    expect(requirements[0].acceptanceCriteria[2].format).toBe('ears');
  });

  it('should detect untestable criteria', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- The system should be user friendly
- The page should load fast
- Users should be happy
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria[0].isTestable).toBe(false);
    expect(requirements[0].acceptanceCriteria[0].issues).toContain(
      'Criterion is not testable'
    );
    expect(requirements[0].acceptanceCriteria[1].isTestable).toBe(false);
    expect(requirements[0].acceptanceCriteria[2].isTestable).toBe(false);
  });

  it('should record line numbers for requirements and criteria', () => {
    const content = `line 1
line 2
### R1: Requirement
line 4
line 5
**Acceptance Criteria:**
- Criteria on line 7
- Criteria on line 8`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].startLine).toBe(3);
    expect(requirements[0].acceptanceCriteria[0].line).toBe(7);
    expect(requirements[0].acceptanceCriteria[1].line).toBe(8);
  });

  it('should assign sequential IDs to unnumbered requirements', () => {
    const content = `
### R1: First Requirement
Description.

**Acceptance Criteria:**
- Criteria

### Unnumbered Requirement
Description.

**Acceptance Criteria:**
- Criteria

### R3: Third Requirement
Description.

**Acceptance Criteria:**
- Criteria

### Another Unnumbered
Description.

**Acceptance Criteria:**
- Criteria
`;

    const { requirements, parseNotes } = parseRequirements(content);

    expect(requirements).toHaveLength(4);
    expect(requirements[0].id).toBe('R1');
    expect(requirements[1].id).toBe('R2');
    expect(requirements[2].id).toBe('R3');
    expect(requirements[3].id).toBe('R4');

    expect(parseNotes).toHaveLength(2);
    expect(parseNotes[0].severity).toBe('warning');
    expect(parseNotes[0].message).toContain('assigned ID R2');
    expect(parseNotes[1].message).toContain('assigned ID R4');
  });

  it('should handle requirements with missing acceptance criteria gracefully', () => {
    const content = `
### R1: Requirement Without Criteria
This requirement has no acceptance criteria section.

### R2: Another Requirement
This one also lacks criteria.
`;

    const { requirements } = parseRequirements(content);

    expect(requirements).toHaveLength(2);
    expect(requirements[0].acceptanceCriteria).toHaveLength(0);
    expect(requirements[1].acceptanceCriteria).toHaveLength(0);
  });

  it('should handle malformed requirements gracefully (no throw)', () => {
    const content = `
### R1: Requirement
Incomplete section
### R2 Missing Colon
Another incomplete
### R3: Valid Requirement
Valid content

**Acceptance Criteria:**
- Valid criteria
`;

    expect(() => {
      parseRequirements(content);
    }).not.toThrow();

    const { requirements } = parseRequirements(content);
    expect(requirements.length).toBeGreaterThan(0);
  });

  it('should handle empty content gracefully', () => {
    const { requirements, parseNotes } = parseRequirements('');

    expect(requirements).toHaveLength(0);
    expect(parseNotes).toHaveLength(0);
  });

  it('should extract criteria with bullet points (- and *)', () => {
    const content = `
### R1: Test
Description.

**Acceptance Criteria:**
- Bullet with dash
* Bullet with asterisk
- Another dash
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(3);
    expect(requirements[0].acceptanceCriteria[0].text).toBe('Bullet with dash');
    expect(requirements[0].acceptanceCriteria[1].text).toBe('Bullet with asterisk');
  });

  it('should extract numbered criteria (1. 2. etc.)', () => {
    const content = `
### R1: Test
Description.

**Acceptance Criteria:**
1. First numbered criterion
2. Second numbered criterion
3. Third numbered criterion
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(3);
    expect(requirements[0].acceptanceCriteria[0].text).toBe('First numbered criterion');
    expect(requirements[0].acceptanceCriteria[1].text).toBe('Second numbered criterion');
    expect(requirements[0].acceptanceCriteria[2].text).toBe('Third numbered criterion');
  });

  it('should group GWT scenarios across multiple bullets into a single criterion', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- GIVEN the user is on the login page
- WHEN they enter credentials
- THEN the system authenticates them
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(1);
    const criterion = requirements[0].acceptanceCriteria[0];
    expect(criterion.text).toBe(
      'GIVEN the user is on the login page WHEN they enter credentials THEN the system authenticates them'
    );
    expect(criterion.line).toBe(6); // Line of GIVEN bullet
    expect(criterion.format).toBe('given-when-then');
    expect(criterion.isTestable).toBe(true);
  });

  it('should group GWT scenario with AND clause into a single criterion', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- GIVEN user is logged in
- WHEN they visit the dashboard
- THEN they see their profile
- AND they see their recent tasks
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(1);
    const criterion = requirements[0].acceptanceCriteria[0];
    expect(criterion.text).toContain('GIVEN user is logged in');
    expect(criterion.text).toContain('WHEN they visit the dashboard');
    expect(criterion.text).toContain('THEN they see their profile');
    expect(criterion.text).toContain('AND they see their recent tasks');
    expect(criterion.line).toBe(6); // Line of GIVEN bullet
  });

  it('should keep a lone GIVEN bullet as a single unstructured criterion', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- GIVEN the user is on the login page
- Something else
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(2);
    const givenCriterion = requirements[0].acceptanceCriteria[0];
    expect(givenCriterion.text).toBe('GIVEN the user is on the login page');
    expect(givenCriterion.line).toBe(6);
    expect(givenCriterion.format).toBe('unstructured');
    expect(givenCriterion.issues).toContain(
      'Criterion does not follow GIVEN/WHEN/THEN or EARS format'
    );
  });

  it('should keep standalone WHEN bullet as a separate criterion', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- WHEN the user clicks submit
- THEN the form is validated
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(2);
    const whenCriterion = requirements[0].acceptanceCriteria[0];
    expect(whenCriterion.text).toBe('WHEN the user clicks submit');
    expect(whenCriterion.format).toBe('unstructured');
    const thenCriterion = requirements[0].acceptanceCriteria[1];
    expect(thenCriterion.text).toBe('THEN the form is validated');
  });

  it('should handle mixed GWT and non-GWT criteria', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
- GIVEN user is authenticated
- WHEN they access admin panel
- THEN they see dashboard
- The system shall display user profile
- GIVEN user is not authenticated
- WHEN they try to access admin
- THEN they see permission error
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(3);
    expect(requirements[0].acceptanceCriteria[0].format).toBe('given-when-then');
    expect(requirements[0].acceptanceCriteria[1].format).toBe('ears');
    expect(requirements[0].acceptanceCriteria[2].format).toBe('given-when-then');
  });

  it('should group GWT with numbered list format', () => {
    const content = `
### R1: Test Requirement
Description.

**Acceptance Criteria:**
1. GIVEN user has items in cart
2. WHEN they proceed to checkout
3. THEN they are shown order summary
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(1);
    const criterion = requirements[0].acceptanceCriteria[0];
    expect(criterion.text).toBe(
      'GIVEN user has items in cart WHEN they proceed to checkout THEN they are shown order summary'
    );
    expect(criterion.format).toBe('given-when-then');
  });

  it('should preserve line number of GIVEN bullet for grouped scenario', () => {
    const content = `
### R1: Test
Description.

**Acceptance Criteria:**
- Some other criterion
- GIVEN condition on line 7
- WHEN action on line 8
- THEN result on line 9
`;

    const { requirements } = parseRequirements(content);

    expect(requirements[0].acceptanceCriteria).toHaveLength(2);
    const groupedScenario = requirements[0].acceptanceCriteria[1];
    expect(groupedScenario.line).toBe(7); // Line where GIVEN starts
    expect(groupedScenario.format).toBe('given-when-then');
  });
});

describe('parseTasks', () => {
  it('should extract a single task with ID, title, and description', () => {
    const content = `
### T1: Implement Authentication
Build the login system.

**Acceptance Criteria:**
- User can log in
- User can log out
`;

    const { tasks } = parseTasks(content);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T1');
    expect(tasks[0].number).toBe(1);
    expect(tasks[0].title).toBe('Implement Authentication');
    expect(tasks[0].description).toContain('login system');
  });

  it('should extract task requirement references from description', () => {
    const content = `
### T1: Implement Feature
This task implements R1 and R2. It may also reference T3 for context.

**Acceptance Criteria:**
- Criteria 1
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].requirementReferences).toContain('R1');
    expect(tasks[0].requirementReferences).toContain('R2');
    expect(tasks[0].requirementReferences).toContain('T3');
  });

  it('should extract multiple tasks with correct IDs', () => {
    const content = `
### T1: First Task
Description.

**Acceptance Criteria:**
- Criteria

### T2: Second Task
Description.

**Acceptance Criteria:**
- Criteria
`;

    const { tasks } = parseTasks(content);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('T1');
    expect(tasks[1].id).toBe('T2');
  });

  it('should record line numbers for tasks', () => {
    const content = `line 1
line 2
### T1: Task
line 4
**Acceptance Criteria:**
- Criteria on line 6
- Criteria on line 7`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].startLine).toBe(3);
    expect(tasks[0].acceptanceCriteria).toHaveLength(2);
    expect(tasks[0].acceptanceCriteria[0].line).toBe(6);
    expect(tasks[0].acceptanceCriteria[1].line).toBe(7);
  });

  it('should assign sequential IDs to unnumbered tasks', () => {
    const content = `
### T1: First Task
Description.

**Acceptance Criteria:**
- Criteria

### Unnumbered Task
Description.

**Acceptance Criteria:**
- Criteria

### T3: Third Task
Description.

**Acceptance Criteria:**
- Criteria
`;

    const { tasks, parseNotes } = parseTasks(content);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe('T1');
    expect(tasks[1].id).toBe('T2');
    expect(tasks[2].id).toBe('T3');

    expect(parseNotes).toHaveLength(1);
    expect(parseNotes[0].message).toContain('assigned ID T2');
  });

  it('should estimate task size as oversized for more than 5 criteria', () => {
    const content = `
### T1: Oversized Task
Description.

**Acceptance Criteria:**
- Criteria 1
- Criteria 2
- Criteria 3
- Criteria 4
- Criteria 5
- Criteria 6
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].estimatedSize).toBe('oversized');
  });

  it('should estimate task size as large for 4-5 criteria', () => {
    const content = `
### T1: Large Task
Description.

**Acceptance Criteria:**
- Criteria 1
- Criteria 2
- Criteria 3
- Criteria 4
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].estimatedSize).toBe('large');
  });

  it('should estimate task size as medium for 2-3 criteria', () => {
    const content = `
### T1: Medium Task
Description.

**Acceptance Criteria:**
- Criteria 1
- Criteria 2
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].estimatedSize).toBe('medium');
  });

  it('should estimate task size as small for 0-1 criteria', () => {
    const content = `
### T1: Small Task
Description.

**Acceptance Criteria:**
- Criteria 1
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].estimatedSize).toBe('small');
  });

  it('should handle tasks with missing acceptance criteria gracefully', () => {
    const content = `
### T1: Task Without Criteria
Description but no criteria section.

### T2: Another Task
Also no criteria.
`;

    const { tasks } = parseTasks(content);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].acceptanceCriteria).toHaveLength(0);
    expect(tasks[1].acceptanceCriteria).toHaveLength(0);
  });

  it('should handle malformed tasks gracefully (no throw)', () => {
    const content = `
### T1: Valid Task
Description.

**Acceptance Criteria:**
- Criteria

### T2 Missing Colon
Malformed but should not crash
`;

    expect(() => {
      parseTasks(content);
    }).not.toThrow();

    const { tasks } = parseTasks(content);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('should handle empty content gracefully', () => {
    const { tasks, parseNotes } = parseTasks('');

    expect(tasks).toHaveLength(0);
    expect(parseNotes).toHaveLength(0);
  });

  it('should extract numbered criteria (1. 2. etc.)', () => {
    const content = `
### T1: Test Task
Description.

**Acceptance Criteria:**
1. First numbered criterion
2. Second numbered criterion
3. Third numbered criterion
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].acceptanceCriteria).toHaveLength(3);
    expect(tasks[0].acceptanceCriteria[0].text).toBe('First numbered criterion');
    expect(tasks[0].acceptanceCriteria[1].text).toBe('Second numbered criterion');
    expect(tasks[0].acceptanceCriteria[2].text).toBe('Third numbered criterion');
  });

  it('should extract requirement references only once (no duplicates)', () => {
    const content = `
### T1: Task
References R1 and R1 again, plus R2 and R1 once more.

**Acceptance Criteria:**
- Criteria
`;

    const { tasks } = parseTasks(content);

    const uniqueRefs = tasks[0].requirementReferences;
    expect(uniqueRefs).toContain('R1');
    expect(uniqueRefs).toContain('R2');
    // Count should be 2, not 3
    expect(uniqueRefs.length).toBe(2);
  });

  it('should group GWT scenarios across multiple bullets in tasks', () => {
    const content = `
### T1: Implement Login
Implement login functionality for R1.

**Acceptance Criteria:**
- GIVEN user is on login page
- WHEN they enter valid credentials
- THEN they are authenticated
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].acceptanceCriteria).toHaveLength(1);
    const criterion = tasks[0].acceptanceCriteria[0];
    expect(criterion.text).toBe(
      'GIVEN user is on login page WHEN they enter valid credentials THEN they are authenticated'
    );
    expect(criterion.line).toBe(6); // Line of GIVEN bullet
    expect(criterion.format).toBe('given-when-then');
  });

  it('should group GWT scenario with AND in tasks', () => {
    const content = `
### T1: Feature Implementation
Description.

**Acceptance Criteria:**
- GIVEN precondition exists
- WHEN action is triggered
- THEN result happens
- AND secondary effect occurs
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].acceptanceCriteria).toHaveLength(1);
    const criterion = tasks[0].acceptanceCriteria[0];
    expect(criterion.text).toContain('GIVEN precondition exists');
    expect(criterion.text).toContain('AND secondary effect occurs');
  });

  it('should handle mixed criteria in tasks with some GWT groups', () => {
    const content = `
### T1: Mixed Task
Description.

**Acceptance Criteria:**
- GIVEN user role is admin
- WHEN they access settings
- THEN they see admin options
- The system shall log all actions
- GIVEN user role is guest
- WHEN they access settings
- THEN access is denied
`;

    const { tasks } = parseTasks(content);

    expect(tasks[0].acceptanceCriteria).toHaveLength(3);
    expect(tasks[0].acceptanceCriteria[0].format).toBe('given-when-then');
    expect(tasks[0].acceptanceCriteria[1].format).toBe('ears');
    expect(tasks[0].acceptanceCriteria[2].format).toBe('given-when-then');
  });
});

describe('parseDesign', () => {
  it('should extract a single design section with title and content', () => {
    const content = `
## Data Model

The system uses a relational database with the following tables:
- Users
- Requirements
- Tasks
`;

    const { sections } = parseDesign(content);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Data Model');
    expect(sections[0].content).toContain('relational database');
  });

  it('should extract multiple design sections with correct structure', () => {
    const content = `
## Architecture Overview

The system follows a modular architecture.

## Data Model

Tables include Users and Tasks.

## Error Handling

Errors are logged and reported.

## API Contracts

REST API endpoints for all resources.
`;

    const { sections } = parseDesign(content);

    expect(sections).toHaveLength(4);
    expect(sections[0].title).toBe('Architecture Overview');
    expect(sections[1].title).toBe('Data Model');
    expect(sections[2].title).toBe('Error Handling');
    expect(sections[3].title).toBe('API Contracts');
  });

  it('should record line numbers for design sections', () => {
    const content = `line 1
line 2
## First Section
line 4
line 5
## Second Section
line 7
line 8`;

    const { sections } = parseDesign(content);

    expect(sections[0].startLine).toBe(3);
    expect(sections[1].startLine).toBe(6);
  });

  it('should not include H1 headers in sections', () => {
    const content = `
# Main Title

## Section 1

Content for section 1.

# Another H1

## Section 2

Content for section 2.
`;

    const { sections } = parseDesign(content);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Section 1');
    expect(sections[1].title).toBe('Section 2');
  });

  it('should handle empty design content gracefully', () => {
    const { sections, parseNotes } = parseDesign('');

    expect(sections).toHaveLength(0);
    expect(parseNotes).toHaveLength(0);
  });

  it('should handle design with only H1 headers', () => {
    const { sections } = parseDesign(`
# Main Title
Content here

# Another Title
More content
`);

    expect(sections).toHaveLength(0);
  });

  it('should preserve H3 subsections within an H2 section', () => {
    const content = `
## Data Model

### Entities

The system contains the following entities:
- Users with id, name, email
- Tasks with id, title, description

### Relationships

Relationships are defined as follows:
- User has many Tasks
- Task belongs to User

### Normalization

The schema follows third normal form (3NF) to eliminate redundancy.
`;

    const { sections } = parseDesign(content);

    // Should have 1 section (Data Model), not 4 sections
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Data Model');

    // The content should include all H3 lines and their content
    expect(sections[0].content).toContain('Entities');
    expect(sections[0].content).toContain('Users with id, name, email');
    expect(sections[0].content).toContain('Relationships');
    expect(sections[0].content).toContain('User has many Tasks');
    expect(sections[0].content).toContain('Normalization');
    expect(sections[0].content).toContain('third normal form');
  });

  it('should preserve multi-line section content', () => {
    const content = `
## Data Model

The system includes:
- Users table with id, name, email
- Tasks table with id, title, description
- Requirements table with id, title

Important relationships:
- User to Task (one to many)
- Requirement to Task (many to many)
`;

    const { sections } = parseDesign(content);

    expect(sections[0].content).toContain('Users table');
    expect(sections[0].content).toContain('Tasks table');
    expect(sections[0].content).toContain('Requirements table');
    expect(sections[0].content).toContain('Important relationships');
  });

  it('should handle sections with no content', () => {
    const content = `
## Empty Section

## Another Section

Some content here.
`;

    const { sections } = parseDesign(content);

    expect(sections).toHaveLength(2);
    expect(sections[0].content).toBe('');
    expect(sections[1].content).toContain('Some content');
  });

  it('should handle malformed headers gracefully (no throw)', () => {
    const content = `
## Valid Section

Content.

##Invalid No Space

More content.

## Another Valid

Final content.
`;

    expect(() => {
      parseDesign(content);
    }).not.toThrow();

    const { sections } = parseDesign(content);
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe('Integration: Multi-file parsing', () => {
  it('should parse requirements and tasks with cross-references', () => {
    const reqContent = `
### R1: User Login
Allow users to authenticate.

**Acceptance Criteria:**
- GIVEN a user is on login page
- WHEN they enter credentials
- THEN they are authenticated
`;

    const taskContent = `
### T1: Implement Login
Implement the authentication feature for R1.

**Acceptance Criteria:**
- Login form created
- Credentials validated
- Session stored
`;

    const { requirements } = parseRequirements(reqContent);
    const { tasks } = parseTasks(taskContent);

    expect(requirements).toHaveLength(1);
    expect(requirements[0].id).toBe('R1');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].requirementReferences).toContain('R1');
  });

  it('should handle partial spec files (single file audit)', () => {
    const reqContent = `
### R1: First Requirement
Description.

**Acceptance Criteria:**
- Criteria
`;

    expect(() => {
      parseRequirements(reqContent);
    }).not.toThrow();

    const { requirements } = parseRequirements(reqContent);
    expect(requirements).toHaveLength(1);
  });
});

describe('Edge cases and robustness', () => {
  it('should handle requirements with no description', () => {
    const content = `
### R1: Title Only

**Acceptance Criteria:**
- Criteria
`;

    const { requirements } = parseRequirements(content);
    expect(requirements).toHaveLength(1);
    expect(requirements[0].title).toBe('Title Only');
  });

  it('should handle tasks with mixed reference formats', () => {
    const content = `
### T1: Task
References R1, R2-R3, and inline like R4 and T2.

**Acceptance Criteria:**
- Criteria
`;

    const { tasks } = parseTasks(content);
    const refs = tasks[0].requirementReferences;

    expect(refs).toContain('R1');
    expect(refs).toContain('R2');
    expect(refs).toContain('R3');
    expect(refs).toContain('R4');
    expect(refs).toContain('T2');
  });

  it('should handle very long descriptions', () => {
    const longDesc = 'This is a very long description. '.repeat(100);
    const content = `
### R1: Requirement
${longDesc}

**Acceptance Criteria:**
- Criteria
`;

    const { requirements } = parseRequirements(content);
    expect(requirements[0].description).toContain('very long description');
  });

  it('should handle special characters in titles', () => {
    const content = `
### R1: User & Admin (Complex) Role [Management]
Description.

**Acceptance Criteria:**
- Criteria
`;

    const { requirements } = parseRequirements(content);
    expect(requirements[0].title).toContain('User & Admin');
    expect(requirements[0].title).toContain('[Management]');
  });

  it('should handle sections with only whitespace', () => {
    const content = `
### R1: Requirement
   
   
**Acceptance Criteria:**
- Criteria
`;

    const { requirements } = parseRequirements(content);
    expect(requirements).toHaveLength(1);
  });

  it('should not confuse R/T patterns in regular text', () => {
    const content = `
### T1: Task
The R&D team and the T-shirt designers contributed to the project.

**Acceptance Criteria:**
- Criteria
`;

    const { tasks } = parseTasks(content);
    const refs = tasks[0].requirementReferences;

    // Should not include R&D or T-shirt as references
    expect(refs.some((r) => r === 'R1' || r === 'R2')).toBe(false);
    expect(refs.some((r) => r === 'T1')).toBe(false);
  });
});
