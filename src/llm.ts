/**
 * LLM module for Spec Doctor (T17).
 * Provides optional semantic review using OpenAI-compatible endpoints.
 *
 * Security:
 * - API key lives in browser memory only (never persisted or logged)
 * - Fetch called only on explicit user trigger
 * - Data sent only to user-configured endpoint
 * - No network requests on module load or initialization
 */

/**
 * Configuration for LLM semantic review.
 */
export interface LlmConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * Suggestion from LLM semantic review.
 */
export interface LlmSuggestion {
  category: string;
  file?: string;
  line?: number;
  quote?: string;
  message: string;
  suggestion?: string;
}

/**
 * Requests LLM semantic review from an OpenAI-compatible endpoint.
 *
 * @param config LLM configuration (endpoint, API key, model)
 * @param specTexts Raw text content of each spec file
 * @param deterministicSummary One-line summary of deterministic audit (score + finding counts)
 * @param options Optional configuration (timeoutMs for testing)
 * @returns Promise resolving to array of LLM suggestions
 * @throws Error if network fails, timeout, or endpoint error
 */
export async function requestLlmReview(
  config: LlmConfig,
  specTexts: {
    requirements?: string;
    design?: string;
    tasks?: string;
  },
  deterministicSummary: string,
  options: { timeoutMs?: number } = {}
): Promise<LlmSuggestion[]> {
  // Validate configuration
  if (!config.endpoint || !config.apiKey || !config.model) {
    throw new Error('Invalid LLM configuration: endpoint, apiKey, and model are required');
  }

  // Build endpoint URL
  let url = config.endpoint;
  if (!url.endsWith('/chat/completions')) {
    url = url.replace(/\/$/, '') + '/chat/completions';
  }

  // Truncate spec texts to fit within token budget (12000 characters total)
  const maxCharPerSpec = 4000;
  const truncatedSpecs = {
    requirements: specTexts.requirements
      ? specTexts.requirements.substring(0, maxCharPerSpec)
      : undefined,
    design: specTexts.design ? specTexts.design.substring(0, maxCharPerSpec) : undefined,
    tasks: specTexts.tasks ? specTexts.tasks.substring(0, maxCharPerSpec) : undefined,
  };

  // Note if content was truncated
  const truncationNote = [specTexts.requirements, specTexts.design, specTexts.tasks]
    .filter((text) => text && text.length > maxCharPerSpec)
    .length > 0
    ? '\n[Note: Spec content truncated to fit token limits]'
    : '';

  // Build user message
  const userMessage = `Review the following specification files for semantic issues (contradictions between files, ambiguous wording, missing coverage, untestable intent):

${truncatedSpecs.requirements ? `## requirements.md\n${truncatedSpecs.requirements}\n\n` : ''}${truncatedSpecs.design ? `## design.md\n${truncatedSpecs.design}\n\n` : ''}${truncatedSpecs.tasks ? `## tasks.md\n${truncatedSpecs.tasks}\n\n` : ''}**Deterministic audit summary:** ${deterministicSummary}${truncationNote}`;

  // Prepare abort controller for timeout
  const timeoutMs = options.timeoutMs ?? 60000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a specification quality reviewer. Identify semantic issues in spec files (contradictions, ambiguous wording, missing coverage, untestable intent). Return your findings as a JSON array of objects with keys: category (string), file (optional), line (optional), quote (optional), message (string), suggestion (optional). Be concise and actionable.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try to extract error message from response
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = `${errorMessage}: ${errorData.error.message}`;
        }
      } catch {
        // If response is not JSON, use status text
        errorMessage = `${errorMessage}: ${response.statusText}`;
      }
      throw new Error(`LLM endpoint error: ${errorMessage}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid LLM response: no content in message');
    }

    const content = data.choices[0].message.content;
    return parseLlmResponse(content);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error(
          `LLM request timeout after ${timeoutMs}ms. Please try again or increase timeout.`
        );
      }
      throw err;
    }

    throw new Error(`LLM request failed: ${String(err)}`);
  }
}

/**
 * Parses LLM response content to extract suggestions.
 *
 * Tolerates:
 * - Markdown code fences around JSON
 * - Prose before/after JSON
 * - Malformed individual items (dropped)
 * - Completely malformed responses (returns single suggestion with raw content)
 *
 * Never throws. Always returns an array of suggestions.
 *
 * @param content Raw LLM response content
 * @returns Array of parsed suggestions, or single fallback suggestion if parsing fails
 */
export function parseLlmResponse(content: string): LlmSuggestion[] {
  const trimmed = content.trim();

  if (!trimmed) {
    return [
      {
        category: 'LLM raw output',
        message: '(empty response)',
      },
    ];
  }

  // Try to extract JSON array from content
  let jsonStr: string | null = null;

  // First, try to find markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  } else {
    // Try to find raw JSON array
    const arrayMatch = trimmed.match(/\[\s*{[\s\S]*?}\s*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
  }

  if (!jsonStr) {
    // No JSON found, return raw content as fallback
    return [
      {
        category: 'LLM raw output',
        message: trimmed,
      },
    ];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [
        {
          category: 'LLM raw output',
          message: trimmed,
        },
      ];
    }

    // Validate and filter items
    const suggestions: LlmSuggestion[] = [];
    for (const item of parsed) {
      // Item must have at least a message string
      if (typeof item === 'object' && item !== null && typeof item.message === 'string') {
        suggestions.push({
          category: item.category || 'Other',
          file: item.file,
          line: item.line,
          quote: item.quote,
          message: item.message,
          suggestion: item.suggestion,
        });
      }
    }

    // If valid items found, return them
    if (suggestions.length > 0) {
      return suggestions;
    }

    // Array was empty or had no valid items
    return [
      {
        category: 'LLM raw output',
        message: trimmed,
      },
    ];
  } catch {
    // JSON parsing failed, return raw content
    return [
      {
        category: 'LLM raw output',
        message: trimmed,
      },
    ];
  }
}
