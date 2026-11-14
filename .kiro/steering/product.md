---
inclusion: always
---

# Spec Doctor: Product Definition

## What Is Spec Doctor?

Spec Doctor is a client-side web application that audits Kiro specification files (requirements.md, design.md, tasks.md) to measure specification quality and identify structural issues. It operates entirely in the browser—no backend services, no persistent storage—making it a zero-friction tool for specification authors and reviewers.

### Core Purpose

Spec Doctor combines two complementary capabilities:

1. **Deterministic Spec Quality Audit**: Automated checks for common specification antipatterns, completeness, and structural issues within individual spec files and across the requirement-task-design triad.
2. **Spec-to-Code Drift Signals**: Optional scanning of uploaded repositories to identify traceability gaps (e.g., unimplemented requirements, unspecified code sections) as signals for further investigation, not as authoritative proof.

## Who Uses Spec Doctor?

- **Specification Authors**: Writers and subject-matter experts creating requirements.md, design.md, and tasks.md files
- **Technical Leads**: Architects and engineering leads reviewing specification completeness before implementation
- **QA and Test Planners**: Teams validating that acceptance criteria are testable and traceable
- **Development Teams**: Engineers checking spec-to-code alignment during implementation phases

## Core Features

### 1. Deterministic Specification Audit
- Parse and analyze requirements.md, design.md, and tasks.md
- Run structured checks on individual files:
  - **Requirements checks**: vague language detection, acceptance criteria validation (GIVEN/WHEN/THEN or EARS patterns), duplicate detection via Jaccard similarity >0.90, orphaned requirement detection
  - **Design checks**: verification of data model documentation, error handling strategy, conditional API contract documentation (only if interface surfaces are described), evaluation against category vocabularies (Data Model, Error Handling, API Contracts)
  - **Tasks checks**: requirement reference validation, oversized task detection (>5 acceptance criteria), orphaned task detection, scope clarity assessment
- Run cross-file checks when all three files are available (requirement-to-task bidirectional traceability, requirement-to-design linkage)
- Gracefully degrade when fewer than 3 files are provided: single-file checks continue; cross-file checks are skipped and noted in the report

### 2. Health Score (0–100)
- Deterministic calculation from audit findings
- Base deductions per severity: Critical 15, High 8, Medium 3, Low 1
- Diminishing returns within severity levels: each additional finding deducts 60% of the previous deduction for that severity
- Minimum per-deduction: 1 point; minimum score floor: 0
- Report displays deduction breakdown by severity for transparency

### 3. Detailed Findings Report
- Organized by file (requirements.md, design.md, tasks.md)
- Each finding includes: file name, line number/range, severity (Critical/High/Medium/Low), category, quoted text from the spec, explanation, and concrete fix suggestion
- Findings are filterable by severity and file, sortable by severity and line; each finding shows its category as a label
- Context view shows surrounding lines for each finding

### 4. Optional Bring-Your-Own-Key (BYO-Key) LLM Review
- User provides OpenAI-compatible endpoint URL, API key (stored in browser memory only), and model name
- LLM review is user-triggered only; no automatic network transmission
- API key and spec content never leave the user's configured endpoint; never stored locally
- LLM findings are labeled separately as "LLM suggestions" and never modify the deterministic 0–100 score
- Complements (not replaces) deterministic checks

### 5. Export & Sharing
- Export audit results as JSON (machine-parseable, for integration) or Markdown (human-readable, GitHub-friendly)
- Exports include: health score, timestamp, all findings with line numbers/quotes, file metadata, and deduction breakdown
- Download-ready files named `spec-doctor-report.json` / `spec-doctor-report.md` (timestamped filenames per spec T8 are a known deferred item; the report content itself carries a timestamp field)

### 6. Phase 2: Spec-to-Code Drift Detection
- Upload repository (ZIP or directory) to scan for requirement/task ID references in code
- Generate traceability signals showing: which requirements are implemented, which are missing, which code sections lack spec references
- Frame all findings as signals requiring human judgment (not authoritative proof; false positives/negatives are expected)

## Key Constraints & Design Principles

### Network Policy
- **Default**: All processing is client-side; no network requests unless user explicitly initiates LLM review
- **LLM Review**: Optional, user-triggered only; data sent only to the user-configured endpoint with the user-provided API key
- **No Phone-Home**: Spec Doctor never transmits data to any third-party service, telemetry endpoint, or Kiro infrastructure without explicit user action

### Client-Side Architecture
- All file parsing, auditing, scoring, and report generation execute in the browser
- No server-side processing; no backend required
- No persistent storage; no localStorage or sessionStorage use anywhere; all data lives in browser memory for the session
- Phase 2 repository extraction and scanning also client-side, using JSZip and in-browser indexing

### Partial-File Handling
- Specification files are optional in any combination (1, 2, or 3 files)
- Single-file checks always run; cross-file checks skipped when fewer than 3 files provided
- Report clearly lists skipped checks with reasons (e.g., "Requirement-Task linking skipped: tasks.md not provided")
- Score calculation applies only to checks that ran; missing files do not penalize the score

### Drift Detection Semantics
- Drift findings are **traceability signals**, not proof of implementation completeness or correctness
- Signals identify correlation (spec reference found in code, code section unmatched to spec) but cannot verify semantic correctness
- Users must apply human judgment; tooling assists discovery, not validation

### Data Security
- All user content (specs, code, API keys for LLM) stays in browser memory or is sent only to user-provided endpoints
- XSS prevention: all user content escaped before rendering
- No cookies, no localStorage of user data, no user accounts or authentication
- LLM API keys are memory-only (lost on page reload)

## Success Metrics

- **Specification Quality Improvement**: Authors fix Critical/High findings and raise health scores before task assignment
- **Reduced Rework**: Design/test teams identify incomplete or ambiguous specs early, avoiding implementation surprises
- **Traceability Clarity**: Phase 2 helps teams spot unlinked code or unimplemented requirements, reducing drift during maintenance
- **User Adoption**: Tool is discoverable, requires no setup, and provides actionable feedback within seconds

## Out of Scope

- Backend storage or server-side processing
- Integration with Kiro CLI beyond reading uploaded spec files
- User accounts, authentication, or team management
- Automatic code generation or spec updates from code
- Version control integration (Git, etc.) beyond reading uploaded repos
- Real-time collaboration or multi-user editing
- CI/CD pipeline integration (standalone tool only)
- Modification of Kiro specifications themselves (read-only audit)
