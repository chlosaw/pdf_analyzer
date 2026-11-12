import { cn } from '@/lib/utils';

/**
 * A soft, slowly drifting gradient in the app's palette (ink blue, gold, clay), drawn from the
 * --glow-* colour tokens so it adapts to light and dark mode. Purely decorative: hidden from screen
 * readers, never catches clicks, and holds still for people who prefer reduced motion.
 */
export function GradientBackdrop({
  intensity = 'subtle',
  className
}: {
  intensity?: 'subtle' | 'bold';
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        intensity === 'bold' ? 'opacity-100' : 'opacity-60',
        className
      )}
    >
      <div className="gradient-backdrop absolute -inset-[20%]" />
    </div>
  );
}
