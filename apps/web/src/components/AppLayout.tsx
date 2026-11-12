import { LogOut, ShieldCheck } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/api/queries';
import { DemoBanner } from '@/features/auth/DemoBanner';

export function AppLayout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
        <Link to="/" aria-label="PDF Analyzer, home">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">
                <ShieldCheck /> Admin
              </Link>
            </Button>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.name}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      {user?.isDemo && <DemoBanner />}
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
