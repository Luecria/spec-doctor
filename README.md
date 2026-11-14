# Spec Doctor

A client-side web app that audits Kiro specification files (`requirements.md`, `design.md`, `tasks.md`) and flags spec-to-code drift in an uploaded repository. Nothing leaves the browser except the optional LLM review call, which uses a key you provide.

Built for [Kiroween 2026](https://kiroween.devpost.com/) (Frankenstein category): a spec parser, a heuristic rule engine, an optional LLM review, and a report generator stitched into one tool — built with Kiro's own spec-driven workflow, for Kiro specs.

## What it checks

**Spec audit (deterministic, no network calls)**

- Vague language in requirements and criteria ("may", "ideally", "user friendly", ...)
- Acceptance criteria missing GIVEN/WHEN/THEN structure or EARS format (ubiquitous, event-driven, state-driven, optional-feature, unwanted-behavior)
- Untestable criteria (subjective or unmeasurable wording)
- Requirements with no covering task, and tasks with no requirement reference
- Duplicate and near-duplicate requirements (Jaccard similarity over normalized tokens, threshold 0.90)
- Oversized or multi-concern tasks, and tasks whose acceptance criteria are missing
- Design sections missing error handling, a data model, or API contracts (contracts required only when an interface surface is described)

**Health score (0–100)** — starts at 100, subtracts per finding with diminishing deductions (Critical 15, High 8, Medium 3, Low 1, each repeat ×0.6 floored, minimum 1). The report shows the full deduction breakdown, so the score is reproducible by hand.

**Drift detection (spec ↔ code traceability)** — upload a repository folder or ZIP (read entirely in-browser via JSZip). The scanner matches spec IDs (`R1`, `T5`, ...) against code files and reports three kinds of traceability **signals** (text matching, not proof — every signal needs human judgment):

- Specified but not implemented (spec ID never referenced in code)
- Implemented but not specified (ID in code, absent from the spec)
- Orphaned code (a code file with no ID references at all, excluding tests and config files)

Drift signals never change the health score.

**Optional LLM semantic review** — bring your own OpenAI-compatible endpoint, API key, and model. One request, sent only when you click the button. The key stays in memory only: the app uses no `localStorage`, no `sessionStorage`, and no cookies. LLM suggestions appear in a separate, clearly labeled block and in exports, and never affect the score.

**Exports** — download the audit as JSON or Markdown. Filenames carry a UTC timestamp: `spec-doctor-report-YYYY-MM-DDTHHMMSSZ.json|.md`.

## Try it

Live demo: https://luecria.github.io/spec-doctor/

Or run locally:

```bash
npm install
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # typecheck + production build into dist/
npm test           # watch mode (Vitest)
npx vitest run     # full suite once
```

The `fixtures/` directory contains a `bad-spec` (scores 28, 37 findings) and a `good-spec` (scores 100, 0 findings) you can paste or upload to see the tool work. The tool also audits its own spec: `.kiro/specs/spec-doctor/` scores 82/100 with 9 findings (6 of them self-referential — the spec lists the vague terms the checker flags).

## Project structure

```
spec-doctor/
├── src/
│   ├── main.ts          # Bootstrap (wires UI to engine)
│   ├── ui.ts            # Upload/paste UI, report view, drift + LLM sections
│   ├── style.css        # Styling
│   ├── parser.ts        # requirements/design/tasks parsers (Kiro H3 format)
│   ├── criteria.ts      # Shared GIVEN/WHEN/THEN + EARS classification
│   ├── similarity.ts    # Normalization + Jaccard duplicate detection
│   ├── auditors.ts      # The deterministic check rules
│   ├── engine.ts        # runAudit: parse -> audit -> score -> coverage notes
│   ├── scoring.ts       # Diminishing-deduction scoring
│   ├── report.ts        # JSON/Markdown generation + export filenames
│   ├── drift.ts         # ZIP/folder extraction + traceability scanning
│   ├── llm.ts           # Optional BYO-key LLM review (one fetch call)
│   └── types.ts         # Shared types
├── tests/               # Vitest suites (281 tests, incl. engine->export e2e)
├── fixtures/            # bad-spec + good-spec sample specs
├── public/
│   └── .gitkeep
├── .kiro/
│   ├── specs/spec-doctor/   # The spec this tool was built from
│   ├── steering/            # Product, tech, and structure notes
│   └── hooks/               # Typecheck-on-save hook
├── .github/
│   └── workflows/deploy.yml   # GitHub Pages deploy workflow
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── package-lock.json
├── .gitignore
└── LICENSE
```

## How Kiro was used

The build followed Kiro's spec-driven workflow through the Kiro CLI (`kiro-cli`):

1. **Spec** — the requirements, design, and task list in `.kiro/specs/spec-doctor/` were generated with Kiro CLI (`chat --no-interactive`, haiku model), then reviewed and amended by the operator (EARS taxonomy corrected, duplicate-detection threshold fixed at Jaccard 0.90, scoring rule pinned to diminishing deductions without caps).
2. **Implementation** — each task (parser, auditors, scoring, UI, drift, LLM review) was implemented in a separate headless Kiro CLI session given an exact task prompt and filesystem tools only. No shell access was granted to the agent sessions.
3. **Verification** — the operator ran every build, test suite, browser smoke test, and dogfood audit, and sent failures back to Kiro as exact fix instructions. Two real UI-wiring defects (a drift handler that scanned an empty file list, and an LLM button that could never enable) were caught only by browser smoke tests against the built app.
4. **Artifacts** — the steering documents and the typecheck-on-save hook in `.kiro/` were authored as project artifacts in a final step and were not used during the build. No custom Kiro agents, MCP servers, or property-based tests were used: the default agent and exact per-task prompts sufficed, no external tool server was needed, and the headless CLI build used example-based Vitest tests only.

## Limitations (honest)

- Checks are heuristic text analysis, not semantic understanding. A well-written but wrong spec can score high.
- Drift detection is ID text matching. Renamed identifiers, generated code, and indirect references produce false signals in both directions.
- The "overimplemented requirements" case (a requirement with far more implementation than specified) has no dedicated signal; it is only partially covered by implemented-not-specified.
- No latency or render benchmarks exist; any performance numbers in the steering docs are labeled unmeasured aspirations.
- The LLM review was verified against a local stub OpenAI-compatible server, not a live provider.

## License

MIT — see [LICENSE](LICENSE).
