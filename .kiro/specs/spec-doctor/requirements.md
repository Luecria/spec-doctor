# Spec Doctor: Requirements

## Overview
Spec Doctor is a client-side web application that audits Kiro specification files (requirements.md, design.md, tasks.md) to measure specification quality and identify structural issues. Users paste or upload spec files and receive a health score (0-100) with detailed findings. Phase 2 adds drift detection to check spec-to-code traceability in uploaded repositories.

## Phase 1: Core Spec Auditing

### R1: Upload Specification Files
**Story:** As a spec author, I want to upload or paste my specification files so I can audit them.

**Partial-File Degradation:**
- When only 1-2 files are provided (instead of all 3), the application SHALL: (1) run all applicable single-file checks on each provided file, (2) skip cross-file checks gracefully (without error), (3) list skipped checks in the report with clear reasons, and (4) compute the score over applicable checks only (not penalizing for unavailable files)

**Acceptance Criteria:**
- GIVEN the user is on the Spec Doctor homepage
- WHEN the user clicks the "Upload" button or "Paste" button
- THEN the system SHALL accept requirements.md, design.md, and tasks.md files via upload or text input
- AND the system SHALL parse the files as UTF-8 text
- AND the system SHALL display file names and character counts
- AND the system SHALL prevent proceeding until at least one file is provided
- AND the system SHALL run applicable checks for any number of files (1, 2, or 3)
- AND the system SHALL list skipped cross-file checks in the report with coverage notes

**Acceptance Criteria:**
- GIVEN the user pastes file content
- WHEN the system receives the content
- THEN the system SHALL trim whitespace and preserve line breaks and formatting
- AND the system SHALL NOT apply any transformations to the content

### R2: Audit Requirements File
**Story:** As a spec author, I want Spec Doctor to analyze my requirements.md for completeness and clarity.

**Acceptance Criteria:**
- GIVEN a requirements.md file is uploaded or pasted
- WHEN the audit engine processes the file
- THEN the system SHALL check for vague language (e.g., "may," "might," "perhaps," "ideally," "could," "should consider")
- AND the system SHALL flag requirements lacking structured acceptance criteria
- AND the system SHALL identify acceptance criteria without GIVEN/WHEN/THEN format or any of the five EARS patterns (Ubiquitous, Event-driven, State-driven, Unwanted, Optional)
- AND the system SHALL detect requirements with no task references (orphaned requirements)
- AND the system SHALL flag duplicate or near-duplicate requirements

**Acceptance Criteria:**
- GIVEN an acceptance criterion exists in a requirement
- WHEN the system evaluates it
- THEN the system SHALL accept GIVEN/WHEN/THEN BDD format
- AND the system SHALL accept EARS patterns: Ubiquitous ('The system shall <behavior>'), Event-driven ('WHEN <trigger>, the system shall <behavior>'), State-driven ('WHILE <state>, the system shall <behavior>'), Unwanted ('IF <condition>, THEN the system shall <behavior>'), Optional ('WHERE <feature>, the system shall <behavior>')
- AND the system SHALL reject criteria that match none of the above patterns or are untestable (e.g., "user should be happy")

### R3: Audit Design File
**Story:** As a spec author, I want my design.md reviewed for architectural completeness.

**Acceptance Criteria:**
- GIVEN a design.md file is uploaded or pasted
- WHEN the audit engine processes the file
- THEN the system SHALL check that the design includes a data model or data flow explanation
- AND the system SHALL check that the design includes error handling strategy
- AND the system SHALL check for API contracts or interface specifications ONLY if the design describes components with an interface surface (APIs, endpoints, service boundaries); if no interface surface is described, this check is skipped and produces no finding; if interfaces are described but unspecified, flag as Critical
- AND the system SHALL flag sections where required content is missing or vague

### R4: Audit Tasks File
**Story:** As a spec author, I want my tasks.md analyzed for proper structure and traceability.

**Acceptance Criteria:**
- GIVEN a tasks.md file is uploaded or pasted
- WHEN the audit engine processes the file
- THEN the system SHALL detect tasks that do not reference any requirement (orphaned tasks)
- AND the system SHALL identify oversized tasks (those with more than 5 distinct acceptance criteria or unclear scope)
- AND the system SHALL flag tasks missing clear implementation acceptance criteria
- AND the system SHALL ensure each task is discrete and independently implementable

### R5: Generate Health Score
**Story:** As a spec author, I want a single metric to understand overall specification quality.

**Score Calculation with Diminishing Deductions:**
- Start with base score: 100
- For each finding, deduct based on severity level using diminishing returns
- Within one severity level, each additional finding deducts 60% of the previous deduction for that level
- Base deductions: Critical 15, High 8, Medium 3, Low 1
- Example: First Critical = -15, second Critical = -9 (60% of 15), third Critical = -5.4 (60% of 9), etc.
- Minimum per-deduction: 1 point (do not go below 1)
- Floor final score at 0 (never negative)
- Report SHALL show deduction breakdown by severity level

**Acceptance Criteria:**
- GIVEN all audit checks have been performed
- WHEN the report is generated
- THEN the system SHALL calculate a health score from 0 to 100
- AND the system SHALL apply diminishing deductions (60% of previous within same severity) rather than hard caps
- AND the system SHALL weigh critical issues more heavily than minor issues
- AND the system SHALL show the deduction calculation for each severity level in the report
- AND the system SHALL ensure the final score never goes below 0

### R6: Generate Findings Report
**Story:** As a spec author, I want detailed findings with context and suggestions to improve my specs.

**Acceptance Criteria:**
- GIVEN the audit is complete
- WHEN the findings report is displayed
- THEN the system SHALL organize findings by file (requirements.md, design.md, tasks.md)
- AND each finding SHALL include the file name, line number, and quoted text
- AND each finding SHALL include severity level (Critical, High, Medium, Low)
- AND each finding SHALL include a clear fix suggestion

**Acceptance Criteria:**
- GIVEN a finding is displayed
- WHEN the user views the report
- THEN the system SHALL highlight the specific quoted text from the file
- AND the system SHALL explain why the finding is an issue
- AND the system SHALL provide a concrete example of how to fix it

### R7: Export Audit Report
**Story:** As a spec author, I want to export the audit results for sharing or documentation.

**Acceptance Criteria:**
- GIVEN an audit report is generated
- WHEN the user clicks "Export" or "Download"
- THEN the system SHALL provide report as JSON or markdown format
- AND the system SHALL include health score, findings list, file names, and timestamp
- AND the system SHALL preserve all finding details (file, line, severity, quote)

## Phase 2: Drift Detection (Out of Scope for Current Phase)

### R8: Upload Repository
**Story:** As a developer, I want to upload a codebase (folder or ZIP) so I can check spec-to-code alignment.

**Acceptance Criteria:**
- GIVEN the user has completed Phase 1 audit
- WHEN the user uploads a repository (folder or ZIP file)
- THEN the system SHALL extract and parse the code in-browser
- AND the system SHALL index requirement IDs and task IDs from the specs
- AND the system SHALL scan code files for references to requirement and task IDs

### R9: Detect Spec-to-Code Drift
**Story:** As a developer, I want to identify gaps between specifications and implementation.

**Acceptance Criteria:**
- GIVEN a repository and spec files are provided
- WHEN drift detection runs
- THEN the system SHALL identify code sections not traced to requirements
- AND the system SHALL flag requirements with no code implementations
- AND the system SHALL highlight overimplemented requirements (code beyond spec)
- AND the system SHALL frame results as signals not proof (requires human judgment)

### R10: Generate Traceability Report
**Story:** As a developer, I want a traceability matrix showing spec-to-code mappings.

**Acceptance Criteria:**
- GIVEN drift detection is complete
- WHEN the traceability report is displayed
- THEN the system SHALL show which requirements have code implementations
- AND the system SHALL show which tasks are referenced in code
- AND the system SHALL identify orphaned code (a code file with no ID references at all; a file referencing only non-spec IDs is reported as implemented-not-specified instead) and orphaned specs (no code reference)

### R11: Optional LLM Semantic Review
**Story:** As a spec author, I want optional AI-powered semantic review to complement deterministic checks.

**Acceptance Criteria:**
- GIVEN the user has completed Phase 1 audit
- WHEN the user opts to enable LLM review
- THEN the system SHALL accept an OpenAI-compatible endpoint URL, API key, and model name
- AND the system SHALL keep the API key in browser memory only, never stored or transmitted except to the user-configured endpoint
- AND the system SHALL only transmit data to the endpoint when the user explicitly triggers LLM review
- AND the system SHALL label all LLM findings as "LLM suggestions" and separate them from deterministic findings
- AND the system SHALL NOT modify the 0-100 deterministic score based on LLM findings

## Out of Scope
- Backend processing or server-side storage
- Integration with Kiro CLI or any external tools
- Authentication or user accounts
- Version control integration (beyond reading uploaded files)
- Real-time collaborative editing
- CI/CD pipeline integration
