---
inclusion: always
---

# Spec Doctor: Technology Stack & Build Discipline

## Technology Stack

### Core Framework & Language
- **TypeScript ^5.3.3** (installed 5.9.3, verified 14 Nov 2026): Strict mode, ES2020+ target
- **Vite ^5.0.7** (installed 5.4.21, verified 14 Nov 2026): Lightning-fast bundler and dev server
- **JSZip ^3.10.2** (installed 3.10.2): In-browser ZIP file extraction (Phase 2: repository upload)

### Testing & Quality
- **Vitest ^1.0.4** (installed 1.6.1, verified 14 Nov 2026): Unit test runner, 100% drop-in Vite integration
- **@vitest/ui ^1.0.4** (installed 1.6.1, verified 14 Nov 2026): Interactive test UI for debugging test failures

### Package Manager
- **npm**: All dependencies use caret ranges (e.g. `^3.10.2`); exact installed versions are locked in package-lock.json

## Build & Execution Commands

### Development Server
```bash
npm run dev
```
- Starts Vite dev server at http://localhost:5173
- Hot module reloading (HMR) enabled
- Watches TypeScript files and triggers recompilation
- No build artifacts generated; served directly from memory

### Production Build
```bash
npm run build
```
- **Actual command**: `tsc && vite build`
- **Step 1**: `tsc` (TypeScript compiler)
  - Compiles all `.ts` files in `src/` to JavaScript
  - Performs type checking in strict mode
  - Outputs to `dist/` (configured in tsconfig.json)
  - Fails fast if type errors are present; build aborts
- **Step 2**: `vite build`
  - Bundles and minifies JavaScript output
  - Tree-shakes unused code
  - Generates production-ready `dist/` folder with HTML, JS, CSS
  - Output includes source maps for debugging (optional)
- **Artifacts**: `dist/` folder contains `index.html`, bundled JS/CSS, and static assets from `public/`
- **Size optimization**: Vite automatically chunk-splits for optimal loading

### Test Suite Execution
```bash
npx vitest run
```
- Runs full test suite once (CI/CD mode)
- Exits with non-zero status if any test fails
- Reports failure summaries to stdout

**Watch Mode** (the `test` script in package.json runs `vitest`, which watches):
```bash
npx vitest --watch
```
- Re-runs tests automatically on file changes
- Used during development for rapid feedback

### Preview Production Build
```bash
npm run preview
```
- Serves the production build (`dist/`) locally for testing
- Verifies production build works correctly before deployment

## Module Layout & Architecture

### Source Directory (`src/`)

All source files are TypeScript (`.ts`) with a clear modular structure:

- **parser.ts** (line extraction, block parsing, ID assignment)
  - Exports `parseRequirements()`, `parseDesign()`, `parseTasks()`
  - Handles unnumbered requirement/task ID assignment per document order
  - Validates UTF-8 encoding and tracks parse notes

- **types.ts** (core data structures)
  - `SpecFile`, `Requirement`, `Task`, `DesignSection`, `Finding`, `AuditReport`
  - `ParseNote`, `AuditOptions`
  - Ensures type consistency across modules

- **criteria.ts** (acceptance criteria validation rules)
  - GIVEN/WHEN/THEN format detector
  - EARS pattern validators (Ubiquitous, Event-driven, State-driven, Unwanted, Optional)
  - Testability heuristics

- **auditors.ts** (specification audit engines)
  - `RequirementsAuditor`: vague language, AC validation, duplicate detection, orphaned requirement detection
  - `DesignAuditor`: data model, error handling, conditional API contract checks
  - `TasksAuditor`: requirement references, oversized task detection, orphaned task detection
  - `CrossFileAuditor`: bidirectional traceability, runs only if all 3 files present

- **similarity.ts** (duplicate detection)
  - Jaccard similarity computation over token sets
  - Normalization: lowercase, strip punctuation, collapse whitespace
  - Threshold: >0.90 flags duplicates

- **engine.ts** (orchestration)
  - Coordinates parser, auditors, and score calculator
  - Handles partial-file degradation (graceful skipping of cross-file checks)
  - Applies error recovery and logging

- **scoring.ts** (health score calculation)
  - Implements diminishing deduction algorithm
  - Base deductions: Critical 15, High 8, Medium 3, Low 1
  - 60% multiplier for successive findings in same severity
  - Minimum 1 point per deduction; floor at 0

- **report.ts** (findings report generation)
  - Organizes findings by file, line number, severity
  - Generates JSON and Markdown exports
  - Formats quotes with context, suggestions, and explanations

- **drift.ts** (Phase 2: repository analysis)
  - `RepositoryExtractor`: ZIP extraction using JSZip, file indexing
  - `TraceabilityScanner`: scans code files for R/T ID references
  - Generates traceability signals (not authoritative proof)
  - Limits repository size to 50MB

- **llm.ts** (Phase 2: optional LLM integration)
  - Accepts user-provided OpenAI-compatible endpoint, API key, model name
  - Stores API key in memory only (never persisted)
  - User-triggered review only
  - Separates LLM findings from deterministic audit
  - Preserves deterministic 0–100 score

- **ui.ts** (browser UI interactions)
  - File upload/paste interface (two tabs)
  - Progress indicator during audit
  - Health score display with color coding (green 90–100, yellow 70–89, red <70)
  - Findings report rendering with filtering/sorting
  - Export modal (JSON/Markdown options)

- **style.css** (stylesheet)
  - Global styles for layout, colors, typography
  - Responsive design for desktop and tablet
  - Syntax highlighting for code snippets

- **main.ts** (entry point)
  - Initializes DOM, attaches event listeners, starts application lifecycle

### Test Directory (`tests/`)

All tests are TypeScript (`.ts`), mirroring `src/` structure:

- **parser.test.ts** (parsing logic, ID assignment, malformed specs)
- **auditors.test.ts** (audit logic, findings generation, edge cases)
- **engine.test.ts** (orchestration, partial-file handling, error recovery)
- **scoring.test.ts** (diminishing deduction algorithm, score floor/ceiling)
- **report.test.ts** (report formatting, JSON/Markdown export)
- **drift.test.ts** (Phase 2: ZIP extraction, reference scanning, traceability)
- **llm.test.ts** (Phase 2: API key handling, endpoint validation, finding separation)
- **placeholder.test.ts** (example test structure)

### Fixtures (`fixtures/` — root directory, created)

Test data for common scenarios, located at project root:

- **good-spec/** (valid, high-quality spec files)
  - well-formed requirements.md, design.md, tasks.md
  - Complete acceptance criteria in BDD format
  - All requirements traced to tasks
  - No vague language or duplicates

- **bad-spec/** (problematic, low-quality spec files)
  - Vague language, untestable criteria
  - Missing sections in design
  - Orphaned requirements/tasks
  - Oversized tasks
  - Incomplete traceability

## Configuration Files

### tsconfig.json
- **strict mode**: All strict type checks enabled
- **target**: ES2020
- **module**: ESNext
- **noEmit**: `true` — tsc typechecks only; `vite build` produces `dist/`

### vite.config.ts
- **entry point**: `index.html`
- **build output**: `dist/`
- **dev server**: http://localhost:5173

### package.json
- **type**: "module" (ES modules)
- **scripts**: dev, build (tsc && vite build), preview, test (vitest)
- **dependencies**: jszip (caret range)
- **devDependencies**: typescript, vite, vitest, @vitest/ui (all caret ranges)

## Verification Discipline

### During Implementation
- **After every code change**: Type checking (`npx tsc --noEmit`) runs automatically or via pre-commit hooks
- **Before committing**: Run full test suite (`npx vitest run`); all tests must pass
- **Before pushing to main/primary branch**: Verify production build succeeds (`npm run build` completes without errors)

### Operator Verification (After Delivery)
- **Build verification**: Operator runs `npm run build`; expects `dist/` folder with valid HTML/JS/CSS
- **Test verification**: Operator runs `npx vitest run`; expects all tests to pass
- **Smoke test**: Operator runs `npm run preview`, opens http://localhost:5173 in browser, uploads sample spec files, verifies audit completes and report displays

### No Automatic Testing in CI/CD
- Spec Doctor does not integrate with CI/CD pipelines
- All verification is manual or operator-triggered
- Build/test commands are run by the operator in their development environment

## Dependencies Rationale

- **Vite**: Modern, zero-config bundler optimized for fast builds and dev feedback
- **TypeScript**: Type safety and IDE support for complex audit logic
- **Vitest**: Native Vite integration, same configuration, fast test execution
- **JSZip**: No native browser ZIP API; JSZip is the standard for in-browser ZIP handling
- **No UI framework**: Application uses vanilla DOM APIs and event listeners (no React/Vue/Svelte overhead)

## Performance Targets

> UNMEASURED ASPIRATIONS — no latency or render benchmarks exist yet and no
> test measures these numbers. Do not treat them as verified claims.

- **Audit latency**: <500ms for typical 3-file spec (requirements, design, tasks)
- **Report rendering**: <100ms for 50+ findings
- **Repository scanning** (Phase 2): <2 seconds for 50MB codebase
- **LLM review latency** (Phase 2): Depends on user's endpoint; client-side timeout defaults to 60 seconds (AbortController)

## Security & Data Handling

- **No network requests** unless user explicitly triggers LLM review
- **LLM API keys**: Memory-only storage, no persistence
- **XSS prevention**: All user input escaped before rendering
- **Content Security Policy**: No unsafe-inline or unsafe-eval
- **File size limits**: Phase 2 repository capped at 50MB
