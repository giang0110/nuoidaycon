import Anthropic from '@anthropic-ai/sdk';
import type { ContentProvider, GenerationRequest, GenerationResult } from './provider';

/**
 * Anthropic adapter — the only file in the product that imports an LLM SDK.
 *
 * Structured output only: the response is constrained to the payload schema, so
 * free-form prose is rejected before it reaches the parser (AI_CONTENT_RULES.md
 * stage 4). Nothing here trusts the result — stages 5 and 6 re-validate it.
 */
const MODEL = 'claude-opus-5';

export function createAnthropicProvider(apiKey?: string): ContentProvider {
  // Zero-arg construction resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or a
  // stored profile; an explicit key is only used when one is injected.
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  return {
    name: 'anthropic',
    model: MODEL,

    async generate(request: GenerationRequest): Promise<GenerationResult> {
      const startedAt = Date.now();

      const userContent = request.untrustedNote
        ? `${request.userPrompt}\n\n${request.untrustedNote}`
        : request.userPrompt;

      try {
        const response = await client.messages.create(
          {
            model: MODEL,
            max_tokens: request.maxTokens,
            system: request.systemPrompt,
            messages: [{ role: 'user', content: userContent }],
            output_config: {
              effort: 'high',
              format: { type: 'json_schema', schema: request.outputSchema },
            },
          } as Anthropic.MessageCreateParamsNonStreaming,
          { timeout: request.timeoutMs },
        );

        // Safety classifiers can decline; check before reading content.
        if (response.stop_reason === 'refusal') {
          return {
            ok: false,
            reason: 'refusal',
            detail: response.stop_details?.explanation ?? 'refused',
          };
        }

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        if (!text.trim()) {
          return { ok: false, reason: 'unparseable', detail: 'empty response' };
        }

        try {
          return {
            ok: true,
            content: JSON.parse(text),
            model: MODEL,
            durationMs: Date.now() - startedAt,
          };
        } catch {
          return { ok: false, reason: 'unparseable', detail: 'response was not JSON' };
        }
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          return { ok: false, reason: 'timeout', detail: 'provider timed out' };
        }
        if (error instanceof Anthropic.APIError) {
          return { ok: false, reason: 'provider_error', detail: `API error ${error.status}` };
        }
        return { ok: false, reason: 'provider_error', detail: 'unknown provider failure' };
      }
    },
  };
}
