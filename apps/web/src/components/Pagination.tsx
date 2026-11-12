import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** "Page 2 of 5" with previous/next buttons. Renders nothing when everything fits on one page. */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  label
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** What is being paged, for screen readers, e.g. "Documents" */
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={`${label} pages`} className="flex items-center justify-center gap-3 pt-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft /> Previous
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next <ChevronRight />
      </Button>
    </nav>
  );
}
