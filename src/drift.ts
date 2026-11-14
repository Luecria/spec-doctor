/**
 * Drift Detection module for Spec Doctor (T13-T16).
 * Pure, testable logic for detecting spec-to-code traceability.
 *
 * Features:
 * - extractZip: Extract ZIP archives in-browser using JSZip
 * - buildFileList: Build file list from directory uploads
 * - scanTraceability: Scan code files for spec ID references
 * - Drift signals: specified-not-implemented, implemented-not-specified, orphaned-code
 */

import JSZip from 'jszip';

/**
 * Represents a file extracted from a repository.
 */
export interface RepoFile {
  path: string;
  content: string;
  size: number;
}

/**
 * Represents a reference to a spec ID in code.
 */
export interface TraceReference {
  id: string;
  filePath: string;
  line: number;
  context: string;
}

/**
 * Represents a drift signal (discrepancy between spec and code).
 */
export interface DriftSignal {
  kind:
    | 'specified-not-implemented'
    | 'implemented-not-specified'
    | 'orphaned-code';
  id?: string;
  filePath?: string;
  line?: number;
  detail: string;
}

/**
 * Represents the complete traceability report.
 */
export interface TraceabilityReport {
  references: TraceReference[];
  signals: DriftSignal[];
  matrix: Array<{
    requirementId: string;
    files: string[];
  }>;
}

/**
 * Binary file extensions to skip during extraction.
 */
const BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.o',
  '.a',
  '.lib',
  '.pyc',
  '.pyo',
  '.class',
  '.jar',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.bz2',
  '.xz',
  '.iso',
  '.img',
  '.dmg',
  '.msi',
  '.pkg',
  '.deb',
  '.rpm',
  '.apk',
  '.app',
  '.elf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.ico',
  '.svg',
  '.webp',
  '.psd',
  '.ai',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.flv',
  '.wav',
  '.flac',
  '.aac',
]);

/**
 * Directories to skip during extraction.
 */
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build']);

/**
 * Maximum total size limit for repositories (50 MB).
 */
const SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Code file extensions to scan for traceability.
 */
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.kts',
  '.scala',
  '.sh',
  '.sql',
  '.vue',
  '.svelte',
]);

/**
 * Paths to allowlist (not flagged as orphaned).
 * Checks for these patterns in the file path.
 */
const ALLOWLIST_PATTERNS = [
  '/test/',
  '/tests/',
  '/__tests__/',
  '.test.',
  '.spec.',
];

/**
 * Filenames to allowlist (not flagged as orphaned).
 */
const ALLOWLIST_FILENAMES = new Set([
  'package.json',
  'tsconfig.json',
  '.gitignore',
  'readme.md',
  'license',
  'vite.config.ts',
  'vite.config.js',
  'webpack.config.js',
  'rollup.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'jest.config.js',
  'babel.config.js',
  '.eslintrc.js',
  '.prettierrc.js',
  'tailwind.config.js',
  'next.config.js',
  'nuxt.config.ts',
]);

/**
 * Extracts files from a ZIP archive in-browser.
 *
 * Skips:
 * - Directories
 * - .git/, node_modules/, dist/, build/ directories
 * - Binary files (by extension or null-byte detection)
 *
 * Enforces a 50MB total size limit.
 *
 * @param data ArrayBuffer containing ZIP data
 * @returns Promise<RepoFile[]> Array of extracted files
 * @throws Error if total size exceeds 50MB or ZIP is malformed
 */
export async function extractZip(data: ArrayBuffer): Promise<RepoFile[]> {
  const zip = new JSZip();
  const loaded = await zip.loadAsync(data);

  const files: RepoFile[] = [];
  let totalSize = 0;

  for (const [filePath, file] of Object.entries(loaded.files)) {
    // Skip directories
    if (file.dir) {
      continue;
    }

    // Skip unwanted directories
    const pathParts = filePath.split('/');
    if (pathParts.some((part) => SKIP_DIRECTORIES.has(part))) {
      continue;
    }

    // Skip binary files by extension
    const extension = getFileExtension(filePath);
    if (BINARY_EXTENSIONS.has(extension.toLowerCase())) {
      continue;
    }

    // Read file content
    const buffer = await file.async('arraybuffer');
    totalSize += buffer.byteLength;

    // Check size limit
    if (totalSize > SIZE_LIMIT_BYTES) {
      throw new Error(
        `Repository size exceeds 50MB limit (total: ${(totalSize / 1024 / 1024).toFixed(1)}MB)`
      );
    }

    // Detect binary files by null-byte check (first 8KB)
    const sampleSize = Math.min(8192, buffer.byteLength);
    const sampleView = new Uint8Array(buffer, 0, sampleSize);
    let isBinary = false;
    for (let i = 0; i < sampleView.length; i++) {
      if (sampleView[i] === 0) {
        isBinary = true;
        break;
      }
    }
    if (isBinary) {
      continue;
    }

    // Decode content as UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const content = decoder.decode(buffer);

    files.push({
      path: filePath,
      content,
      size: buffer.byteLength,
    });
  }

  return files;
}

/**
 * Builds a file list from directory uploads via the File API.
 *
 * Applies the same skips as extractZip (binary files, directories, etc.).
 * Enforces a 50MB total size limit.
 * Reads file content using file.text().
 *
 * @param files Array of File objects (typically from webkitdirectory input)
 * @returns Promise<RepoFile[]> Array of extracted files with content
 * @throws Error if total size exceeds 50MB
 */
export async function buildFileList(files: File[]): Promise<RepoFile[]> {
  const repoFiles: RepoFile[] = [];
  let totalSize = 0;

  for (const file of files) {
    // Get path from webkitRelativePath or fallback to name
    let filePath: string = (file as any).webkitRelativePath || file.name;
    if (!filePath) {
      filePath = file.name;
    }

    // Skip directories
    if (file.type === '') {
      // Treat zero-byte files as potential directories
      if (file.size === 0 && filePath.endsWith('/')) {
        continue;
      }
    }

    // Skip unwanted directories
    const pathParts = filePath.split('/');
    if (pathParts.some((part) => SKIP_DIRECTORIES.has(part))) {
      continue;
    }

    // Skip binary files by extension
    const extension = getFileExtension(filePath);
    if (BINARY_EXTENSIONS.has(extension.toLowerCase())) {
      continue;
    }

    totalSize += file.size;

    // Check size limit
    if (totalSize > SIZE_LIMIT_BYTES) {
      throw new Error(
        `Repository size exceeds 50MB limit (total: ${(totalSize / 1024 / 1024).toFixed(1)}MB)`
      );
    }

    // Read file content
    const content = await file.text();

    // Detect binary files by null-byte check (first 8KB)
    const sampleSize = Math.min(8192, content.length);
    let isBinary = false;
    for (let i = 0; i < sampleSize; i++) {
      if (content.charCodeAt(i) === 0) {
        isBinary = true;
        break;
      }
    }
    if (isBinary) {
      continue;
    }

    repoFiles.push({
      path: filePath,
      content,
      size: file.size,
    });
  }

  return repoFiles;
}

/**
 * Scans code files for requirement and task ID references.
 * Generates a traceability report with references, signals, and matrix.
 *
 * Scans only CODE files (.ts, .js, .py, .java, .go, .rs, .c, .cpp, .h, .cs, .rb, .php, .swift, .kt, .scala, .sh, .sql, .vue, .svelte).
 *
 * Signals generated:
 * - 'specified-not-implemented': Spec ID never referenced in any code file
 * - 'implemented-not-specified': ID found in code but not in spec
 * - 'orphaned-code': Code file with no ID references at all (unless in allowlist; files referencing only non-spec IDs are covered by implemented-not-specified instead)
 *
 * @param specIds Object with arrays of requirement IDs and task IDs from spec
 * @param files Array of RepoFile objects with content
 * @returns TraceabilityReport with references, signals, and matrix
 */
export function scanTraceability(
  specIds: { requirements: string[]; tasks: string[] },
  files: RepoFile[]
): TraceabilityReport {
  const allSpecIds = new Set([...specIds.requirements, ...specIds.tasks]);
  const references: TraceReference[] = [];
  const referencedIds = new Set<string>();
  const filesByRequirement: Map<string, Set<string>> = new Map();

  // Initialize requirement -> files map
  for (const id of allSpecIds) {
    filesByRequirement.set(id, new Set());
  }

  // Scan code files
  for (const file of files) {
    const extension = getFileExtension(file.path);
    if (!CODE_EXTENSIONS.has(extension.toLowerCase())) {
      continue;
    }

    const lines = file.content.split('\n');
    let hasAnySpecId = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1; // 1-based line numbering

      // Find all spec IDs in this line (with word boundaries)
      const matches = line.matchAll(/\b([RT]\d+)\b/g);
      for (const match of matches) {
        const id = match[1];
        const context = line.trim();

        references.push({
          id,
          filePath: file.path,
          line: lineNumber,
          context,
        });

        referencedIds.add(id);
        hasAnySpecId = true;

        // Add to matrix
        if (filesByRequirement.has(id)) {
          filesByRequirement.get(id)!.add(file.path);
        }
      }
    }
  }

  // Generate signals
  const signals: DriftSignal[] = [];

  // 1. Specified-not-implemented: Spec ID not found in any code
  for (const id of allSpecIds) {
    if (!referencedIds.has(id)) {
      signals.push({
        kind: 'specified-not-implemented',
        id,
        detail: `${id} is defined in specification but never referenced in code files`,
      });
    }
  }

  // 2. Implemented-not-specified: ID found in code but not in spec
  for (const id of referencedIds) {
    if (!allSpecIds.has(id)) {
      signals.push({
        kind: 'implemented-not-specified',
        id,
        detail: `${id} is referenced in code but not defined in specification`,
      });
    }
  }

  // 3. Orphaned-code: code file with no ID references at all (unless allowlisted)
  for (const file of files) {
    const extension = getFileExtension(file.path);
    if (!CODE_EXTENSIONS.has(extension.toLowerCase())) {
      continue;
    }

    if (isAllowlisted(file.path)) {
      continue;
    }

    // Check if this file has any spec ID
    const hasSpecId = references.some((ref) => ref.filePath === file.path);
    if (!hasSpecId) {
      signals.push({
        kind: 'orphaned-code',
        filePath: file.path,
        detail: `Code file contains no references to specification IDs (requirements or tasks)`,
      });
    }
  }

  // Build matrix
  const matrix = Array.from(filesByRequirement.entries()).map(([requirementId, files]) => ({
    requirementId,
    files: Array.from(files).sort(),
  }));

  return {
    references,
    signals,
    matrix,
  };
}

/**
 * Gets the file extension (lowercase) with leading dot.
 * @param filePath The file path
 * @returns File extension (e.g., '.ts', '.js') or empty string
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot <= 0) {
    return '';
  }
  return filePath.substring(lastDot);
}

/**
 * Checks if a file path is in the allowlist (not flagged as orphaned).
 * @param filePath The file path to check
 * @returns true if allowlisted, false otherwise
 */
function isAllowlisted(filePath: string): boolean {
  const segments = filePath.toLowerCase().split('/');

  // Check if any segment is a test directory
  if (segments.some((segment) => ['test', 'tests', '__tests__'].includes(segment))) {
    return true;
  }

  // Check filename for test/spec patterns
  const filename = filePath.split('/').pop() || '';
  if (filename.includes('.test.') || filename.includes('.spec.')) {
    return true;
  }

  // Check filename-based allowlists
  if (ALLOWLIST_FILENAMES.has(filename.toLowerCase())) {
    return true;
  }

  return false;
}
