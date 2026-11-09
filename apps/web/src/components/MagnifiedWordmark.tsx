import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** How much the lens enlarges what's under it. */
const ZOOM = 1.8;
/** Lens radius, relative to the font size. Must match the lens size and spacer below (0.82em -> 1.64em). */
const RADIUS_EM = 0.82;
/** Time the lens sits still as the logo icon before each tour. */
const REST_AT_HOME_MS = 5000;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The logo: a magnifying glass icon followed by the wordmark. Every few seconds the glass leaves its spot,
 * visits a few random letters (magnifying each one), then glides back and is an icon again.
 *
 * The lens holds a second, scaled-up copy of the whole logo, offset so whatever is under the lens centre
 * appears enlarged, like real glass. At home it sits over the empty space before the text, so it is plain glass.
 * Position updates go straight to the DOM in a requestAnimationFrame loop, so React never re-renders per
 * frame. With reduced motion the glass simply stays an icon.
 */
export function MagnifiedWordmark({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const zoomedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const lens = lensRef.current;
    const zoomed = zoomedRef.current;
    if (!wrap || !lens || !zoomed || reducedMotion()) return;

    // Letter centres (skipping spaces), measured from the per-letter spans, in wrapper coordinates.
    let centres: number[] = [];
    let radius = 0;
    let midY = 0;
    const measure = () => {
      const letters = wrap.querySelectorAll<HTMLElement>('[data-letter]');
      centres = [...letters].filter((l) => l.textContent?.trim()).map((l) => l.offsetLeft + l.offsetWidth / 2);
      radius = parseFloat(getComputedStyle(wrap).fontSize) * RADIUS_EM;
      midY = wrap.offsetHeight / 2;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(wrap);

    const home = () => radius; // the lens's left edge sits at the wrapper's left edge
    let x = home();
    let phase: 'home' | 'tour' | 'return' = 'home';
    let stops: number[] = []; // letter indices still to visit on this tour
    let restUntil = performance.now() + REST_AT_HOME_MS;
    let last = performance.now();
    let frame = 0;

    const startTour = () => {
      const count = 3 + Math.floor(Math.random() * 3); // 3–5 letters
      stops = [];
      while (stops.length < count && centres.length > 0) {
        const next = Math.floor(Math.random() * centres.length);
        if (next !== stops.at(-1)) stops.push(next);
      }
      phase = 'tour';
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (now >= restUntil) {
        if (phase === 'home') startTour();
        const target = phase === 'tour' ? (centres[stops[0]] ?? home()) : home();
        x += (target - x) * (1 - Math.exp(-dt * 3.5)); // ease towards the target
        if (Math.abs(target - x) < 0.5) {
          x = target;
          if (phase === 'return') {
            phase = 'home';
            restUntil = now + REST_AT_HOME_MS;
          } else {
            stops.shift();
            if (stops.length === 0) phase = 'return';
            restUntil = now + 600 + Math.random() * 700; // linger on the letter
          }
        }
      }

      const away = Math.min(Math.abs(x - home()) / (radius * 1.4), 1); // 0 at home, 1 over the text
      const y = midY + Math.sin(now / 650) * 1.5 * away; // a hand-held wobble, only while moving about
      lens.style.transform = `translate(${x - home()}px, ${y - midY}px)`;
      zoomed.style.transform = `translate(${radius - ZOOM * x}px, ${radius - ZOOM * y}px) scale(${ZOOM})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [text]);

  // Room for the glass (1.64em) and its handle before the text.
  const spacer = <span aria-hidden className="inline-block w-[2.2em]" />;

  return (
    <span ref={wrapRef} className={cn('relative inline-block whitespace-nowrap', className)}>
      {spacer}
      {[...text].map((ch, i) => (
        <span key={i} data-letter>
          {ch}
        </span>
      ))}

      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 -mt-[0.82em] size-[1.64em]"
        ref={lensRef}
      >
        <span className="absolute inset-0 overflow-hidden rounded-full bg-card shadow-[0_2px_10px_hsl(var(--foreground)/0.18)] ring-[0.11em] ring-primary">
          <span
            ref={zoomedRef}
            className="absolute left-0 top-0 origin-top-left whitespace-nowrap"
            // The same layout as the base text (spacer + letters), so lens and text coordinates line up.
          >
            {spacer}
            {text}
          </span>
          {/* Glare on the glass */}
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,hsl(0_0%_100%/0.55),transparent_45%)]" />
        </span>
        {/* Handle */}
        <span className="absolute left-[84%] top-[84%] h-[0.24em] w-[0.6em] origin-left rotate-45 rounded-full bg-primary" />
      </span>
    </span>
  );
}
