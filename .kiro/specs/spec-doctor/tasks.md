# Spec Doctor: Tasks

## Phase 1: Core Spec Auditing

### T1: Build File Input Interface
**References:** R1

**Description:** Create the UI for uploading or pasting specification files. Users should be able to select multiple files or paste text content directly.

**Acceptance Criteria:**
- GIVEN the user is on the homepage
- WHEN the user sees the input interface
- THEN the system SHALL display two tabs: "Upload" and "Paste"
- AND the Upload tab SHALL have a file drag-and-drop area
- AND the Upload tab SHALL have a file picker button supporting .md files
- AND the Paste tab SHALL have a textarea for direct content entry
- AND the system SHALL display file names and character counts for uploaded files
- AND the system SHALL prevent proceeding until at least one file is provided

**Acceptance Criteria:**
- GIVEN the user has selected files or pasted content
- WHEN the user clicks "Audit"
- THEN the system SHALL validate that at least one file is provided
- AND the system SHALL display an error if validation fails
- AND the system SHALL display a progress indicator during audit processing

### T2: Implement File Parser
**References:** R1, R2, R4

**Description:** Build the core parser that converts raw text content into structured objects (Requirement, Task, DesignSection). This parser extracts metadata like IDs, line numbers, and content blocks.

**ID Convention:**
- Requirement IDs match the pattern R followed by digits (R1, R2, R3, etc.)
- Task IDs match the pattern T followed by digits (T1, T2, T3, etc.)
- Unnumbered requirements or tasks are assigned sequential IDs in document order as fallback (first unnumbered requirement becomes R[next], etc.)

**Acceptance Criteria:**
- GIVEN raw file content is provided
- WHEN the parser processes requirements.md
- THEN the system SHALL extract requirement blocks (R1, R2, etc.)
- AND the system SHALL parse the requirement title and description
- AND the system SHALL extract acceptance criteria blocks
- AND the system SHALL record the line number of each requirement and criterion
- AND the system SHALL assign sequential IDs to unnumbered requirements in document order
- AND the system SHALL handle files with missing or malformed sections gracefully

**Acceptance Criteria:**
- GIVEN raw file content is provided
- WHEN the parser processes tasks.md
- THEN the system SHALL extract task blocks (T1, T2, etc.)
- AND the system SHALL parse task title, description, and criteria
- AND the system SHALL extract requirement references from task descriptions
- AND the system SHALL record line numbers for each task

**Acceptance Criteria:**
- GIVEN raw file content is provided
- WHEN the parser processes design.md
- THEN the system SHALL extract section headers and content
- AND the system SHALL record line numbers for each section

### T3: Implement Requirements Auditor
**References:** R2

**Description:** Build the audit engine for requirements.md. This module checks for vague language, validates acceptance criteria format, detects orphaned requirements, and identifies duplicates.

**Acceptance Criteria:**
- GIVEN a parsed requirements file
- WHEN the auditor processes the content
- THEN the system SHALL scan for vague language (may, might, perhaps, ideally, could, should consider)
- AND the system SHALL flag each vague term with line number, quote, and suggestion to replace
- AND the system SHALL set severity to "Low" for vague language findings

**Acceptance Criteria:**
- GIVEN an acceptance criterion is analyzed
- WHEN the auditor validates its format
- THEN the system SHALL accept GIVEN/WHEN/THEN format (case-insensitive prefix matching)
- AND the system SHALL accept EARS patterns: Ubiquitous ('The system shall <behavior>'), Event-driven ('WHEN <trigger>, the system shall <behavior>'), State-driven ('WHILE <state>, the system shall <behavior>'), Unwanted ('IF <condition>, THEN the system shall <behavior>'), Optional ('WHERE <feature>, the system shall <behavior>')
- AND the system SHALL flag criteria matching none of these patterns as "High" severity
- AND the system SHALL flag untestable criteria (e.g., "user should be happy") as "High" severity

**Acceptance Criteria:**
- GIVEN all requirements are parsed
- WHEN the auditor performs cross-file checks
- THEN the system SHALL detect requirements with no task references as "Medium" severity
- AND the system SHALL flag duplicate or near-duplicate requirements (Jaccard similarity > 0.90 per the Duplicate Detection Algorithm in design.md) as "High" severity

### T4: Implement Design Auditor
**References:** R3

**Description:** Build the audit engine for design.md. This module checks for data model, error handling, and conditional API contract documentation based on interface surfaces described.

**Acceptance Criteria:**
- GIVEN a parsed design file
- WHEN the auditor scans for required sections
- THEN the system SHALL identify sections for: data model, error handling, and API contracts
- AND the system SHALL evaluate each section against criteria: (1) contains at least 2 distinct terms from the category vocabulary, (2) contains at least 200 characters of non-heading content, (3) includes at least one structured element (list, table, or code block) or 2+ sentences
- AND the system SHALL flag missing or insufficient documentation with "Critical" severity

**Acceptance Criteria:**
- GIVEN design sections are identified
- WHEN the auditor evaluates API contracts
- THEN the system SHALL check whether the design describes components with an interface surface (APIs, endpoints, service boundaries)
- AND if no interface surface is described, the system SHALL skip the API contracts check and produce no finding
- AND if interface surfaces are described but API contracts are unspecified, the system SHALL flag as "Critical" severity
- AND if both interface surfaces and API contracts are present, the system SHALL validate completeness

**Category Vocabularies:** (reference data for the rule above, not acceptance criteria)
   **Data Model:** {schema, structure, entity, database, model, table, class, object, field, attribute, relationship, diagram, ER, normalization, primary key, foreign key}
   **Error Handling:** {error, exception, failure, retry, validation, assert, throw, catch, try, fault, crash, recovery, logging, monitoring, graceful, degradation, fallback}
   **API Contracts:** {endpoint, interface, protocol, contract, method, parameter, request, response, payload, header, status code, REST, gRPC, GraphQL, HTTP, TCP, authentication, authorization}

### T5: Implement Tasks Auditor
**References:** R4

**Description:** Build the audit engine for tasks.md. This module validates task structure, requirement references, and identifies oversized tasks.

**Acceptance Criteria:**
- GIVEN a parsed tasks file
- WHEN the auditor analyzes each task
- THEN the system SHALL check that each task references at least one requirement (R-number)
- AND the system SHALL flag tasks without requirement references as "High" severity
- AND the system SHALL flag tasks with more than 5 acceptance criteria as "Medium" severity (oversized)
- AND the system SHALL suggest breaking oversized tasks into smaller tasks

### T6: Implement Cross-File Auditor
**References:** R2, R3, R4

**Description:** Build the module that correlates findings across all three spec files. This includes validating bidirectional references between requirements and tasks.

**Partial-File Handling:**
- When fewer than 3 files are provided, cross-file checks are skipped gracefully
- The report SHALL list skipped checks with clear reasons (e.g., "Requirement-Task linking skipped: tasks.md not provided")
- Single-file checks continue normally for provided files
- Score calculation applies only to applicable checks

**Acceptance Criteria:**
- GIVEN all three spec files have been parsed
- WHEN the cross-file auditor runs
- THEN the system SHALL verify that each requirement (R1, R2, etc.) is referenced by at least one task
- AND the system SHALL flag orphaned requirements as "Medium" severity
- AND the system SHALL verify that each task references existing requirements
- AND the system SHALL flag task references to non-existent requirements as "High" severity

**Acceptance Criteria:**
- GIVEN fewer than three files are provided
- WHEN the cross-file auditor runs
- THEN the system SHALL skip cross-file checks gracefully
- AND the system SHALL list skipped checks in the report with reasons
- AND the system SHALL continue with single-file checks for provided files

### T7: Implement Score Calculator
**References:** R5

**Description:** Build the scoring engine that converts audit findings into a 0-100 health score.

**Diminishing Deduction Algorithm:**
- Base deductions per severity: Critical 15, High 8, Medium 3, Low 1
- Within one severity level, each additional finding deducts 60% of the previous deduction
- Example: Critical findings = -15, -9 (-15 × 0.6), -5.4 (-9 × 0.6), -3.24 (-5.4 × 0.6)
- Minimum per-deduction: 1 point (no finding costs less than 1 point)
- Floor score at 0 (no negative scores)
- Calculate independently for each severity level, then sum

**Acceptance Criteria:**
- GIVEN all audit findings are available
- WHEN the score calculator runs
- THEN the system SHALL start with a base score of 100
- AND the system SHALL apply diminishing deductions (60% multiplier for each successive finding in same severity)
- AND the system SHALL ensure no deduction is less than 1 point
- AND the system SHALL floor the final score at 0 (minimum score 0, maximum 100)
- AND the system SHALL provide the deduction breakdown in the report (e.g., "Critical: -15, -9, -5 = -29 total")

**Acceptance Criteria:**
- GIVEN multiple findings at different severity levels
- WHEN the score is calculated
- THEN the system SHALL independently calculate diminishing deductions for each severity level
- AND the system SHALL sum deductions from all levels to get the final score
- AND the system SHALL display the per-severity breakdown in the report

### T8: Implement Report Generator
**References:** R6

**Description:** Build the module that generates the findings report with context, quotes, and fix suggestions.

**Acceptance Criteria:**
- GIVEN all audit findings are available
- WHEN the report is generated
- THEN the system SHALL organize findings by file (requirements.md, design.md, tasks.md)
- AND the system SHALL sort findings by line number within each file
- AND each finding SHALL include file name, line number, severity, category, and quoted text
- AND each finding SHALL include a clear explanation of why it is an issue
- AND each finding SHALL include a concrete example or suggestion for fixing it

**Acceptance Criteria:**
- GIVEN the report is displayed in the UI
- WHEN the user views findings
- THEN the system SHALL highlight the quoted text with syntax highlighting where applicable
- AND the system SHALL provide a "copy" button for the quote
- AND the system SHALL provide a "view context" option to show surrounding lines

### T9: Implement Export Functionality
**References:** R7

**Description:** Build the module that exports audit results in JSON and markdown formats.

**Acceptance Criteria:**
- GIVEN an audit report is complete
- WHEN the user clicks "Export"
- THEN the system SHALL provide options for JSON or Markdown format
- AND the system SHALL include health score, timestamp, file names, and all findings
- AND the system SHALL generate a valid JSON or Markdown file
- AND the system SHALL trigger a browser download with filename spec-doctor-report-TIMESTAMP.json or .md

**Acceptance Criteria:**
- GIVEN the exported report is downloaded
- WHEN a user opens the report
- THEN the JSON format SHALL be parseable by standard JSON parsers
- AND the Markdown format SHALL be readable in any text editor and renderable by GitHub or similar platforms

### T10: Build Report Display UI
**References:** R5, R6

**Description:** Create the UI components that display the health score and findings report in an intuitive format.

**Acceptance Criteria:**
- GIVEN an audit is complete
- WHEN the report page is displayed
- THEN the system SHALL show the health score prominently (with color coding: 90-100 green, 70-89 yellow, <70 red)
- AND the system SHALL display a summary of finding counts by severity
- AND the system SHALL display findings grouped by file
- AND the system SHALL allow filtering/sorting by severity or file

**Acceptance Criteria:**
- GIVEN a finding is displayed
- WHEN the user hovers over or clicks the finding
- THEN the system SHALL show the full quote and context
- AND the system SHALL highlight the specific line in the original file
- AND the system SHALL display the suggested fix with example code or text

### T11: Integrate Audit Engine with UI
**References:** R1, R2, R3, R4, R5, R6, R7

**Description:** Connect all audit modules, score calculator, and report generator into a cohesive flow. Ensure proper error handling and user feedback at each step.

**Acceptance Criteria:**
- GIVEN the user uploads files and clicks "Audit"
- WHEN the audit process begins
- THEN the system SHALL parse all files sequentially
- AND the system SHALL run all audit modules (Requirements, Design, Tasks, CrossFile)
- AND the system SHALL calculate the score
- AND the system SHALL generate the report
- AND the system SHALL display results in the UI
- AND the system SHALL provide clear error messages if any step fails

**Acceptance Criteria:**
- GIVEN an error occurs during auditing
- WHEN the user sees the error
- THEN the system SHALL display a user-friendly error message
- AND the system SHALL suggest next steps (e.g., "Try uploading a smaller file" or "Ensure files are valid UTF-8")
- AND the system SHALL allow the user to start over without reloading the page

### T12: Create Project Structure and Build Setup
**References:** R1

**Description:** Initialize the project with folder structure, build configuration, and development environment.

**Acceptance Criteria:**
- GIVEN a new project directory
- WHEN project setup is complete
- THEN the system SHALL have folder structure: src/, public/, dist/, tests/
- AND the system SHALL have build configuration (Vite, webpack, or equivalent)
- AND the system SHALL have package.json with dependencies
- AND the system SHALL have README with setup and usage instructions
- AND the system SHALL be buildable with `npm run build`
- AND the system SHALL be runnable locally with `npm run dev`

### T17: Implement Optional LLM Semantic Review
**References:** R11

**Description:** Add optional LLM integration layer for semantic analysis. Users provide OpenAI-compatible endpoint and API key, kept in browser memory only.

**Acceptance Criteria:**
- GIVEN the audit report is displayed
- WHEN the user opts into LLM review
- THEN the system SHALL accept an OpenAI-compatible endpoint URL, API key, and model name as input
- AND the system SHALL store the API key in browser memory only (not in localStorage, sessionStorage, or any persistent store)
- AND the system SHALL NOT transmit the key or spec content to any endpoint except when the user explicitly triggers review
- AND the system SHALL only send to the user-configured endpoint

**Acceptance Criteria:**
- GIVEN the user triggers LLM review
- WHEN the review completes
- THEN the system SHALL display LLM findings as "LLM suggestions" clearly separated from deterministic findings
- AND the system SHALL NOT modify the 0-100 deterministic health score
- AND the system SHALL include LLM findings in the exported report with clear labeling

## Phase 2: Drift Detection (Out of Scope for Current Phase)

### T13: Implement Repository Upload
**References:** R8

**Description:** Add UI and in-browser handling for uploading repository files (ZIP or folder).

**Acceptance Criteria:**
- GIVEN the audit report is displayed
- WHEN the user clicks "Upload Repository" or "Upload Code Files"
- THEN the system SHALL display a file picker for selecting a directory or ZIP file
- AND the system SHALL accept ZIP files or directory uploads (via directory input API)
- AND the system SHALL display the repository name and file count
- AND the system SHALL prevent proceeding until a valid repository is selected

### T14: Implement Repository Extraction
**References:** R8

**Description:** Extract uploaded repository in-browser, build file index and metadata.

**Acceptance Criteria:**
- GIVEN a ZIP file or directory is uploaded
- WHEN the application processes it
- THEN the system SHALL extract all files in-browser using JSZip or equivalent
- AND the system SHALL build a file index with paths, file types, and content
- AND the system SHALL validate file size (limit to 50MB total)
- AND the system SHALL display extraction progress and any errors

### T15: Implement Traceability Scanner
**References:** R9

**Description:** Scan code files for requirement and task ID references, generate traceability signals.

**Acceptance Criteria:**
- GIVEN a repository has been extracted
- WHEN the traceability scanner runs
- THEN the system SHALL scan all code files for requirement IDs (R1, R2, etc.) and task IDs (T1, T2, etc.)
- AND the system SHALL record the file path, line number, and context for each reference found
- AND the system SHALL flag requirements referenced in code but not in specifications as "Implemented but not specified"
- AND the system SHALL flag requirements in specifications but not referenced in code as "Specified but not implemented"

### T16: Implement Traceability Report
**References:** R9, R10

**Description:** Display spec-to-code traceability with drift signals (not authoritative proof).

**Acceptance Criteria:**
- GIVEN traceability scanning is complete
- WHEN the traceability report is displayed
- THEN the system SHALL show a matrix of requirements vs. code implementations
- AND the system SHALL display the task ID, file path, and line number for each reference
- AND the system SHALL clearly state that findings are signals requiring human judgment, not authoritative proof
- AND the system SHALL organize findings by requirement and by code file

---

## Task Dependencies & Sequencing

**Phase 1 Implementation Order:**
1. T12 (Setup) - Foundation for all other tasks
2. T2 (Parser) - Needed by all auditors
3. T3, T4, T5 (Individual Auditors) - Can be parallelized
4. T6 (Cross-File Auditor) - Depends on individual auditors
5. T7 (Score Calculator) - Depends on auditors
6. T8 (Report Generator) - Depends on auditors and score
7. T1 (Input UI) - Can start early, integrates with T11
8. T10 (Report UI) - Depends on T8
9. T11 (Integration) - Connects everything together
10. T9 (Export) - Final feature to complete Phase 1
