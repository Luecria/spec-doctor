# Spec Doctor: Design

## Architecture Overview

Spec Doctor is a single-page application (SPA) with no backend services. All processing occurs client-side in the browser using JavaScript/TypeScript. The application follows a modular architecture with clear separation between file input, audit engine, and report generation.

```
┌─────────────────────────────────────────────────────────────┐
│                    Spec Doctor SPA                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  UI Layer (React/Vue/Svelte)                                │
│  ├─ File Upload/Paste Interface                             │
│  ├─ Progress Indicator                                      │
│  ├─ Health Score Display                                    │
│  └─ Findings Report Renderer                                │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Application Logic                                           │
│  ├─ File Parser (text → structured format)                 │
│  ├─ Audit Engine (runs all checks)                         │
│  ├─ Score Calculator (generates 0-100 score)               │
│  └─ Report Generator (findings report)                      │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Audit Modules                                               │
│  ├─ RequirementsAuditor                                     │
│  ├─ DesignAuditor                                           │
│  ├─ TasksAuditor                                            │
│  └─ CrossFileAuditor                                        │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  In-Browser Storage (Phase 2)                               │
│  └─ File Cache & Repository Index                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### SpecFile
```
{
  type: 'requirements' | 'design' | 'tasks',
  name: string,
  content: string,
  lines: string[],
  characterCount: number,
  uploadedAt: Date
}
```

### Requirement
```
{
  id: string,
  number: number,
  title: string,
  description: string,
  acceptanceCriteria: AcceptanceCriterion[],
  startLine: number,
  endLine: number
}
```

### AcceptanceCriterion
```
{
  id: string,
  text: string,
  format: 'given-when-then' | 'ears' | 'unstructured',
  isTestable: boolean,
  line: number,
  issues: string[]
}
```

### Task
```
{
  id: string,
  number: number,
  title: string,
  description: string,
  acceptanceCriteria: AcceptanceCriterion[],
  requirementReferences: string[],
  startLine: number,
  endLine: number,
  estimatedSize: 'small' | 'medium' | 'large' | 'oversized'
}
```

### Finding
```
{
  id: string,
  file: 'requirements' | 'design' | 'tasks',
  line: number,
  lineRange: [number, number],
  severity: 'Critical' | 'High' | 'Medium' | 'Low',
  category: string,
  quote: string,
  message: string,
  suggestion: string
}
```

### ParseNote
```
{
  severity: 'error' | 'warning',
  message: string,
  line?: number
}
```

### AuditReport
```
{
  health: number,
  timestamp: Date,
  files: SpecFile[],
  findings: Finding[],
  summary: {
    totalFindings: number,
    criticalCount: number,
    highCount: number,
    mediumCount: number,
    lowCount: number
  }
}
```

## Data Flow

1. **Input Phase:**
   - User uploads or pastes spec files (requirements.md, design.md, tasks.md)
   - Application parses files into SpecFile objects
   - Files are stored in component state (no persistence)

**Parser ID Convention:**
   - Requirement IDs must match the pattern R followed by digits (R1, R2, R3, ..., R999)
   - Task IDs must match the pattern T followed by digits (T1, T2, T3, ..., T999)
   - Unnumbered requirements or tasks are assigned sequential IDs in document order as fallback (the first unnumbered requirement becomes the next sequential R number based on existing IDs)
   - The parser SHALL implement both the pattern matching and the fallback assignment logic

2. **Audit Phase:**
   - RequirementsAuditor analyzes requirements.md
     - Parses requirement blocks (R1, R2, etc.)
     - Validates acceptance criteria format (GIVEN/WHEN/THEN or EARS)
     - Checks for vague language
     - Detects orphaned requirements (no task references)
     - Identifies duplicates
   - DesignAuditor analyzes design.md
     - Checks for data model documentation
     - Checks for error handling strategy
     - Checks for API contracts (conditional on interface surface)
   - TasksAuditor analyzes tasks.md
     - Parses task blocks (T1, T2, etc.)
     - Validates requirement references
     - Detects oversized tasks
     - Identifies orphaned tasks (no requirement references)
   - CrossFileAuditor correlates across files (runs only if all 3 files provided)
     - Links requirements to tasks
     - Validates bidirectional references

**Partial-File Degradation:**
   - When only 1-2 files are provided, all single-file checks run normally
   - Cross-file checks are skipped gracefully (no error)
   - Report lists skipped checks with reasons in a "Coverage" section
   - Score is calculated over applicable checks only (not penalizing for unavailable files)
   - Example: if only requirements.md and design.md are provided, orphaned requirement checks run, but requirement-to-task traceability checks are skipped and noted

**Design Section Evaluation Rules:**
   - A design section counts as present only if it contains: (1) at least 2 distinct terms from that category's vocabulary, (2) at least 200 characters of non-heading content, (3) at least one structured element (list, table, or code block) or 2+ sentences
   - If no interface surface is described in the design, API contract checks are skipped (see R3 conditional rule)
   - If interface surfaces are described but contracts are unspecified, flag as Critical finding

**Design Category Vocabularies:**
   - **Data Model:** {schema, structure, entity, database, model, table, class, object, field, attribute, relationship, diagram, ER, normalization, primary key, foreign key}
   - **Error Handling:** {error, exception, failure, retry, validation, assert, throw, catch, try, fault, crash, recovery, logging, monitoring, graceful, degradation, fallback}
   - **API Contracts:** {endpoint, interface, protocol, contract, method, parameter, request, response, payload, header, status code, REST, gRPC, GraphQL, HTTP, TCP, authentication, authorization}

3. **Scoring Phase:**
   - Score calculator applies diminishing deductions based on findings
   - Base deductions: Critical 15, High 8, Medium 3, Low 1
   - Within each severity level, each additional finding deducts 60% of the previous deduction (e.g., Critical: -15, -9, -5.4, -3.24...)
   - Minimum per-deduction: 1 point
   - Base score: 100, deduct per finding, minimum final score: 0
   - Report displays deduction breakdown by severity level

**Duplicate Detection Algorithm:**
   - **Normalization:** Lowercase requirement text, strip punctuation, collapse whitespace (multiple spaces → single space)
   - **Similarity Computation:** Compute Jaccard similarity over token sets (split by whitespace, compare unique tokens)
   - **Threshold:** Flag pairs with Jaccard similarity > 0.90 as duplicate or near-duplicate
   - **Reporting:** Flag duplicate pairs as "High" severity findings with both requirement IDs and similarity score

4. **Report Phase:**
   - Findings are organized by file and line number
   - Report is rendered in UI
   - User can export as JSON or markdown

5. **Phase 2 - Drift Detection:**
   - User uploads repository (folder or ZIP)
   - Application extracts files in-browser using JSZip or similar
   - Scans code files for requirement/task ID references (e.g., "R1", "T3")
   - Generates traceability signals (not authoritative proof)

## Error Handling

### File Upload Errors
- **Large files (>10MB):** Display error message, request smaller file
- **Unsupported format:** Display error, accept UTF-8 text only
- **Parse errors:** Graceful degradation; display partial results with error indicators

### Audit Processing Errors
- **Malformed spec files:** Auditor skips problematic sections, logs warnings
- **Missing sections:** Audit proceeds with available data, flags missing sections as Critical findings
- **Encoding issues:** Treat invalid UTF-8 as corruption, display warning

### Export Errors
- **JSON serialization failures:** Fall back to markdown export
- **Download failures:** Display error message with option to copy-paste results

### Phase 2 Repository Errors
- **ZIP extraction failure:** Display error, suggest manual file upload
- **Unsupported code languages:** Skip unsupported files, audit available formats
- **Memory constraints:** Limit repository size to 50MB; display warning for larger repos

## API Contracts & Interfaces

### AuditEngine
```typescript
interface AuditEngine {
  audit(files: SpecFile[]): Promise<AuditReport>
  setOptionsConfig?(options: AuditOptions): void
}

interface AuditOptions {
  strictMode: boolean,
  customVagueTerms: string[],
  minAcceptanceCriteria: number,
  maxTaskSize: number
}
```

### API Contracts Conditional Rule
- API/interface contracts are required **only** when the design describes components with an interface surface (APIs, endpoints, service boundaries)
- If no interface surface is described, the check is skipped and produces no finding
- If interfaces are described but contracts are unspecified, flag as Critical severity
- This conditional applies to R3, T4, and DesignAuditor implementation

### FileParser
```typescript
interface FileParser {
  parseRequirements(content: string): { requirements: Requirement[], parseNotes: ParseNote[] }
  parseDesign(content: string): { sections: DesignSection[], parseNotes: ParseNote[] }
  parseTasks(content: string): { tasks: Task[], parseNotes: ParseNote[] }
}
```

### ReportGenerator
```typescript
interface ReportGenerator {
  generateJSON(report: AuditReport): string
  generateMarkdown(report: AuditReport): string
  generateHTML(report: AuditReport): string
}
```

### Phase 2 - RepositoryAnalyzer
```typescript
interface RepositoryAnalyzer {
  extractRepository(zipData: ArrayBuffer): Promise<FileIndex>
  scanForReferences(fileIndex: FileIndex, specs: SpecFile[]): TraceabilityMap
  generateTraceabilityReport(map: TraceabilityMap): TraceabilityReport
}

interface TraceabilityMap {
  requiredNotImplemented: string[],
  implementedNotRequired: string[],
  implementedAndRequired: Map<string, string[]>,
  taskReferences: Map<string, string[]>
}
```

## State Management

- **Local component state** for file uploads (no external state management required for Phase 1)
- **SessionStorage** for in-progress audits (optional, for resilience)
- Phase 2 may use IndexedDB for repository caching

## Performance Considerations

- Audits process files incrementally to avoid blocking UI
- Large files (>1MB) use Web Workers to prevent jank
- Report generation is lazy (rendered on demand for large finding lists)
- Phase 2 repository scanning with 50MB size limit to prevent memory exhaustion

## Technology Stack

- **UI Framework:** React (or Vue/Svelte) with TypeScript
- **File Handling:** FileReader API (upload), textarea (paste)
- **Phase 2 ZIP:** JSZip library
- **Export:** Native JSON/Markdown generation, HTML5 download API
- **Build:** Vite, webpack, or similar modern bundler
- **Styling:** CSS modules or Tailwind CSS

## Security Considerations

- **No network requests except optional LLM:** The application makes no network requests by default. Optionally, when the user explicitly initiates LLM review, the application may transmit spec content to the user-configured OpenAI-compatible endpoint with the user-provided API key. All other data remains in-browser.
- **XSS prevention:** All user content escaped before rendering
- **Memory cleanup:** Uploaded files cleared from memory after use
- **No cookies/storage of user data** beyond current session
- **API key handling:** For optional LLM review, API keys are kept in browser memory only and never persisted
- Phase 2: ZIP extraction validated to prevent path traversal attacks
