import { DEMO_SANDBOX_HOURS } from '@pdf-analyzer/shared';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '@/api/queries';

/** Shown to "Try the demo" visitors: their sandbox is temporary. */
export function DemoBanner() {
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="shrink-0 border-b bg-highlight/15 px-4 py-2 text-center text-sm">
      You're in a demo sandbox. It and everything you upload are deleted after {DEMO_SANDBOX_HOURS} hours.{' '}
      <button
        type="button"
        className="font-medium underline underline-offset-4"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/register') })}
      >
        Create an account
      </button>{' '}
      to keep your documents.
    </div>
  );
}
