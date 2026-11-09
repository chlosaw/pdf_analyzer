import { cn } from '@/lib/utils';
import { MagnifiedWordmark } from './MagnifiedWordmark';

/** The wordmark, led by a magnifying-glass icon that now and then goes off to inspect the letters. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <MagnifiedWordmark
      text="PDF Analyzer"
      className={cn('font-serif font-semibold tracking-tight', size === 'lg' ? 'text-2xl' : 'text-lg', className)}
    />
  );
}
