import type { ReactNode } from 'react';
import type { Role } from '@pdf-analyzer/shared';
import { useMe } from '@/api/queries';

/**
 * Hides a page from users without the role (use inside RequireAuth). This is only for a friendly UI:
 * the API enforces the same rule on every request.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { data: user } = useMe();
  if (user?.role !== role) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Not available</h1>
        <p className="mt-2 text-muted-foreground">This page is for administrators only.</p>
      </div>
    );
  }
  return children;
}
