import { useId } from 'react';
import { cn } from '@/lib/utils';

/** A wave: one silk sheet between two curves, lit along its top edge and fading out below. */
interface Sheet {
  d: string;
  /** Colour token of the lit edge */
  tone: '--silk-1' | '--silk-2' | '--silk-3';
  /** Opacity at the lit edge */
  strength: number;
  blur?: 'soft' | 'softer';
  /** The top edge, traced again as a thin highlight */
  edge?: string;
}

// Drawn in a 1600×900 box. Sheets flow in from the left, dip, and sweep up to the top right, where a
// second set of folds comes down to meet them: the composition of a draped silk photo.
const LOW_SHEETS: Sheet[] = [
  {
    d: 'M-150 560 C 300 470, 650 700, 1000 560 S 1450 250, 1750 150 L 1750 1000 L -150 1000 Z',
    tone: '--silk-1',
    strength: 0.75,
    edge: 'M-150 560 C 300 470, 650 700, 1000 560 S 1450 250, 1750 150'
  },
  {
    d: 'M-150 630 C 330 520, 690 750, 1040 595 S 1480 290, 1750 215 L 1750 340 C 1480 410, 1190 700, 1000 725 S 330 650, -150 710 Z',
    tone: '--silk-2',
    strength: 0.6,
    edge: 'M-150 630 C 330 520, 690 750, 1040 595 S 1480 290, 1750 215'
  },
  {
    d: 'M-150 765 C 360 650, 770 830, 1090 695 S 1500 425, 1750 380 L 1750 480 C 1500 530, 1260 785, 1060 805 S 400 800, -150 860 Z',
    tone: '--silk-3',
    strength: 0.5,
    edge: 'M-150 765 C 360 650, 770 830, 1090 695 S 1500 425, 1750 380'
  }
];

const CURL_SHEETS: Sheet[] = [
  {
    d: 'M880 1000 C 1060 770, 1250 480, 1750 320 L 1750 560 C 1520 600, 1330 790, 1230 1000 Z',
    tone: '--silk-3',
    strength: 0.7,
    edge: 'M880 1000 C 1060 770, 1250 480, 1750 320'
  },
  {
    d: 'M1130 1000 C 1280 800, 1450 610, 1750 530 L 1750 680 C 1570 710, 1430 850, 1370 1000 Z',
    tone: '--silk-2',
    strength: 0.65,
    blur: 'softer',
    edge: 'M1130 1000 C 1280 800, 1450 610, 1750 530'
  }
];

const HIGH_SHEETS: Sheet[] = [
  {
    // A pale sheet hanging from the top right
    d: 'M620 -60 C 930 110, 1180 250, 1750 190 L 1750 -60 Z',
    tone: '--silk-1',
    strength: 0.6,
    blur: 'softer',
    edge: 'M620 -60 C 930 110, 1180 250, 1750 190'
  },
  {
    // A fold coming down into the curl
    d: 'M1180 -60 C 1340 140, 1460 290, 1750 320 L 1750 -60 Z',
    tone: '--silk-2',
    strength: 0.4,
    edge: 'M1180 -60 C 1340 140, 1460 290, 1750 320'
  }
];

/**
 * Flowing silk-like waves on a pale field (dark navy in dark mode), from the --silk-* colour tokens.
 * Each sheet is lit along one edge and fades out, and thin highlights trace the folds; they stay faint
 * on the left, where page text sits. Purely decorative: hidden from screen readers, never catches clicks,
 * and the slow drift stops for people who prefer reduced motion.
 */
export function SilkBackdrop({
  intensity = 'subtle',
  className
}: {
  intensity?: 'subtle' | 'bold';
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;

  const sheets = (list: Sheet[], group: string) =>
    list.map((s, i) => (
      <g key={`${group}${i}`}>
        <defs>
          {/* Lit along the top edge, fading towards the bottom of the sheet */}
          <linearGradient id={`${id}-${group}${i}`} x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0%" style={{ stopColor: `hsl(var(${s.tone}))`, stopOpacity: s.strength }} />
            <stop offset="55%" style={{ stopColor: `hsl(var(${s.tone}))`, stopOpacity: s.strength * 0.35 }} />
            <stop offset="100%" style={{ stopColor: `hsl(var(${s.tone}))`, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={s.d} fill={ref(`${group}${i}`)} filter={ref(s.blur ?? 'soft')} />
      </g>
    ));

  const edges = (list: Sheet[]) =>
    list
      .filter((s) => s.edge)
      .map((s, i) => <path key={i} d={s.edge} strokeWidth={i === 0 ? 2.2 : 1.4} opacity={1 - i * 0.2} />);

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        intensity === 'bold' ? 'opacity-100' : 'opacity-70',
        className
      )}
    >
      {/* Drawn once; only this wrapper moves, as a GPU transform, so the blur is never re-rendered per frame */}
      <svg
        className="silk-drift absolute inset-0 size-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${id}-base`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'hsl(var(--silk-base-from))' }} />
            <stop offset="100%" style={{ stopColor: 'hsl(var(--silk-base-to))' }} />
          </linearGradient>
          {/* Highlights: invisible on the far left (behind text), brightest where the silk turns */}
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'hsl(var(--silk-sheen))', stopOpacity: 0 }} />
            <stop offset="35%" style={{ stopColor: 'hsl(var(--silk-sheen))', stopOpacity: 0.15 }} />
            <stop offset="65%" style={{ stopColor: 'hsl(var(--silk-sheen))', stopOpacity: 0.85 }} />
            <stop offset="100%" style={{ stopColor: 'hsl(var(--silk-sheen))', stopOpacity: 0.45 }} />
          </linearGradient>
          <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`${id}-softer`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>

        <rect width="1600" height="900" fill={ref('base')} />

        <g>{sheets(HIGH_SHEETS, 'high')}</g>
        <g>{sheets(LOW_SHEETS, 'low')}</g>
        <g>{sheets(CURL_SHEETS, 'curl')}</g>

        <g fill="none" stroke={ref('sheen')} strokeLinecap="round">
          <g>{edges(HIGH_SHEETS)}</g>
          <g>{edges(LOW_SHEETS)}</g>
          <g>{edges(CURL_SHEETS)}</g>
        </g>
      </svg>
    </div>
  );
}
