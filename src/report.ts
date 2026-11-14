/**
 * Report generator for Spec Doctor (T8).
 * Generates findings reports in JSON and Markdown formats.
 *
 * Features:
 * - generateJSON(report): Produces JSON.stringify output with 2-space indent
 * - generateMarkdown(report): Produces readable markdown with findings grouped by file
 * - Handles empty findings state
 * - Supports optional LLM findings in a separate labeled section
 * - Includes coverage notes for skipped checks
 */

import { ExtendedAuditReport, CoverageNote } from './engine';
import { Finding } from './types';
import { DeductionBreakdown } from './scoring';

/**
 * Builds an export filename with timestamp in UTC ISO compact form.
 * 
 * @param format Export format: 'json' or 'md'
 * @param date Optional date (default: current time); used to generate timestamp
 * @returns Filename like 'spec-doctor-report-2026-11-14T075115Z.json'
 */
export function buildExportFilename(format: 'json' | 'md', date?: Date): string {
  const d = date || new Date();
  
  // Convert to UTC ISO string: YYYY-MM-DDTHH:MM:SS.sssZ
  const iso = d.toISOString();
  
  // Extract components: YYYY-MM-DD and HH:MM:SS
  const [datePart, timePart] = iso.split('T');
  const [year, month, day] = datePart.split('-');
  const [hours, minutes, seconds] = timePart.split(':');
  
  // Build compact timestamp: YYYY-MM-DDTHHMMSSZ
  const timestamp = `${year}-${month}-${day}T${hours}${minutes}${seconds.split('.')[0]}Z`;
  
  const ext = format === 'json' ? 'json' : 'md';
  return `spec-doctor-report-${timestamp}.${ext}`;
}

/**
 * Generates a JSON representation of the audit report.
 * Output is indented with 2 spaces for readability.
 * Includes health score, findings, breakdown, coverage notes, and any LLM findings.
 *
 * @param report The audit report to serialize
 * @returns JSON string with 2-space indentation
 */
export function generateJSON(report: ExtendedAuditReport): string {
  // Prepare the report object for JSON serialization
  const reportObject = {
    health: report.health,
    timestamp: report.timestamp.toISOString(),
    summary: report.summary,
    files: report.files.map((file) => ({
      type: file.type,
      name: file.name,
      characterCount: file.characterCount,
      uploadedAt: file.uploadedAt.toISOString(),
    })),
    findings: report.findings.map((finding) => ({
      id: finding.id,
      file: finding.file,
      line: finding.line,
      lineRange: finding.lineRange,
      severity: finding.severity,
      category: finding.category,
      quote: finding.quote,
      message: finding.message,
      suggestion: finding.suggestion,
    })),
    breakdown: report.breakdown,
    coverage: report.coverage,
    llmFindings: (report as any).llmFindings,
  };

  return JSON.stringify(reportObject, null, 2);
}

/**
 * Generates a human-readable markdown representation of the audit report.
 * Includes:
 * - Title and health score with color coding
 * - Per-severity deduction breakdown
 * - Findings grouped by file, sorted by line number
 * - Each finding includes severity, line, quote, message, and suggestion
 * - Coverage section with skipped checks and reasons
 * - Optional LLM findings in a separate labeled section
 * - Explicit "no findings" message when findings list is empty
 *
 * @param report The audit report to render
 * @returns Markdown string
 */
export function generateMarkdown(report: ExtendedAuditReport): string {
  let markdown = '';

  // === HEADER SECTION ===
  markdown += `# Spec Doctor Audit Report\n\n`;

  // Health score with interpretation
  const health = report.health;
  let healthInterpretation = '';
  if (health >= 90) {
    healthInterpretation = 'Excellent';
  } else if (health >= 70) {
    healthInterpretation = 'Good';
  } else {
    healthInterpretation = 'Needs Improvement';
  }

  markdown += `## Health Score: ${health}/100 (${healthInterpretation})\n\n`;
  markdown += `**Timestamp:** ${report.timestamp.toISOString()}\n\n`;

  // === SUMMARY SECTION ===
  markdown += `## Summary\n\n`;
  markdown += `- **Total Findings:** ${report.summary.totalFindings}\n`;
  markdown += `- **Critical:** ${report.summary.criticalCount}\n`;
  markdown += `- **High:** ${report.summary.highCount}\n`;
  markdown += `- **Medium:** ${report.summary.mediumCount}\n`;
  markdown += `- **Low:** ${report.summary.lowCount}\n\n`;

  // === DEDUCTION BREAKDOWN SECTION ===
  markdown += `## Score Deductions\n\n`;

  if (report.breakdown.length === 0) {
    markdown += `No deductions applied. Score at maximum.\n\n`;
  } else {
    for (const breakdownItem of report.breakdown) {
      const deductionDetails = breakdownItem.deductions
        .map((d) => `-${d}`)
        .join(', ');
      markdown += `### ${breakdownItem.severity} (${breakdownItem.count} finding${breakdownItem.count !== 1 ? 's' : ''})\n`;
      markdown += `Deductions: ${deductionDetails} = **-${breakdownItem.totalDeducted}** total\n\n`;
    }
  }

  // === FINDINGS SECTION ===
  if (report.findings.length === 0) {
    markdown += `## Findings\n\n`;
    markdown += `✓ No findings. Your specifications are well-formed!\n\n`;
  } else {
    markdown += `## Findings\n\n`;

    // Group findings by file
    const findingsByFile = {
      requirements: [] as Finding[],
      design: [] as Finding[],
      tasks: [] as Finding[],
    };

    report.findings.forEach((finding) => {
      findingsByFile[finding.file].push(finding);
    });

    // Sort each group by line number
    Object.keys(findingsByFile).forEach((fileKey) => {
      findingsByFile[fileKey as keyof typeof findingsByFile].sort(
        (a, b) => a.line - b.line
      );
    });

    // Render findings grouped by file
    const fileNames = {
      requirements: 'requirements.md',
      design: 'design.md',
      tasks: 'tasks.md',
    };

    for (const [fileKey, fileLabel] of Object.entries(fileNames)) {
      const findingsForFile =
        findingsByFile[fileKey as keyof typeof findingsByFile];

      if (findingsForFile.length === 0) {
        continue;
      }

      markdown += `### ${fileLabel}\n\n`;

      for (const finding of findingsForFile) {
        // Build severity badge
        const severityBadge = `**[${finding.severity}]**`;

        markdown += `#### ${severityBadge} Line ${finding.line} - ${finding.category}\n\n`;

        // Quote
        markdown += `**Quote:**\n`;
        markdown += `> ${escapeMarkdown(finding.quote)}\n\n`;

        // Message
        markdown += `**Issue:** ${escapeMarkdown(finding.message)}\n\n`;

        // Suggestion
        markdown += `**Fix:** ${escapeMarkdown(finding.suggestion)}\n\n`;
      }
    }
  }

  // === COVERAGE SECTION ===
  const skippedChecks = report.coverage.filter((c) => c.skipped);
  if (skippedChecks.length > 0) {
    markdown += `## Coverage Notes\n\n`;
    markdown += `The following checks were skipped:\n\n`;

    for (const note of skippedChecks) {
      markdown += `- **${escapeMarkdown(note.checkName)}:** ${escapeMarkdown(note.reason)}\n`;
    }

    markdown += `\n`;
  }

  // === LLM FINDINGS SECTION ===
  const llmFindings = (report as any).llmFindings;
  if (llmFindings && llmFindings.length > 0) {
    markdown += `## LLM Suggestions\n\n`;
    markdown += `⚠️ **Note:** These suggestions are provided by an AI model and do not affect the deterministic health score (0-100). Use human judgment to evaluate their relevance.\n\n`;

    for (const suggestion of llmFindings) {
      markdown += `- ${escapeMarkdown(suggestion)}\n`;
    }

    markdown += `\n`;
  }

  // === FILES SECTION ===
  markdown += `## Files Audited\n\n`;
  for (const file of report.files) {
    markdown += `- **${file.name}** (${file.characterCount} characters)\n`;
  }

  return markdown;
}

/**
 * Escapes special markdown characters to prevent formatting issues.
 * Escapes: *, _, [, ], #, >, -, |
 *
 * @param text The text to escape
 * @returns Escaped text safe for markdown rendering
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#')
    .replace(/>/g, '\\>')
    .replace(/\|/g, '\\|');
}
