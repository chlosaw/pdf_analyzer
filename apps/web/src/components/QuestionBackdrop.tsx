import { cn } from '@/lib/utils';

interface Phrase {
  text: string;
  lang: string;
  /** A typeface that ships with macOS; browsers elsewhere fall back to their system font. */
  font: string;
  italic?: boolean;
  rtl?: boolean;
}

/** "I have a question", in the languages people might ask their PDFs in. */
const PHRASES: Phrase[] = [
  { text: 'I have a question', lang: 'en', font: 'ui-serif, "New York", Georgia, serif', italic: true },
  { text: 'У мене є питання', lang: 'uk', font: 'ui-serif, "New York", Georgia, serif' },
  { text: 'Tengo una pregunta', lang: 'es', font: '"Avenir Next", Avenir, sans-serif' },
  { text: 'J’ai une question', lang: 'fr', font: 'Didot, "Bodoni 72", serif', italic: true },
  { text: '質問があります', lang: 'ja', font: '"Hiragino Mincho ProN", "Hiragino Mincho Pro", serif' },
  { text: 'Ich habe eine Frage', lang: 'de', font: 'Futura, "Century Gothic", sans-serif' },
  { text: 'Ho una domanda', lang: 'it', font: 'Baskerville, "Baskerville Old Face", serif', italic: true },
  { text: 'لدي سؤال', lang: 'ar', font: '"Geeza Pro", "Al Nile", sans-serif', rtl: true },
  { text: 'Tenho uma pergunta', lang: 'pt', font: '"Gill Sans", "Gill Sans MT", sans-serif' },
  { text: '我有一个问题', lang: 'zh', font: '"Songti SC", "STSong", serif' },
  { text: 'Mam pytanie', lang: 'pl', font: '"American Typewriter", "Courier New", monospace' },
  { text: '질문이 있어요', lang: 'ko', font: '"Apple SD Gothic Neo", "AppleGothic", sans-serif' },
  { text: 'Ik heb een vraag', lang: 'nl', font: 'Optima, Candara, sans-serif' },
  { text: 'मेरा एक सवाल है', lang: 'hi', font: '"Kohinoor Devanagari", "Devanagari Sangam MN", sans-serif' },
  { text: 'Jag har en fråga', lang: 'sv', font: '"Avenir Next Condensed", "Avenir Next", sans-serif' },
  { text: 'Έχω μια ερώτηση', lang: 'el', font: '"Helvetica Neue", Helvetica, sans-serif' },
  { text: 'Bir sorum var', lang: 'tr', font: 'ui-rounded, "SF Pro Rounded", sans-serif' },
  { text: 'יש לי שאלה', lang: 'he', font: '"New Peninim MT", "Arial Hebrew", serif', rtl: true },
  { text: 'Mám otázku', lang: 'cs', font: 'Charter, "Bitstream Charter", serif' },
  { text: 'ฉันมีคำถาม', lang: 'th', font: 'Thonburi, "Ayuthaya", sans-serif' },
  { text: 'Minulla on kysymys', lang: 'fi', font: '"Avenir Next", Avenir, sans-serif', italic: true },
  { text: 'Tôi có một câu hỏi', lang: 'vi', font: 'Palatino, "Palatino Linotype", serif' },
  { text: 'Nina swali', lang: 'sw', font: '"Chalkboard SE", "Comic Sans MS", sans-serif' },
  { text: 'Saya punya pertanyaan', lang: 'id', font: '"Gill Sans", "Gill Sans MT", sans-serif', italic: true },
  { text: 'მაქვს კითხვა', lang: 'ka', font: '-apple-system, system-ui, sans-serif' },
  { text: 'Habeo quaestionem', lang: 'la', font: '"Hoefler Text", Garamond, serif', italic: true }
];

const COLUMNS = 4;
const ROWS = Math.ceil(PHRASES.length / COLUMNS);

/** Small deterministic PRNG so the layout is the same on every render (and in screenshots). */
function random(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Decorative wall of "I have a question" in many languages and typefaces. Each phrase sits in its own
 * grid cell with a little jitter and tilt, so nothing overlaps. Purely visual: hidden from screen readers
 * and never catches clicks.
 */
export function QuestionBackdrop({
  intensity = 'subtle',
  className
}: {
  intensity?: 'subtle' | 'bold';
  className?: string;
}) {
  const [minOpacity, maxOpacity] = intensity === 'bold' ? [0.1, 0.22] : [0.05, 0.11];

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}>
      {PHRASES.map((p, i) => {
        const col = i % COLUMNS;
        const row = Math.floor(i / COLUMNS);
        // Offset every other row so the wall reads as scattered rather than tabular.
        const left = ((col + (row % 2 ? 0.5 : 0.1) + random(i) * 0.3) / COLUMNS) * 100;
        const top = ((row + 0.2 + random(i + 100) * 0.5) / ROWS) * 100;
        const size = 1.1 + random(i + 200) * 1.9; // rem
        const rotate = (random(i + 300) - 0.5) * 14; // degrees
        const opacity = minOpacity + random(i + 400) * (maxOpacity - minOpacity);

        return (
          <span
            key={p.lang}
            lang={p.lang}
            dir={p.rtl ? 'rtl' : 'ltr'}
            // Phones get every other phrase at 55% size, so the wall stays airy on a narrow screen.
            className={cn(
              'absolute whitespace-nowrap leading-none [font-size:calc(var(--size)*0.55)] md:[font-size:var(--size)]',
              i % 2 === 1 && 'hidden md:block'
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) rotate(${rotate.toFixed(1)}deg)`,
              fontFamily: p.font,
              fontStyle: p.italic ? 'italic' : 'normal',
              ['--size' as string]: `${size.toFixed(2)}rem`,
              color: `hsl(var(--backdrop-ink) / ${opacity.toFixed(3)})`
            }}
          >
            {p.text}
          </span>
        );
      })}
    </div>
  );
}
