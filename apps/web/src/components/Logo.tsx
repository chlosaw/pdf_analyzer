import { cn } from '@/lib/utils';

/** A question mark in New York italic on an ink tile, next to the wordmark. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-[28%] bg-primary font-serif italic text-primary-foreground shadow-sm',
          size === 'lg' ? 'size-10 text-2xl' : 'size-8 text-xl'
        )}
      >
        ?
      </span>
      <span className={cn('font-serif font-semibold tracking-tight', size === 'lg' ? 'text-2xl' : 'text-lg')}>
        PDF Analyzer
      </span>
    </span>
  );
}
