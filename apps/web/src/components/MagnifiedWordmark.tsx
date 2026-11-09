import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** How much the lens enlarges what's under it. */
const ZOOM = 1.8;
/** Lens radius, relative to the font size. */
const RADIUS_EM = 0.78;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The wordmark with a magnifying glass that wanders from letter to letter. The lens holds a second,
 * scaled-up copy of the text, offset so the letter under the lens centre is what appears enlarged,
 * like real glass. Position updates go straight to the DOM in a requestAnimationFrame loop, so React
 * never re-renders per frame. Hidden when the user prefers reduced motion; screen readers get the plain text.
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

    // Letter centres (skipping spaces), measured from the per-letter spans in the base text.
    let centres: number[] = [];
    let radius = 0;
    let midY = 0;
    const measure = () => {
      const letters = wrap.querySelectorAll<HTMLElement>('[data-letter]');
      centres = [...letters].filter((l) => l.textContent?.trim()).map((l) => l.offsetLeft + l.offsetWidth / 2);
      radius = parseFloat(getComputedStyle(wrap).fontSize) * RADIUS_EM;
      midY = wrap.offsetHeight / 2;
      lens.style.width = lens.style.height = `${radius * 2}px`;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(wrap);

    let x = centres[0] ?? 0;
    let targetIndex = 0;
    let restUntil = performance.now() + 900;
    let last = performance.now();
    let frame = 0;

    const pickNext = () => {
      if (centres.length < 2) return;
      let next = targetIndex;
      while (next === targetIndex) next = Math.floor(Math.random() * centres.length);
      targetIndex = next;
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const target = centres[targetIndex] ?? 0;
      if (now >= restUntil) {
        x += (target - x) * (1 - Math.exp(-dt * 3.5)); // ease towards the letter
        if (Math.abs(target - x) < 0.5) {
          restUntil = now + 700 + Math.random() * 900; // linger, then wander on
          pickNext();
        }
      }
      const y = midY + Math.sin(now / 650) * 1.5; // a slight hand-held wobble
      lens.style.transform = `translate(${x - radius}px, ${y - radius}px)`;
      zoomed.style.transform = `translate(${radius - ZOOM * x}px, ${radius - ZOOM * y}px) scale(${ZOOM})`;
      frame = requestAnimationFrame(tick);
    };
    lens.style.opacity = '1';
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [text]);

  return (
    <span ref={wrapRef} className={cn('relative inline-block whitespace-nowrap', className)}>
      {[...text].map((ch, i) => (
        <span key={i} data-letter>
          {ch}
        </span>
      ))}

      {/* Starts invisible; shown once the animation is running (so never with reduced motion). */}
      <span
        ref={lensRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity"
      >
        <span className="absolute inset-0 overflow-hidden rounded-full bg-card shadow-[0_2px_10px_hsl(var(--foreground)/0.18)] ring-2 ring-primary/80">
          <span ref={zoomedRef} className="absolute left-0 top-0 origin-top-left whitespace-nowrap">
            {text}
          </span>
          {/* Glare on the glass */}
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,hsl(0_0%_100%/0.55),transparent_45%)]" />
        </span>
        {/* Handle */}
        <span className="absolute left-[86%] top-[86%] h-[0.22em] w-[0.75em] origin-left rotate-45 rounded-full bg-primary" />
      </span>
    </span>
  );
}
