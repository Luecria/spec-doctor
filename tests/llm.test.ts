/**
 * Tests for LLM module (T17).
 *
 * Coverage:
 * - Request URL construction (base URL + /chat/completions, or use full URL as-is)
 * - Authorization header with Bearer token
 * - Request body structure (model, messages, temperature)
 * - JSON array parsing (clean, fenced, prose-wrapped)
 * - Malformed output fallback
 * - HTTP errors with status code
 * - Network failures
 * - Timeout handling
 * - Verification that localStorage/sessionStorage are never called
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestLlmReview, parseLlmResponse, LlmSuggestion } from '../src/llm';

describe('LLM Module', () => {
  describe('parseLlmResponse', () => {
    it('should parse clean JSON array', () => {
      const content = JSON.stringify([
        {
          category: 'Contradiction',
          file: 'requirements.md',
          line: 42,
          quote: 'system shall',
          message: 'R1 contradicts R2',
          suggestion: 'Clarify requirements',
        },
      ]);

      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Contradiction');
      expect(result[0].message).toBe('R1 contradicts R2');
    });

    it('should parse JSON wrapped in markdown code fences (with json lang)', () => {
      const content = `Here's the analysis:
\`\`\`json
[
  { "category": "Ambiguity", "message": "R3 is ambiguous" }
]
\`\`\`
See the issues above.`;

      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Ambiguity');
      expect(result[0].message).toBe('R3 is ambiguous');
    });

    it('should parse JSON wrapped in markdown code fences (without lang)', () => {
      const content = `\`\`\`
[
  { "category": "Missing", "message": "No error handling" }
]
\`\`\``;

      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Missing');
    });

    it('should parse JSON with prose before and after', () => {
      const content = `I found several issues in your specs:

[
  { "category": "Coverage", "message": "Task T5 lacks detail" },
  { "category": "Clarity", "message": "Design section is vague" }
]

Please address these concerns.`;

      const result = parseLlmResponse(content);
      expect(result).toHaveLength(2);
      expect(result[0].message).toBe('Task T5 lacks detail');
      expect(result[1].message).toBe('Design section is vague');
    });

    it('should drop invalid items and keep valid ones', () => {
      const content = JSON.stringify([
        { category: 'Valid', message: 'Good point' },
        { category: 'Invalid' }, // No message
        { message: 'Also good' }, // Valid, no category
        'plain string', // Invalid, not object
        { category: 'Another', message: 'Another issue' },
      ]);

      const result = parseLlmResponse(content);
      expect(result).toHaveLength(3);
      expect(result[0].message).toBe('Good point');
      expect(result[1].message).toBe('Also good');
      expect(result[1].category).toBe('Other');
      expect(result[2].message).toBe('Another issue');
    });

    it('should return raw output for empty array', () => {
      const content = '[]';
      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('LLM raw output');
      expect(result[0].message).toBe('[]');
    });

    it('should return raw output for non-array JSON', () => {
      const content = '{ "data": "not an array" }';
      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('LLM raw output');
    });

    it('should return raw output for unparseable JSON', () => {
      const content = '[invalid json}';
      const result = parseLlmResponse(content);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('LLM raw output');
      expect(result[0].message).toContain('invalid json');
    });

    it('should return raw output for empty string', () => {
      const result = parseLlmResponse('');
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('LLM raw output');
      expect(result[0].message).toBe('(empty response)');
    });

    it('should preserve optional fields (file, line, quote, suggestion)', () => {
      const content = JSON.stringify([
        {
          category: 'Detail test',
          file: 'design.md',
          line: 15,
          quote: 'some text',
          message: 'Issue found',
          suggestion: 'Fix it like this',
        },
      ]);

      const result = parseLlmResponse(content);
      expect(result[0].file).toBe('design.md');
      expect(result[0].line).toBe(15);
      expect(result[0].quote).toBe('some text');
      expect(result[0].suggestion).toBe('Fix it like this');
    });
  });

  describe('requestLlmReview', () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let localStorageSetItem: ReturnType<typeof vi.fn>;
    let sessionStorageSetItem: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Create fresh stubs for localStorage and sessionStorage
      localStorageSetItem = vi.fn();
      sessionStorageSetItem = vi.fn();

      // Install localStorage stub globally
      vi.stubGlobal('localStorage', {
        setItem: localStorageSetItem,
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      });

      // Install sessionStorage stub globally
      vi.stubGlobal('sessionStorage', {
        setItem: sessionStorageSetItem,
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      });

      // Mock fetch globally
      mockFetch = vi.fn();
      global.fetch = mockFetch as any;
    });

    afterEach(() => {
      vi.clearAllMocks();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('should construct URL by appending /chat/completions if not present', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1: Test' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toBe('https://api.example.com/chat/completions');
    });

    it('should use full URL as-is if it already ends with /chat/completions', async () => {
      const config = {
        endpoint: 'https://api.example.com/v1/chat/completions',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1: Test' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toBe('https://api.example.com/v1/chat/completions');
    });

    it('should strip trailing slash and append /chat/completions', async () => {
      const config = {
        endpoint: 'https://api.example.com/v1/',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1: Test' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toBe('https://api.example.com/v1/chat/completions');
    });

    it('should include Bearer token in Authorization header', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'secret-key-12345',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1: Test' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer secret-key-12345');
    });

    it('should include model and messages in request body', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4-turbo',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(
        config,
        { requirements: 'R1: Test' },
        'Score: 85/100, 2 findings'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4-turbo');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.temperature).toBe(0.2);
    });

    it('should include spec content in user message', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(
        config,
        {
          requirements: 'R1: Requirement text',
          design: 'Design section text',
          tasks: 'T1: Task text',
        },
        'Summary'
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = body.messages[1].content;

      expect(userMessage).toContain('requirements.md');
      expect(userMessage).toContain('R1: Requirement text');
      expect(userMessage).toContain('design.md');
      expect(userMessage).toContain('Design section text');
      expect(userMessage).toContain('tasks.md');
      expect(userMessage).toContain('T1: Task text');
      expect(userMessage).toContain('Summary');
    });

    it('should handle HTTP errors with status code', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { message: 'Invalid API key' },
        }),
      });

      try {
        await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
          timeoutMs: 5000,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('401');
        expect((err as Error).message).toContain('Invalid API key');
      }
    });

    it('should handle HTTP errors without readable error body', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      try {
        await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
          timeoutMs: 5000,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('500');
      }
    });

    it('should timeout after specified duration', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      // Simulate a hung endpoint: the mock never resolves on its own,
      // but rejects with AbortError when the request's signal aborts
      // (the way a real fetch behaves).
      mockFetch.mockImplementationOnce(
        (_url: string, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      );

      try {
        await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
          timeoutMs: 100,
        });
        expect.fail('Should have thrown timeout error');
      } catch (err) {
        expect((err as Error).message).toContain('timeout');
        expect((err as Error).message).toContain('100ms');
      }
    });

    it('should handle network failures', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockRejectedValueOnce(new Error('Network error: ECONNREFUSED'));

      try {
        await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
          timeoutMs: 5000,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Network error');
      }
    });

    it('should never call localStorage.setItem', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      expect(localStorageSetItem).not.toHaveBeenCalled();
    });

    it('should never call sessionStorage.setItem', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
        timeoutMs: 5000,
      });

      expect(sessionStorageSetItem).not.toHaveBeenCalled();
    });

    it('should truncate spec content exceeding character limit', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      const longContent = 'a'.repeat(5000); // Exceeds 4000 char limit per spec

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { category: 'Test', message: 'Test message' },
                ]),
              },
            },
          ],
        }),
      });

      await requestLlmReview(
        config,
        { requirements: longContent },
        'Score: 85',
        { timeoutMs: 5000 }
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = body.messages[1].content;

      expect(userMessage).toContain('[Note: Spec content truncated to fit token limits]');
      // Verify truncation happened
      expect(userMessage.includes(longContent)).toBe(false);
    });

    it('should throw error if config is invalid', async () => {
      const invalidConfig = {
        endpoint: '',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      try {
        await requestLlmReview(invalidConfig as any, { requirements: 'R1' }, 'Score: 85');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Invalid LLM configuration');
      }
    });

    it('should handle missing choices in response', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      try {
        await requestLlmReview(config, { requirements: 'R1' }, 'Score: 85', {
          timeoutMs: 5000,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Invalid LLM response');
      }
    });

    it('should successfully parse and return LLM suggestions', async () => {
      const config = {
        endpoint: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'gpt-4',
      };

      const suggestions: LlmSuggestion[] = [
        {
          category: 'Contradiction',
          file: 'requirements.md',
          line: 15,
          message: 'R1 and R3 conflict',
          suggestion: 'Clarify the requirements',
        },
        {
          category: 'Missing',
          message: 'Error handling not specified',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(suggestions),
              },
            },
          ],
        }),
      });

      const result = await requestLlmReview(
        config,
        { requirements: 'R1: Test', requirements: 'R3: Conflict' },
        'Score: 75/100',
        { timeoutMs: 5000 }
      );

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('Contradiction');
      expect(result[0].message).toBe('R1 and R3 conflict');
      expect(result[1].category).toBe('Missing');
    });
  });
});
