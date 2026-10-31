import { isTest } from '../../../lib/env';
import type { AiProvider } from './index';
import { EMBEDDING_DIMENSIONS, l2normalize } from '../vector';

/**
 * Offline stand-in for Gemini, used by tests, e2e, the demo seed and for trying the app without an API key.
 * Embeddings are a hashed bag of words, so texts sharing words get similar vectors and retrieval still
 * behaves sensibly. Answers are extractive: the most relevant sentence from each matching source, cited.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'what', 'which', 'who', 'how', 'this', 'that', 'with', 'from', 'does',
  'did', 'about', 'there', 'their', 'they', 'were', 'has', 'have', 'into', 'its', 'our', 'can', 'tell'
]); // prettier-ignore

const words = (text: string) => (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));

function hashEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of words(text)) {
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
    v[(h >>> 0) % EMBEDDING_DIMENSIONS] += 1;
  }
  return l2normalize(v);
}

interface ParsedSource {
  index: number;
  text: string;
}

function parseSources(prompt: string): { sources: ParsedSource[]; question: string } {
  const question = /Question: ([\s\S]*)$/.exec(prompt)?.[1] ?? '';
  const sources = [...prompt.matchAll(/\[(\d+)\] \(.+?, page \d+\)\n([\s\S]*?)(?=\n\n---\n\n)/g)].map((m) => ({
    index: Number(m[1]),
    text: m[2]
  }));
  return { sources, question };
}

// "The main risk" -> "the main risk", but leave names and acronyms ("Maria", "NPS") alone.
const lowerFirst = (s: string) =>
  /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;

function bestSentence(text: string, terms: Set<string>) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 20);
  let best = { sentence: '', hits: 0 };
  for (const sentence of sentences) {
    const hits = words(sentence).filter((w) => terms.has(w)).length;
    if (hits > best.hits) best = { sentence: sentence.trim(), hits };
  }
  return best;
}

export const fakeAi: AiProvider = {
  async embed(texts) {
    return texts.map(hashEmbed);
  },

  async *streamAnswer({ prompt }) {
    const { sources, question } = parseSources(prompt);
    const terms = new Set(words(question));
    const picks = sources
      .map((s) => ({ ...s, ...bestSentence(s.text, terms) }))
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.index - b.index)
      .slice(0, 2);

    const answer = picks.length
      ? picks
          .map(
            (p, i) =>
              `${i === 0 ? 'According to the document, ' : 'It also notes that '}${lowerFirst(p.sentence).replace(/\.?$/, '')} [${p.index}].`
          )
          .join('\n\n')
      : "I couldn't find that in the documents.";
    for (const word of answer.split(/(?<= )/)) {
      if (!isTest) await new Promise((r) => setTimeout(r, 30)); // stream visibly, like a real model
      yield word;
    }
  }
};
