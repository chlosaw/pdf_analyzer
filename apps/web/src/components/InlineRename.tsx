import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * A text field that replaces a name while it is being edited. Enter or leaving the field saves,
 * Escape cancels. Unchanged or empty names are not saved.
 */
export function InlineRename({
  value,
  label,
  onSave,
  onDone
}: {
  value: string;
  /** Accessible label, e.g. "New name for report.pdf" */
  label: string;
  onSave: (name: string) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(value);
  // Escape unmounts the field, and some browsers fire blur on the way out: don't let that save.
  const cancelled = useRef(false);

  function commit() {
    if (cancelled.current) return;
    const name = draft.trim();
    if (name && name !== value) onSave(name);
    onDone();
  }

  return (
    <Input
      autoFocus
      aria-label={label}
      value={draft}
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          onDone();
        }
      }}
      className="h-8"
    />
  );
}
