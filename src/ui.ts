/**
 * UI module for Spec Doctor.
 * Provides UI components and state management for the application.
 */

import { runAudit, AuditInput, ExtendedAuditReport } from './engine';
import { generateJSON, generateMarkdown, buildExportFilename } from './report';
import {
  extractZip,
  buildFileList,
  scanTraceability,
  RepoFile,
  TraceabilityReport,
  DriftSignal,
} from './drift';
import { parseRequirements, parseTasks } from './parser';
import { requestLlmReview, LlmSuggestion } from './llm';

export interface UploadedFile {
  type: 'requirements' | 'design' | 'tasks' | 'unassigned';
  name: string;
  content: string;
  characterCount: number;
}

export interface RepositoryInfo {
  name: string;
  fileCount: number;
}

export interface UIState {
  files: UploadedFile[];
  report: ExtendedAuditReport | null;
  isAuditing: boolean;
  error: string | null;
  currentView: 'input' | 'report';
  activeTab: 'upload' | 'paste';
  filterSeverity: 'all' | 'Critical' | 'High' | 'Medium' | 'Low';
  filterFile: 'all' | 'requirements' | 'design' | 'tasks';
  sortBy: 'line' | 'severity';
  expandedFindingIds: Set<string>;
  // Drift detection state
  repository: RepositoryInfo | null;
  repositoryFiles: RepoFile[] | null;
  traceabilityReport: TraceabilityReport | null;
  isExtractingRepository: boolean;
  isScanning: boolean;
  extractionProgress: string;
  expandedSignalIds: Set<string>;
  // LLM semantic review state
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
  llmSuggestions: string[] | null;
  isRequestingLlmReview: boolean;
}

class SpecDoctorUI {
  private state: UIState = {
    files: [],
    report: null,
    isAuditing: false,
    error: null,
    currentView: 'input',
    activeTab: 'upload',
    filterSeverity: 'all',
    filterFile: 'all',
    sortBy: 'line',
    expandedFindingIds: new Set(),
    repository: null,
    repositoryFiles: null,
    traceabilityReport: null,
    isExtractingRepository: false,
    isScanning: false,
    extractionProgress: '',
    expandedSignalIds: new Set(),
    llmEndpoint: '',
    llmApiKey: '',
    llmModel: '',
    llmSuggestions: null,
    isRequestingLlmReview: false,
  };

  private root: HTMLElement;

  constructor(rootId: string) {
    const element = document.getElementById(rootId);
    if (!element) {
      throw new Error(`Root element with id "${rootId}" not found`);
    }
    this.root = element;
  }

  /**
   * Initialize and render the application UI.
   */
  public render(): void {
    this.root.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'spec-doctor-container';

    // Header
    const header = this.createHeader();
    container.appendChild(header);

    // Main content
    if (this.state.currentView === 'input') {
      const inputView = this.createInputView();
      container.appendChild(inputView);
    } else {
      const reportView = this.createReportView();
      container.appendChild(reportView);
    }

    this.root.appendChild(container);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'spec-doctor-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'header-title';

    const title = document.createElement('h1');
    title.textContent = 'Spec Doctor';
    titleContainer.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Client-side auditor for Kiro specification quality';
    titleContainer.appendChild(subtitle);

    header.appendChild(titleContainer);

    return header;
  }

  private createInputView(): HTMLElement {
    const view = document.createElement('div');
    view.className = 'input-view';

    // Error display
    if (this.state.error) {
      const errorBox = document.createElement('div');
      errorBox.className = 'error-box';
      errorBox.innerHTML = `
        <div class="error-content">
          <strong>Error:</strong> ${this.escapeHtml(this.state.error)}
        </div>
        <button class="error-close" type="button">×</button>
      `;
      errorBox.querySelector('.error-close')?.addEventListener('click', () => {
        this.state.error = null;
        this.render();
      });
      view.appendChild(errorBox);
    }

    // Tab container
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container';

    // Tabs
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';

    const uploadTab = document.createElement('button');
    uploadTab.className = `tab-button ${this.state.activeTab === 'upload' ? 'active' : ''}`;
    uploadTab.textContent = 'Upload';
    uploadTab.type = 'button';
    uploadTab.addEventListener('click', () => {
      this.state.activeTab = 'upload';
      this.render();
    });
    tabList.appendChild(uploadTab);

    const pasteTab = document.createElement('button');
    pasteTab.className = `tab-button ${this.state.activeTab === 'paste' ? 'active' : ''}`;
    pasteTab.textContent = 'Paste';
    pasteTab.type = 'button';
    pasteTab.addEventListener('click', () => {
      this.state.activeTab = 'paste';
      this.render();
    });
    tabList.appendChild(pasteTab);

    tabContainer.appendChild(tabList);

    // Tab content
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';

    if (this.state.activeTab === 'upload') {
      tabContent.appendChild(this.createUploadTab());
    } else {
      tabContent.appendChild(this.createPasteTab());
    }

    tabContainer.appendChild(tabContent);
    view.appendChild(tabContainer);

    // File list
    if (this.state.files.length > 0) {
      const fileList = this.createFileList();
      view.appendChild(fileList);
    }

    // Audit button
    const auditSection = document.createElement('div');
    auditSection.className = 'audit-section';

    const auditButton = document.createElement('button');
    auditButton.className = 'audit-button';
    auditButton.type = 'button';
    auditButton.disabled = this.state.files.length === 0 || !this.allFilesAssigned() || this.state.isAuditing;

    if (this.state.isAuditing) {
      auditButton.innerHTML = '<span class="spinner"></span> Auditing...';
    } else {
      auditButton.textContent = 'Audit Specifications';
    }

    auditButton.addEventListener('click', () => this.handleAudit());
    auditSection.appendChild(auditButton);

    view.appendChild(auditSection);

    return view;
  }

  private createUploadTab(): HTMLElement {
    const tab = document.createElement('div');
    tab.className = 'upload-tab';

    // Drag and drop area
    const dropArea = document.createElement('div');
    dropArea.className = 'drop-area';
    dropArea.innerHTML = `
      <div class="drop-content">
        <svg class="drop-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p><strong>Drag files here</strong> or click to select</p>
        <p class="drop-hint">Accepts .md files (requirements, design, tasks)</p>
      </div>
    `;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.md';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        this.handleFileUpload(Array.from(files));
      }
    });

    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag-over');
    });
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      if (e.dataTransfer?.files) {
        this.handleFileUpload(Array.from(e.dataTransfer.files));
      }
    });

    tab.appendChild(dropArea);
    tab.appendChild(fileInput);

    return tab;
  }

  private createPasteTab(): HTMLElement {
    const tab = document.createElement('div');
    tab.className = 'paste-tab';

    const labels = ['Requirements', 'Design', 'Tasks'] as const;

    labels.forEach((label) => {
      const group = document.createElement('div');
      group.className = 'paste-group';

      const labelEl = document.createElement('label');
      labelEl.textContent = `${label} (${label.toLowerCase()}.md)`;

      const textarea = document.createElement('textarea');
      textarea.placeholder = `Paste your ${label.toLowerCase()}.md content here...`;
      textarea.className = 'paste-textarea';

      textarea.addEventListener('input', () => {
        const type = label.toLowerCase() as 'requirements' | 'design' | 'tasks';
        if (textarea.value.trim()) {
          // Update or add file
          const existingIndex = this.state.files.findIndex((f) => f.type === type);
          const file: UploadedFile = {
            type,
            name: `${type}.md`,
            content: textarea.value,
            characterCount: textarea.value.length,
          };
          if (existingIndex >= 0) {
            this.state.files[existingIndex] = file;
          } else {
            this.state.files.push(file);
          }
        } else {
          // Remove file if empty
          this.state.files = this.state.files.filter((f) => f.type !== type);
        }
        this.render();
      });

      group.appendChild(labelEl);
      group.appendChild(textarea);
      tab.appendChild(group);
    });

    return tab;
  }

  private createFileList(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'file-list-container';

    const heading = document.createElement('h3');
    heading.textContent = 'Uploaded Files';
    container.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'file-list';

    this.state.files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-item';

      // Type selector (only if unassigned)
      if (file.type === 'unassigned') {
        const select = document.createElement('select');
        select.className = 'file-type-select';
        select.value = 'unassigned';

        const options = ['unassigned', 'requirements', 'design', 'tasks'] as const;
        options.forEach((opt) => {
          const optEl = document.createElement('option');
          optEl.value = opt;
          optEl.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
          select.appendChild(optEl);
        });

        select.addEventListener('change', (e) => {
          const newType = (e.target as HTMLSelectElement).value as UploadedFile['type'];
          this.state.files[index].type = newType;
          this.render();
        });

        item.appendChild(select);
      } else {
        const typeLabel = document.createElement('span');
        typeLabel.className = 'file-type-label';
        typeLabel.textContent = file.type.charAt(0).toUpperCase() + file.type.slice(1);
        item.appendChild(typeLabel);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'file-name';
      nameEl.textContent = file.name;
      item.appendChild(nameEl);

      const countEl = document.createElement('span');
      countEl.className = 'file-count';
      countEl.textContent = `${file.characterCount.toLocaleString()} chars`;
      item.appendChild(countEl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        this.state.files.splice(index, 1);
        this.render();
      });
      item.appendChild(removeBtn);

      list.appendChild(item);
    });

    container.appendChild(list);
    return container;
  }

  private createReportView(): HTMLElement {
    const view = document.createElement('div');
    view.className = 'report-view';

    if (!this.state.report) {
      return view;
    }

    const report = this.state.report;

    // Health score card
    const scoreCard = this.createScoreCard(report.health);
    view.appendChild(scoreCard);

    // Summary stats
    const summary = this.createSummaryStats(report);
    view.appendChild(summary);

    // Deduction breakdown
    const breakdown = this.createBreakdownSection(report);
    view.appendChild(breakdown);

    // Filters and controls
    const controls = this.createFilterControls();
    view.appendChild(controls);

    // Findings section
    const findingsSection = this.createFindingsSection(report);
    view.appendChild(findingsSection);

    // Coverage notes
    if (report.coverage.some((c) => c.skipped)) {
      const coverage = this.createCoverageSection(report);
      view.appendChild(coverage);
    }

    // LLM Semantic Review section (T17)
    const llmSection = this.createLlmReviewSection(report);
    view.appendChild(llmSection);

    // Upload Repository button (T13)
    const repoSection = this.createRepositorySection();
    view.appendChild(repoSection);

    // Traceability Report (T16)
    if (this.state.traceabilityReport) {
      const traceReport = this.createTraceabilityReportSection(this.state.traceabilityReport);
      view.appendChild(traceReport);
    }

    // Export buttons
    const exportSection = this.createExportSection(report);
    view.appendChild(exportSection);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-button';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Start Over';
    resetBtn.addEventListener('click', () => this.handleReset());
    view.appendChild(resetBtn);

    return view;
  }

  private createScoreCard(health: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'score-card';

    let colorClass = 'score-good';
    if (health < 70) {
      colorClass = 'score-critical';
    } else if (health < 90) {
      colorClass = 'score-warning';
    }

    card.innerHTML = `
      <div class="score-inner ${colorClass}">
        <div class="score-number">${health}</div>
        <div class="score-label">Health Score</div>
      </div>
    `;

    return card;
  }

  private createSummaryStats(report: ExtendedAuditReport): HTMLElement {
    const container = document.createElement('div');
    container.className = 'summary-stats';

    const stats = [
      { label: 'Total Findings', value: report.summary.totalFindings },
      { label: 'Critical', value: report.summary.criticalCount, color: 'critical' },
      { label: 'High', value: report.summary.highCount, color: 'high' },
      { label: 'Medium', value: report.summary.mediumCount, color: 'medium' },
      { label: 'Low', value: report.summary.lowCount, color: 'low' },
    ];

    stats.forEach((stat) => {
      const item = document.createElement('div');
      item.className = `stat-item ${stat.color ? `stat-${stat.color}` : ''}`;
      item.innerHTML = `
        <div class="stat-value">${stat.value}</div>
        <div class="stat-label">${stat.label}</div>
      `;
      container.appendChild(item);
    });

    return container;
  }

  private createBreakdownSection(report: ExtendedAuditReport): HTMLElement {
    const section = document.createElement('section');
    section.className = 'breakdown-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Score Deductions';
    section.appendChild(heading);

    if (report.breakdown.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'no-deductions';
      msg.textContent = '✓ No deductions applied. Perfect score!';
      section.appendChild(msg);
    } else {
      const breakdown = document.createElement('div');
      breakdown.className = 'breakdown-list';

      report.breakdown.forEach((item) => {
        const row = document.createElement('div');
        row.className = `breakdown-row breakdown-${item.severity.toLowerCase()}`;

        const deductionStr = item.deductions.map((d) => `-${d}`).join(', ');

        row.innerHTML = `
          <span class="breakdown-severity">${item.severity}</span>
          <span class="breakdown-count">${item.count} finding${item.count !== 1 ? 's' : ''}</span>
          <span class="breakdown-deductions">${deductionStr}</span>
          <span class="breakdown-total">= <strong>-${item.totalDeducted}</strong></span>
        `;

        breakdown.appendChild(row);
      });

      section.appendChild(breakdown);
    }

    return section;
  }

  private createFilterControls(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'filter-controls';

    // Severity filter
    const severityGroup = document.createElement('div');
    severityGroup.className = 'filter-group';

    const severityLabel = document.createElement('label');
    severityLabel.textContent = 'Filter by Severity:';
    severityGroup.appendChild(severityLabel);

    const severitySelect = document.createElement('select');
    severitySelect.value = this.state.filterSeverity;

    const severityOptions = ['all', 'Critical', 'High', 'Medium', 'Low'] as const;
    severityOptions.forEach((opt) => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt === 'all' ? 'All Severities' : opt;
      severitySelect.appendChild(optEl);
    });

    severitySelect.addEventListener('change', (e) => {
      this.state.filterSeverity = (e.target as HTMLSelectElement).value as UIState['filterSeverity'];
      this.render();
    });

    severityGroup.appendChild(severitySelect);
    container.appendChild(severityGroup);

    // File filter
    const fileGroup = document.createElement('div');
    fileGroup.className = 'filter-group';

    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'Filter by File:';
    fileGroup.appendChild(fileLabel);

    const fileSelect = document.createElement('select');
    fileSelect.value = this.state.filterFile;

    const fileOptions = ['all', 'requirements', 'design', 'tasks'] as const;
    fileOptions.forEach((opt) => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt === 'all' ? 'All Files' : `${opt}.md`;
      fileSelect.appendChild(optEl);
    });

    fileSelect.addEventListener('change', (e) => {
      this.state.filterFile = (e.target as HTMLSelectElement).value as UIState['filterFile'];
      this.render();
    });

    fileGroup.appendChild(fileSelect);
    container.appendChild(fileGroup);

    // Sort control
    const sortGroup = document.createElement('div');
    sortGroup.className = 'filter-group';

    const sortLabel = document.createElement('label');
    sortLabel.textContent = 'Sort by:';
    sortGroup.appendChild(sortLabel);

    const sortSelect = document.createElement('select');
    sortSelect.value = this.state.sortBy;

    const sortOptions = ['line', 'severity'] as const;
    sortOptions.forEach((opt) => {
      const optEl = document.createElement('option');
      optEl.value = opt;
      optEl.textContent = opt === 'line' ? 'Line Number' : 'Severity';
      sortSelect.appendChild(optEl);
    });

    sortSelect.addEventListener('change', (e) => {
      this.state.sortBy = (e.target as HTMLSelectElement).value as UIState['sortBy'];
      this.render();
    });

    sortGroup.appendChild(sortSelect);
    container.appendChild(sortGroup);

    return container;
  }

  private createFindingsSection(report: ExtendedAuditReport): HTMLElement {
    const section = document.createElement('section');
    section.className = 'findings-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Findings';
    section.appendChild(heading);

    if (report.findings.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'no-findings';
      msg.textContent = '✓ No findings. Your specifications are excellent!';
      section.appendChild(msg);
      return section;
    }

    // Filter and sort findings
    let filtered = report.findings.filter((f) => {
      if (this.state.filterSeverity !== 'all' && f.severity !== this.state.filterSeverity) {
        return false;
      }
      if (this.state.filterFile !== 'all' && f.file !== this.state.filterFile) {
        return false;
      }
      return true;
    });

    if (this.state.sortBy === 'severity') {
      const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    } else {
      filtered.sort((a, b) => a.line - b.line);
    }

    // Group by file
    const byFile: Record<string, typeof filtered> = {};
    filtered.forEach((f) => {
      if (!byFile[f.file]) {
        byFile[f.file] = [];
      }
      byFile[f.file].push(f);
    });

    const fileOrder = ['requirements', 'design', 'tasks'];
    fileOrder.forEach((file) => {
      const findings = byFile[file];
      if (!findings || findings.length === 0) {
        return;
      }

      const fileSection = document.createElement('div');
      fileSection.className = 'findings-file-section';

      const fileHeading = document.createElement('h3');
      fileHeading.textContent = `${file}.md`;
      fileSection.appendChild(fileHeading);

      const findingsList = document.createElement('div');
      findingsList.className = 'findings-list';

      findings.forEach((finding) => {
        const item = this.createFindingItem(finding);
        findingsList.appendChild(item);
      });

      fileSection.appendChild(findingsList);
      section.appendChild(fileSection);
    });

    return section;
  }

  private createFindingItem(finding: any): HTMLElement {
    const item = document.createElement('div');
    item.className = `finding-item finding-${finding.severity.toLowerCase()}`;

    const isExpanded = this.state.expandedFindingIds.has(finding.id);

    const header = document.createElement('div');
    header.className = 'finding-header';
    header.addEventListener('click', () => {
      if (isExpanded) {
        this.state.expandedFindingIds.delete(finding.id);
      } else {
        this.state.expandedFindingIds.add(finding.id);
      }
      this.render();
    });

    header.innerHTML = `
      <span class="finding-toggle">${isExpanded ? '▼' : '▶'}</span>
      <span class="finding-severity-badge">${finding.severity}</span>
      <span class="finding-line">Line ${finding.line}</span>
      <span class="finding-category">${this.escapeHtml(finding.category)}</span>
    `;

    item.appendChild(header);

    if (isExpanded) {
      const body = document.createElement('div');
      body.className = 'finding-body';

      // Quote
      const quoteSection = document.createElement('div');
      quoteSection.className = 'finding-section';
      quoteSection.innerHTML = `
        <h4>Quote:</h4>
        <blockquote class="finding-quote">${this.escapeHtml(finding.quote)}</blockquote>
      `;
      body.appendChild(quoteSection);

      // Message
      const messageSection = document.createElement('div');
      messageSection.className = 'finding-section';
      messageSection.innerHTML = `
        <h4>Issue:</h4>
        <p>${this.escapeHtml(finding.message)}</p>
      `;
      body.appendChild(messageSection);

      // Suggestion
      const suggestionSection = document.createElement('div');
      suggestionSection.className = 'finding-section';
      suggestionSection.innerHTML = `
        <h4>Fix:</h4>
        <p>${this.escapeHtml(finding.suggestion)}</p>
      `;
      body.appendChild(suggestionSection);

      // Source context (show lines around the finding)
      if (this.state.report) {
        const file = this.state.report.files.find((f) => f.type === finding.file);
        if (file) {
          const lines = file.lines;
          const startLine = Math.max(0, finding.line - 3);
          const endLine = Math.min(lines.length, finding.line + 2);

          const sourceSection = document.createElement('div');
          sourceSection.className = 'finding-section';
          sourceSection.innerHTML = '<h4>Source Context:</h4>';

          const sourceCode = document.createElement('pre');
          sourceCode.className = 'finding-source';

          for (let i = startLine; i < endLine; i++) {
            const lineNum = i + 1;
            const lineContent = lines[i] || '';
            const isHighlight = lineNum === finding.line;
            const lineDiv = document.createElement('div');
            lineDiv.className = `source-line ${isHighlight ? 'highlight' : ''}`;
            lineDiv.innerHTML = `<span class="line-number">${lineNum}</span><span class="line-content">${this.escapeHtml(lineContent)}</span>`;
            sourceCode.appendChild(lineDiv);
          }

          sourceSection.appendChild(sourceCode);
          body.appendChild(sourceSection);
        }
      }

      item.appendChild(body);
    }

    return item;
  }

  private createCoverageSection(report: ExtendedAuditReport): HTMLElement {
    const section = document.createElement('section');
    section.className = 'coverage-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Coverage Notes';
    section.appendChild(heading);

    const skipped = report.coverage.filter((c) => c.skipped);

    const list = document.createElement('ul');
    skipped.forEach((note) => {
      const item = document.createElement('li');
      item.innerHTML = `<strong>${this.escapeHtml(note.checkName)}:</strong> ${this.escapeHtml(note.reason)}`;
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  private createExportSection(report: ExtendedAuditReport): HTMLElement {
    const section = document.createElement('div');
    section.className = 'export-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Export Results';
    section.appendChild(heading);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'export-buttons';

    const jsonBtn = document.createElement('button');
    jsonBtn.type = 'button';
    jsonBtn.className = 'export-button export-json';
    jsonBtn.textContent = 'Download JSON';
    jsonBtn.addEventListener('click', () => {
      const json = generateJSON(report);
      const filename = buildExportFilename('json');
      this.downloadFile(json, filename, 'application/json');
    });
    buttonGroup.appendChild(jsonBtn);

    const mdBtn = document.createElement('button');
    mdBtn.type = 'button';
    mdBtn.className = 'export-button export-markdown';
    mdBtn.textContent = 'Download Markdown';
    mdBtn.addEventListener('click', () => {
      const md = generateMarkdown(report);
      const filename = buildExportFilename('md');
      this.downloadFile(md, filename, 'text/markdown');
    });
    buttonGroup.appendChild(mdBtn);

    section.appendChild(buttonGroup);
    return section;
  }

  private allFilesAssigned(): boolean {
    return this.state.files.every((f) => f.type !== 'unassigned');
  }

  private async handleFileUpload(files: File[]): Promise<void> {
    for (const file of files) {
      try {
        const content = await file.text();
        const type = this.detectFileType(file.name);

        const uploadedFile: UploadedFile = {
          type,
          name: file.name,
          content,
          characterCount: content.length,
        };

        // Check if already exists
        const existingIndex = this.state.files.findIndex((f) => f.name === file.name);
        if (existingIndex >= 0) {
          this.state.files[existingIndex] = uploadedFile;
        } else {
          this.state.files.push(uploadedFile);
        }
      } catch (err) {
        this.state.error = `Failed to read file ${file.name}: ${(err as Error).message}`;
      }
    }

    this.render();
  }

  private detectFileType(filename: string): UploadedFile['type'] {
    const lower = filename.toLowerCase();
    if (lower.includes('requirements')) return 'requirements';
    if (lower.includes('design')) return 'design';
    if (lower.includes('tasks')) return 'tasks';
    return 'unassigned';
  }

  private async handleAudit(): Promise<void> {
    this.state.isAuditing = true;
    this.state.error = null;
    this.render();

    try {
      // Validate files
      if (this.state.files.length === 0) {
        throw new Error('Please provide at least one specification file.');
      }

      if (!this.allFilesAssigned()) {
        throw new Error('Please assign a type to all files or remove unassigned files.');
      }

      // Build audit input
      const input: AuditInput = {};
      this.state.files.forEach((file) => {
        if (file.type !== 'unassigned') {
          input[file.type] = file.content;
        }
      });

      // Run audit
      const report = await new Promise<ExtendedAuditReport>((resolve) => {
        // Simulate async processing with setTimeout to allow UI update
        setTimeout(() => {
          resolve(runAudit(input));
        }, 100);
      });

      this.state.report = report;
      this.state.currentView = 'report';
      this.state.expandedFindingIds.clear();
    } catch (err) {
      this.state.error = (err as Error).message;
    } finally {
      this.state.isAuditing = false;
    }

    this.render();
  }

  private handleReset(): void {
    this.state = {
      files: [],
      report: null,
      isAuditing: false,
      error: null,
      currentView: 'input',
      activeTab: 'upload',
      filterSeverity: 'all',
      filterFile: 'all',
      sortBy: 'line',
      expandedFindingIds: new Set(),
      repository: null,
      repositoryFiles: null,
      traceabilityReport: null,
      isExtractingRepository: false,
      isScanning: false,
      extractionProgress: '',
      expandedSignalIds: new Set(),
      llmEndpoint: '',
      llmApiKey: '',
      llmModel: '',
      llmSuggestions: null,
      isRequestingLlmReview: false,
    };
    this.render();
  }

  private createLlmReviewSection(report: ExtendedAuditReport): HTMLElement {
    const section = document.createElement('section');
    section.className = 'llm-review-section';

    const heading = document.createElement('h2');
    heading.textContent = 'LLM Semantic Review (Optional)';
    section.appendChild(heading);

    const intro = document.createElement('p');
    intro.className = 'llm-intro';
    intro.textContent =
      'Optionally request AI-powered semantic analysis. Provide an OpenAI-compatible endpoint and API key.';
    section.appendChild(intro);

    // If suggestions already exist, show them
    if (this.state.llmSuggestions && this.state.llmSuggestions.length > 0) {
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'llm-suggestions';

      const suggestionsHeading = document.createElement('h3');
      suggestionsHeading.textContent = '✨ LLM Suggestions';
      suggestionsDiv.appendChild(suggestionsHeading);

      const disclaimer = document.createElement('div');
      disclaimer.className = 'llm-disclaimer';
      disclaimer.innerHTML =
        '<strong>⚠️ AI-generated suggestions</strong> — Not part of the deterministic health score. Use human judgment to evaluate.';
      suggestionsDiv.appendChild(disclaimer);

      const suggestionsList = document.createElement('ul');
      suggestionsList.className = 'llm-suggestions-list';

      this.state.llmSuggestions.forEach((suggestion) => {
        const item = document.createElement('li');
        item.textContent = suggestion;
        suggestionsList.appendChild(item);
      });

      suggestionsDiv.appendChild(suggestionsList);
      section.appendChild(suggestionsDiv);

      // Show "Request Another Review" button
      const anotherBtn = document.createElement('button');
      anotherBtn.type = 'button';
      anotherBtn.className = 'llm-button llm-another';
      anotherBtn.textContent = 'Request Another Review';
      anotherBtn.addEventListener('click', () => {
        // Show the input form again
        this.state.llmSuggestions = null;
        this.render();
      });
      section.appendChild(anotherBtn);
    } else {
      // Show input form
      const form = document.createElement('div');
      form.className = 'llm-form';

      // Helper to update request button disabled state without re-render
      const updateButtonState = () => {
        const btn = section.querySelector('.llm-button') as HTMLButtonElement;
        if (btn) {
          btn.disabled =
            !this.state.llmEndpoint ||
            !this.state.llmApiKey ||
            !this.state.llmModel ||
            this.state.isRequestingLlmReview;
        }
      };

      // Endpoint input
      const endpointGroup = document.createElement('div');
      endpointGroup.className = 'llm-form-group';

      const endpointLabel = document.createElement('label');
      endpointLabel.textContent = 'Endpoint URL:';
      endpointGroup.appendChild(endpointLabel);

      const endpointInput = document.createElement('input');
      endpointInput.type = 'text';
      endpointInput.className = 'llm-input';
      endpointInput.placeholder = 'https://api.openai.com/v1 or compatible endpoint';
      endpointInput.value = this.state.llmEndpoint;
      endpointInput.addEventListener('input', (e) => {
        this.state.llmEndpoint = (e.target as HTMLInputElement).value;
        updateButtonState();
      });
      endpointGroup.appendChild(endpointInput);

      form.appendChild(endpointGroup);

      // API Key input
      const keyGroup = document.createElement('div');
      keyGroup.className = 'llm-form-group';

      const keyLabel = document.createElement('label');
      keyLabel.textContent = 'API Key:';
      keyGroup.appendChild(keyLabel);

      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.className = 'llm-input';
      keyInput.placeholder = 'Your API key (kept in memory only, never stored)';
      keyInput.value = this.state.llmApiKey;
      keyInput.addEventListener('input', (e) => {
        this.state.llmApiKey = (e.target as HTMLInputElement).value;
        updateButtonState();
      });
      keyGroup.appendChild(keyInput);

      form.appendChild(keyGroup);

      // Model input
      const modelGroup = document.createElement('div');
      modelGroup.className = 'llm-form-group';

      const modelLabel = document.createElement('label');
      modelLabel.textContent = 'Model Name:';
      modelGroup.appendChild(modelLabel);

      const modelInput = document.createElement('input');
      modelInput.type = 'text';
      modelInput.className = 'llm-input';
      modelInput.placeholder = 'e.g. gpt-4, gpt-4-turbo, claude-3-sonnet';
      modelInput.value = this.state.llmModel;
      modelInput.addEventListener('input', (e) => {
        this.state.llmModel = (e.target as HTMLInputElement).value;
        updateButtonState();
      });
      modelGroup.appendChild(modelInput);

      form.appendChild(modelGroup);

      section.appendChild(form);

      // Request button
      const requestBtn = document.createElement('button');
      requestBtn.type = 'button';
      requestBtn.className = 'llm-button';
      requestBtn.disabled =
        !this.state.llmEndpoint ||
        !this.state.llmApiKey ||
        !this.state.llmModel ||
        this.state.isRequestingLlmReview;

      if (this.state.isRequestingLlmReview) {
        requestBtn.innerHTML = '<span class="spinner"></span> Requesting Review...';
      } else {
        requestBtn.textContent = 'Request LLM Review';
      }

      requestBtn.addEventListener('click', () => this.handleLlmReviewRequest(report));
      section.appendChild(requestBtn);

      // Error display
      if (this.state.error && this.state.isRequestingLlmReview) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'llm-error';
        errorDiv.textContent = this.state.error;
        section.appendChild(errorDiv);
      }
    }

    return section;
  }

  private async handleLlmReviewRequest(report: ExtendedAuditReport): Promise<void> {
    this.state.isRequestingLlmReview = true;
    this.state.error = null;
    this.render();

    try {
      // Validate inputs
      if (!this.state.llmEndpoint || !this.state.llmApiKey || !this.state.llmModel) {
        throw new Error('Please provide endpoint, API key, and model name');
      }

      // Build spec texts from report files
      const specTexts: Record<string, string | undefined> = {};
      for (const file of report.files) {
        specTexts[file.type] = file.content;
      }

      // Build deterministic summary (one line)
      const summary = `Score: ${report.health}/100 (${report.summary.criticalCount} critical, ${report.summary.highCount} high, ${report.summary.mediumCount} medium, ${report.summary.lowCount} low findings)`;

      // Request LLM review
      const suggestions = await requestLlmReview(
        {
          endpoint: this.state.llmEndpoint,
          apiKey: this.state.llmApiKey,
          model: this.state.llmModel,
        },
        specTexts as any,
        summary
      );

      // Convert suggestions to display strings
      this.state.llmSuggestions = suggestions.map((s) => {
        let text = s.message;
        if (s.file) {
          text = `[${s.file}] ${text}`;
        }
        if (s.line) {
          text = `${text} (line ${s.line})`;
        }
        if (s.suggestion) {
          text = `${text} → ${s.suggestion}`;
        }
        return text;
      });

      // Store suggestions on report for export
      (report as any).llmFindings = this.state.llmSuggestions;
    } catch (err) {
      this.state.error = (err as Error).message;
    } finally {
      this.state.isRequestingLlmReview = false;
    }

    this.render();
  }

  private createRepositorySection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'drift-section drift-repository';

    const heading = document.createElement('h2');
    heading.textContent = 'Drift Detection (Optional)';
    section.appendChild(heading);

    const intro = document.createElement('p');
    intro.className = 'drift-intro';
    intro.textContent = 'Upload a code repository to check spec-to-code traceability.';
    section.appendChild(intro);

    if (this.state.repository) {
      // Repository selected
      const repoInfo = document.createElement('div');
      repoInfo.className = 'repository-info';
      repoInfo.innerHTML = `
        <div class="repo-name">📁 ${this.escapeHtml(this.state.repository.name)}</div>
        <div class="repo-count">${this.state.repository.fileCount} code files</div>
      `;
      section.appendChild(repoInfo);

      // Scan button
      const scanBtn = document.createElement('button');
      scanBtn.type = 'button';
      scanBtn.className = 'scan-button';
      scanBtn.disabled = this.state.isScanning;
      scanBtn.textContent = this.state.isScanning ? '⏳ Scanning...' : 'Scan Traceability';
      scanBtn.addEventListener('click', () => this.handleScanTraceability());
      section.appendChild(scanBtn);

      // Clear button
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'clear-repo-button';
      clearBtn.textContent = 'Upload Different Repository';
      clearBtn.addEventListener('click', () => {
        this.state.repository = null;
        this.state.traceabilityReport = null;
        this.render();
      });
      section.appendChild(clearBtn);
    } else {
      // No repository selected - show upload options
      const uploadDiv = document.createElement('div');
      uploadDiv.className = 'repo-upload-controls';

      // Directory upload
      const dirLabel = document.createElement('label');
      dirLabel.className = 'repo-upload-label';
      dirLabel.innerHTML = '📂 <span>Upload Folder</span>';

      const dirInput = document.createElement('input');
      dirInput.type = 'file';
      dirInput.webkitdirectory = true;
      dirInput.style.display = 'none';
      dirInput.addEventListener('change', (e) =>
        this.handleRepositoryUpload(Array.from((e.target as HTMLInputElement).files || []))
      );

      dirLabel.appendChild(dirInput);
      uploadDiv.appendChild(dirLabel);

      // ZIP upload
      const zipLabel = document.createElement('label');
      zipLabel.className = 'repo-upload-label';
      zipLabel.innerHTML = '📦 <span>Upload ZIP</span>';

      const zipInput = document.createElement('input');
      zipInput.type = 'file';
      zipInput.accept = '.zip';
      zipInput.style.display = 'none';
      zipInput.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files?.[0]) {
          this.handleZipUpload(files[0]);
        }
      });

      zipLabel.appendChild(zipInput);
      uploadDiv.appendChild(zipLabel);

      section.appendChild(uploadDiv);

      // Progress/status
      if (this.state.isExtractingRepository) {
        const progress = document.createElement('div');
        progress.className = 'extraction-progress';
        progress.textContent = this.state.extractionProgress || 'Extracting files...';
        section.appendChild(progress);
      }
    }

    // Error display
    if (this.state.error && this.state.isExtractingRepository) {
      const errorBox = document.createElement('div');
      errorBox.className = 'drift-error';
      errorBox.textContent = this.state.error;
      section.appendChild(errorBox);
    }

    return section;
  }

  private createTraceabilityReportSection(report: TraceabilityReport): HTMLElement {
    const section = document.createElement('section');
    section.className = 'drift-section drift-traceability';

    const heading = document.createElement('h2');
    heading.textContent = 'Traceability Report';
    section.appendChild(heading);

    // Disclaimer
    const disclaimer = document.createElement('div');
    disclaimer.className = 'drift-disclaimer';
    disclaimer.innerHTML = `
      <strong>⚠️ Important:</strong> These are traceability signals based on text matching. 
      Findings require human judgment to verify. Not all signals indicate problems.
    `;
    section.appendChild(disclaimer);

    // Signals summary
    const signals = report.signals;
    const specNotImpl = signals.filter((s) => s.kind === 'specified-not-implemented').length;
    const implNotSpec = signals.filter((s) => s.kind === 'implemented-not-specified').length;
    const orphaned = signals.filter((s) => s.kind === 'orphaned-code').length;

    const summary = document.createElement('div');
    summary.className = 'drift-signals-summary';
    summary.innerHTML = `
      <div class="signal-stat">
        <div class="signal-count">${specNotImpl}</div>
        <div class="signal-label">Specified Not Implemented</div>
      </div>
      <div class="signal-stat">
        <div class="signal-count">${implNotSpec}</div>
        <div class="signal-label">Implemented Not Specified</div>
      </div>
      <div class="signal-stat">
        <div class="signal-count">${orphaned}</div>
        <div class="signal-label">Orphaned Code</div>
      </div>
    `;
    section.appendChild(summary);

    // Matrix tab
    const matrixHeading = document.createElement('h3');
    matrixHeading.textContent = 'Requirements-to-Code Matrix';
    section.appendChild(matrixHeading);

    const matrix = document.createElement('div');
    matrix.className = 'drift-matrix';

    report.matrix.forEach((row) => {
      const item = document.createElement('div');
      item.className = 'matrix-row';

      const idEl = document.createElement('div');
      idEl.className = 'matrix-id';
      idEl.textContent = row.requirementId;

      const filesEl = document.createElement('div');
      filesEl.className = 'matrix-files';
      if (row.files.length === 0) {
        filesEl.innerHTML = '<em>No code references</em>';
      } else {
        filesEl.textContent = row.files.join(', ');
      }

      item.appendChild(idEl);
      item.appendChild(filesEl);
      matrix.appendChild(item);
    });
    section.appendChild(matrix);

    // References section
    const refsHeading = document.createElement('h3');
    refsHeading.textContent = 'Detailed References';
    section.appendChild(refsHeading);

    const refs = document.createElement('div');
    refs.className = 'drift-references';

    report.references.forEach((ref) => {
      const item = document.createElement('div');
      item.className = 'reference-item';

      item.innerHTML = `
        <span class="ref-id">${ref.id}</span>
        <span class="ref-file">${this.escapeHtml(ref.filePath)}</span>
        <span class="ref-line">Line ${ref.line}</span>
        <span class="ref-context">${this.escapeHtml(ref.context)}</span>
      `;

      refs.appendChild(item);
    });
    section.appendChild(refs);

    // Signals section
    const signalsHeading = document.createElement('h3');
    signalsHeading.textContent = 'Drift Signals';
    section.appendChild(signalsHeading);

    const signalsList = document.createElement('div');
    signalsList.className = 'drift-signals-list';

    signals.forEach((signal, index) => {
      const signalId = `signal-${index}`;
      const isExpanded = this.state.expandedSignalIds.has(signalId);

      const item = document.createElement('div');
      item.className = `drift-signal-item drift-signal-${signal.kind}`;

      const header = document.createElement('div');
      header.className = 'drift-signal-header';
      header.addEventListener('click', () => {
        if (isExpanded) {
          this.state.expandedSignalIds.delete(signalId);
        } else {
          this.state.expandedSignalIds.add(signalId);
        }
        this.render();
      });

      const kindLabel =
        signal.kind === 'specified-not-implemented'
          ? 'Specified Not Implemented'
          : signal.kind === 'implemented-not-specified'
            ? 'Implemented Not Specified'
            : 'Orphaned Code';

      header.innerHTML = `
        <span class="signal-toggle">${isExpanded ? '▼' : '▶'}</span>
        <span class="signal-kind">${kindLabel}</span>
        ${signal.id ? `<span class="signal-id">${signal.id}</span>` : ''}
        ${signal.filePath ? `<span class="signal-path">${this.escapeHtml(signal.filePath)}</span>` : ''}
      `;

      item.appendChild(header);

      if (isExpanded) {
        const body = document.createElement('div');
        body.className = 'drift-signal-body';

        const detailDiv = document.createElement('div');
        detailDiv.className = 'signal-detail';
        detailDiv.textContent = signal.detail;

        if (signal.line) {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'signal-line';
          lineDiv.textContent = `Line: ${signal.line}`;
          body.appendChild(lineDiv);
        }

        body.appendChild(detailDiv);
        item.appendChild(body);
      }

      signalsList.appendChild(item);
    });
    section.appendChild(signalsList);

    return section;
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private async handleRepositoryUpload(files: File[]): Promise<void> {
    this.state.isExtractingRepository = true;
    this.state.extractionProgress = 'Processing directory...';
    this.render();

    try {
      // Get the root folder name
      const firstFile = files[0];
      const webkitPath = (firstFile as any).webkitRelativePath || '';
      const rootName = webkitPath.split('/')[0] || 'repository';

      // Build file list with content
      const repoFiles = await buildFileList(files);

      this.state.repository = {
        name: rootName,
        fileCount: repoFiles.length,
      };

      this.state.repositoryFiles = repoFiles;
    } catch (err) {
      this.state.error = (err as Error).message;
    } finally {
      this.state.isExtractingRepository = false;
      this.render();
    }
  }

  private async handleZipUpload(file: File): Promise<void> {
    this.state.isExtractingRepository = true;
    this.state.extractionProgress = 'Extracting ZIP file...';
    this.state.error = null;
    this.render();

    try {
      const buffer = await file.arrayBuffer();
      const repoFiles = await extractZip(buffer);

      this.state.repository = {
        name: file.name.replace(/\.zip$/i, ''),
        fileCount: repoFiles.length,
      };

      this.state.repositoryFiles = repoFiles;
    } catch (err) {
      this.state.error = (err as Error).message;
    } finally {
      this.state.isExtractingRepository = false;
      this.state.extractionProgress = '';
      this.render();
    }
  }

  private async handleScanTraceability(): Promise<void> {
    if (!this.state.report) {
      this.state.error = 'No audit report available';
      this.render();
      return;
    }

    if (!this.state.repositoryFiles) {
      this.state.error = 'No repository files loaded. Please upload a repository first.';
      this.render();
      return;
    }

    this.state.isScanning = true;
    this.state.extractionProgress = 'Scanning code for spec references...';
    this.render();

    try {
      // Extract spec IDs from the report files
      const requirementIds: string[] = [];
      const taskIds: string[] = [];

      for (const file of this.state.report.files) {
        if (file.type === 'requirements') {
          const parsed = parseRequirements(file.content);
          requirementIds.push(...parsed.requirements.map((r) => r.id));
        } else if (file.type === 'tasks') {
          const parsed = parseTasks(file.content);
          taskIds.push(...parsed.tasks.map((t) => t.id));
        }
      }

      const report = scanTraceability(
        { requirements: requirementIds, tasks: taskIds },
        this.state.repositoryFiles
      );

      this.state.traceabilityReport = report;
    } catch (err) {
      this.state.error = `Scan error: ${(err as Error).message}`;
    } finally {
      this.state.isScanning = false;
      this.state.extractionProgress = '';
      this.render();
    }
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

export function initializeApp(rootId: string = 'root'): void {
  const app = new SpecDoctorUI(rootId);
  app.render();
}
