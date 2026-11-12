import { Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '@/api/queries';

/** After this long, the API is probably waking up from a free-tier sleep. */
const SLOW_START_MS = 4000;

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  if (isPending) {
    return (
      <div className="grid h-screen place-items-center px-6 text-center text-muted-foreground" aria-live="polite">
        <div className="space-y-3">
          <Loader2 className="mx-auto size-6 animate-spin" aria-label="Loading" />
          {slow && (
            <p className="max-w-xs text-sm">
              Waking up the server. The free hosting sleeps when nobody has used it for a while, so the first visit can
              take up to a minute.
            </p>
          )}
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
