import type { ContentProvider, GenerationRequest, GenerationResult } from './provider';

/**
 * A scripted provider for tests.
 *
 * The pipeline's guarantees are about what it does with a response, not about
 * the model — so the tests drive it with responses chosen to exercise each
 * gate: valid, malformed, unsafe, injected, and self-approving.
 */
export interface FakeProviderOptions {
  responses: GenerationResult[];
  model?: string;
}

export interface RecordingFakeProvider extends ContentProvider {
  readonly calls: GenerationRequest[];
}

export function createFakeProvider(options: FakeProviderOptions): RecordingFakeProvider {
  const calls: GenerationRequest[] = [];
  let index = 0;

  return {
    name: 'fake',
    model: options.model ?? 'fake-model-1',
    calls,
    async generate(request) {
      calls.push(request);
      const response = options.responses[Math.min(index, options.responses.length - 1)];
      index += 1;
      return response ?? { ok: false, reason: 'provider_error', detail: 'no scripted response' };
    },
  };
}

/** A well-formed reflection payload the pipeline should accept. */
export function validReflectionResponse(): GenerationResult {
  return {
    ok: true,
    model: 'fake-model-1',
    durationMs: 12,
    content: {
      title: 'Một việc con thấy vui',
      instructions: 'Con hãy nghĩ về hôm nay rồi viết câu trả lời nhé.',
      response: {
        mode: 'text',
        fields: [{ id: 'q1', label: 'Câu trả lời của con', minWords: 3, maxWords: 30 }],
      },
      payload: {
        theme: 'gratitude',
        questions: [{ id: 'q1', prompt: 'Hôm nay có điều gì làm con thấy vui?' }],
      },
    },
  };
}
