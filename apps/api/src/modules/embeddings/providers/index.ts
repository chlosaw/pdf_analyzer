import { env } from '../../../lib/env';
import { fakeAi } from './fake';
import { geminiAi } from './gemini';

export type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiProvider {
  embed(texts: string[], task: EmbeddingTask): Promise<number[][]>;
  streamAnswer(input: {
    system: string;
    history: ChatTurn[];
    prompt: string;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

export const ai: AiProvider = env.AI_PROVIDER === 'fake' ? fakeAi : geminiAi;
