/**
 * Tests for drift.ts (T14, T15, T16).
 * Comprehensive test coverage for drift detection logic.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  extractZip,
  buildFileList,
  scanTraceability,
  RepoFile,
  TraceabilityReport,
  DriftSignal,
} from '../src/drift';

describe('Drift Detection', () => {
  describe('extractZip', () => {
    it('should extract files from a ZIP archive', async () => {
      const zip = new JSZip();
      zip.file('file1.ts', 'console.log("test");');
      zip.file('file2.js', 'alert("test");');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('file1.ts');
      expect(files[0].content).toBe('console.log("test");');
      expect(files[1].path).toBe('file2.js');
    });

    it('should skip directories', async () => {
      const zip = new JSZip();
      zip.folder('src');
      zip.file('src/file.ts', 'const x = 1;');
      zip.file('README.md', '# Test');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(2);
      expect(files.every((f) => !f.path.endsWith('/'))).toBe(true);
    });

    it('should skip .git, node_modules, dist, build directories', async () => {
      const zip = new JSZip();
      zip.file('.git/config', 'data');
      zip.file('node_modules/package/index.js', 'data');
      zip.file('dist/bundle.js', 'data');
      zip.file('build/output.js', 'data');
      zip.file('src/app.ts', 'console.log("included");');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/app.ts');
    });

    it('should skip binary files by extension', async () => {
      const zip = new JSZip();
      zip.file('image.png', 'BINARY_DATA');
      zip.file('doc.pdf', 'BINARY_DATA');
      zip.file('code.ts', 'console.log("text");');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('code.ts');
    });

    it('should skip files with null bytes (binary detection)', async () => {
      const zip = new JSZip();
      const binaryContent = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01, 0x02]); // ELF header with null byte
      zip.file('executable', binaryContent);
      zip.file('text.js', 'console.log("test");');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('text.js');
    });

    it('should enforce 50MB size limit', async () => {
      const zip = new JSZip();
      // Create a file that exceeds 50MB
      const largeContent = new Array(51 * 1024 * 1024).fill('x').join('');
      zip.file('large.txt', largeContent);

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(extractZip(buffer)).rejects.toThrow(
        /Repository size exceeds 50MB limit/
      );
    });

    it('should handle nested directory structures', async () => {
      const zip = new JSZip();
      zip.file('src/components/Button.tsx', 'export const Button = () => {};');
      zip.file('src/utils/helper.ts', 'export const helper = () => {};');
      zip.file('tests/button.test.tsx', 'describe("Button", () => {});');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files).toHaveLength(3);
      expect(files.map((f) => f.path)).toContain('src/components/Button.tsx');
      expect(files.map((f) => f.path)).toContain('src/utils/helper.ts');
      expect(files.map((f) => f.path)).toContain('tests/button.test.tsx');
    });

    it('should handle UTF-8 encoded content', async () => {
      const zip = new JSZip();
      zip.file('file.ts', 'const greeting = "こんにちは"; // Japanese');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      expect(files[0].content).toContain('こんにちは');
    });
  });

  describe('buildFileList', () => {
    it('should build a file list from File objects', async () => {
      const file1 = new File(['content1'], 'file1.ts');
      const file2 = new File(['content2'], 'file2.js');

      const files = await buildFileList([file1, file2]);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('file1.ts');
      expect(files[0].size).toBe(8);
      expect(files[1].path).toBe('file2.js');
    });

    it('should skip binary files', async () => {
      const codeFile = new File(['console.log("test");'], 'app.ts');
      const imageFile = new File(['binary'], 'image.png');

      const files = await buildFileList([codeFile, imageFile]);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('app.ts');
    });

    it('should enforce 50MB size limit', async () => {
      const largeFile = new File(
        [new Uint8Array(51 * 1024 * 1024)],
        'large.txt'
      );

      await expect(buildFileList([largeFile])).rejects.toThrow(
        /Repository size exceeds 50MB limit/
      );
    });
  });

  describe('scanTraceability', () => {
    it('should find requirement and task references in code', () => {
      const files: RepoFile[] = [
        {
          path: 'src/app.ts',
          content: 'import R1 from "./feature"; // T2 implementation',
          size: 100,
        },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2'], tasks: ['T1', 'T2'] },
        files
      );

      expect(report.references).toHaveLength(2);
      expect(report.references[0].id).toBe('R1');
      expect(report.references[0].filePath).toBe('src/app.ts');
      expect(report.references[0].line).toBe(1);
      expect(report.references[0].context).toBe('import R1 from "./feature"; // T2 implementation');
      expect(report.references[1].id).toBe('T2');
    });

    it('should record line numbers (1-based) and context', () => {
      const files: RepoFile[] = [
        {
          path: 'src/app.ts',
          content: 'const x = 1;\nconst y = 2;\nconst z = 3; // R5 fix',
          size: 100,
        },
      ];

      const report = scanTraceability(
        { requirements: ['R5'], tasks: [] },
        files
      );

      expect(report.references).toHaveLength(1);
      expect(report.references[0].line).toBe(3);
      expect(report.references[0].context).toBe('const z = 3; // R5 fix');
    });

    it('should detect specified-not-implemented signal', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'console.log("no refs");', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2'], tasks: [] },
        files
      );

      const notImplemented = report.signals.filter(
        (s) => s.kind === 'specified-not-implemented'
      );
      expect(notImplemented).toHaveLength(2);
      expect(notImplemented[0].id).toBe('R1');
      expect(notImplemented[1].id).toBe('R2');
    });

    it('should detect implemented-not-specified signal', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'const x = R1; // T999 hack', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1'], tasks: [] },
        files
      );

      const notSpecified = report.signals.filter(
        (s) => s.kind === 'implemented-not-specified'
      );
      expect(notSpecified).toHaveLength(1);
      expect(notSpecified[0].id).toBe('T999');
    });

    it('should detect orphaned-code signal for files with no spec IDs', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'console.log("orphaned");', size: 100 },
        { path: 'src/feature.ts', content: 'const x = R1;', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1'], tasks: [] },
        files
      );

      const orphaned = report.signals.filter((s) => s.kind === 'orphaned-code');
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].filePath).toBe('src/app.ts');
    });

    it('should NOT flag test files as orphaned-code', () => {
      const files: RepoFile[] = [
        { path: 'src/app.test.ts', content: 'describe("test", () => {});', size: 100 },
        { path: 'tests/helper.ts', content: 'export function setUp() {}', size: 100 },
        { path: 'src/__tests__/utils.ts', content: 'export function test() {}', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: [], tasks: [] },
        files
      );

      const orphaned = report.signals.filter((s) => s.kind === 'orphaned-code');
      expect(orphaned).toHaveLength(0);
    });

    it('should NOT flag allowlisted config files as orphaned-code', () => {
      const files: RepoFile[] = [
        { path: 'package.json', content: '{}', size: 100 },
        { path: 'tsconfig.json', content: '{}', size: 100 },
        { path: 'vite.config.ts', content: 'export default {}', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: [], tasks: [] },
        files
      );

      const orphaned = report.signals.filter((s) => s.kind === 'orphaned-code');
      expect(orphaned).toHaveLength(0);
    });

    it('should generate matrix with requirements and their code files', () => {
      const files: RepoFile[] = [
        { path: 'src/auth.ts', content: 'const x = R1; // R2', size: 100 },
        { path: 'src/api.ts', content: 'const y = R1;', size: 100 },
        { path: 'src/util.ts', content: 'const z = R3;', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2', 'R3'], tasks: [] },
        files
      );

      const matrix = report.matrix;
      expect(matrix).toHaveLength(3);

      const r1 = matrix.find((m) => m.requirementId === 'R1');
      expect(r1?.files).toEqual(['src/api.ts', 'src/auth.ts']); // sorted
      expect(r1?.files).toHaveLength(2);

      const r2 = matrix.find((m) => m.requirementId === 'R2');
      expect(r2?.files).toEqual(['src/auth.ts']);

      const r3 = matrix.find((m) => m.requirementId === 'R3');
      expect(r3?.files).toEqual(['src/util.ts']);
    });

    it('should scan only code files (not markdown, JSON, etc.)', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'R1', size: 100 },
        { path: 'README.md', content: '# R2', size: 100 },
        { path: 'config.json', content: '{"key": "R3"}', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2', 'R3'], tasks: [] },
        files
      );

      expect(report.references).toHaveLength(1);
      expect(report.references[0].id).toBe('R1');
      expect(report.references[0].filePath).toBe('src/app.ts');
    });

    it('should handle multiple IDs on same line', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'const x = R1 + R2 + R3;', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2', 'R3'], tasks: [] },
        files
      );

      expect(report.references).toHaveLength(3);
      expect(report.references.map((r) => r.id)).toEqual(['R1', 'R2', 'R3']);
      expect(report.references.every((r) => r.line === 1)).toBe(true);
    });

    it('should find IDs with word boundaries', () => {
      const files: RepoFile[] = [
        {
          path: 'src/app.ts',
          content: 'const r1 = 1; const R1 = 2; const AR1 = 3;', // only R1 should match
          size: 100,
        },
      ];

      const report = scanTraceability(
        { requirements: ['R1'], tasks: [] },
        files
      );

      expect(report.references).toHaveLength(1);
      expect(report.references[0].context).toContain('const R1 = 2');
    });

    it('should handle mixed requirement and task IDs', () => {
      const files: RepoFile[] = [
        {
          path: 'src/feature.ts',
          content: 'Implementation for R1, R5, T2, and T10',
          size: 100,
        },
      ];

      const report = scanTraceability(
        {
          requirements: ['R1', 'R2', 'R5'],
          tasks: ['T1', 'T2', 'T10'],
        },
        files
      );

      expect(report.references).toHaveLength(4);
      expect(
        report.references.map((r) => r.id).sort()
      ).toEqual(['R1', 'R5', 'T10', 'T2']);
    });

    it('should generate matrix with empty files array for unreferenced specs', () => {
      const files: RepoFile[] = [
        { path: 'src/app.ts', content: 'const x = R1;', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2', 'R3'], tasks: [] },
        files
      );

      const matrix = report.matrix;
      const r2 = matrix.find((m) => m.requirementId === 'R2');
      expect(r2?.files).toEqual([]);

      const r3 = matrix.find((m) => m.requirementId === 'R3');
      expect(r3?.files).toEqual([]);
    });

    it('should handle code files with no references correctly', () => {
      const files: RepoFile[] = [
        { path: 'src/helper.ts', content: 'export function add(a, b) { return a + b; }', size: 100 },
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2'], tasks: [] },
        files
      );

      expect(report.references).toHaveLength(0);
      expect(report.signals).toHaveLength(3); // 2 specified-not-implemented + 1 orphaned-code
    });

    it('should correctly categorize multiple code files (some orphaned, some not)', () => {
      const files: RepoFile[] = [
        { path: 'src/auth.ts', content: '// R1 authentication', size: 100 },
        { path: 'src/database.ts', content: '// no refs here', size: 100 },
        { path: 'src/config.ts', content: '// T5 config', size: 100 },
        { path: 'tests/test.ts', content: '// test file no refs', size: 100 }, // allowlisted
      ];

      const report = scanTraceability(
        { requirements: ['R1', 'R2'], tasks: ['T5'] },
        files
      );

      const orphaned = report.signals.filter((s) => s.kind === 'orphaned-code');
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].filePath).toBe('src/database.ts');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow: extract ZIP, then scan traceability', async () => {
      // Build a test repository in a ZIP
      const zip = new JSZip();
      zip.file('src/auth.ts', '// Implements R1\n// R1 again\nconst auth = R1;');
      zip.file('src/api.ts', '// Implements T5\n// T5 again\nconst api = T5;');
      zip.file('src/unused.ts', '// No spec refs\nconst unused = 1;');
      zip.file('tests/auth.test.ts', '// Test file\ndescribe("auth", () => {});');
      zip.file('package.json', '{}'); // Config file

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const files = await extractZip(buffer);

      // Scan the extracted files
      const report = scanTraceability(
        { requirements: ['R1', 'R2', 'R3'], tasks: ['T5', 'T6'] },
        files
      );

      expect(report.references).toHaveLength(6);
      const referenceIds = report.references.map((r) => r.id).sort();
      expect(referenceIds).toEqual(['R1', 'R1', 'R1', 'T5', 'T5', 'T5']);

      // Verify line numbers for R1 references
      const r1Refs = report.references.filter((r) => r.id === 'R1');
      expect(r1Refs).toHaveLength(3);
      const r1Lines = r1Refs.map((r) => r.line).sort();
      expect(r1Lines).toEqual([1, 2, 3]);

      // Verify line numbers for T5 references
      const t5Refs = report.references.filter((r) => r.id === 'T5');
      expect(t5Refs).toHaveLength(3);
      const t5Lines = t5Refs.map((r) => r.line).sort();
      expect(t5Lines).toEqual([1, 2, 3]);

      const specNotImpl = report.signals.filter(
        (s) => s.kind === 'specified-not-implemented'
      );
      expect(specNotImpl).toHaveLength(3); // R2, R3, T6

      const orphaned = report.signals.filter((s) => s.kind === 'orphaned-code');
      expect(orphaned).toHaveLength(1); // src/unused.ts

      expect(report.matrix).toHaveLength(5);
    });
  });
});
