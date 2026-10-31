import { FileSearch, LogOut } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/api/queries';

export function AppLayout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <FileSearch className="size-5" />
          PDF Analyzer
        </Link>
        <div className="flex items-center gap-3">
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
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
