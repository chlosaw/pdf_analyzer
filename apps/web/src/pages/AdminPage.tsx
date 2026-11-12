import { Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AdminUserDTO, Role } from '@pdf-analyzer/shared';
import { useAdminStats, useAdminUsers, useDeleteUser, useMe, useUpdateUserRole } from '@/api/queries';
import { Pagination } from '@/components/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks';
import { cn, formatBytes, formatDate } from '@/lib/utils';

const PAGE_SIZE = 20;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Administrators only: usage totals and user management. */
export function AdminPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
        <div>
          <h1 className="flex items-center gap-2 text-4xl font-semibold tracking-tight">
            <ShieldCheck className="size-8 text-primary" strokeWidth={1.75} /> Admin
          </h1>
          <p className="mt-2 text-muted-foreground">Usage across the whole app, and the people using it.</p>
        </div>
        <Stats />
        <Users />
      </div>
    </div>
  );
}

function Stats() {
  const stats = useAdminStats();
  if (stats.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load usage: {stats.error.message}
      </p>
    );
  }
  const s = stats.data;
  const tiles: [string, string | undefined][] = [
    ['Accounts', s && String(s.users - s.demoUsers)],
    ['Demo sandboxes', s && String(s.demoUsers)],
    ['Documents', s && String(s.documents)],
    ['Chats', s && String(s.chats)],
    ['Questions, last 7 days', s && String(s.questionsLast7Days)],
    ['Storage', s && formatBytes(s.storageBytes)]
  ];
  return (
    <section aria-label="Usage">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label} className="p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">
              {value ?? <Skeleton className="h-8 w-16" aria-label="Loading" />}
            </dd>
          </Card>
        ))}
      </dl>
    </section>
  );
}

function Users() {
  const { data: me } = useMe();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);

  const users = useAdminUsers({ q, role: role || undefined, includeDemo, page, pageSize: PAGE_SIZE });
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();

  function changeRole(user: AdminUserDTO, next: Role) {
    updateRole.mutate(
      { id: user.id, role: next },
      {
        onSuccess: () => toast.success(`${user.email} is now ${next === 'ADMIN' ? 'an admin' : 'a user'}`),
        onError: (err) => toast.error(`Couldn't change the role: ${err.message}`)
      }
    );
  }

  function remove(user: AdminUserDTO) {
    if (!confirm(`Delete ${user.email} and all their documents and chats? This can't be undone.`)) return;
    deleteUser.mutate(user.id, {
      onSuccess: () => toast.success(`${user.email} deleted`),
      onError: (err) => toast.error(`Couldn't delete: ${err.message}`)
    });
  }

  const resetPage = () => setPage(1);
  if (users.data && page > users.data.totalPages) setPage(users.data.totalPages);

  return (
    <section className="space-y-3" aria-labelledby="users-heading">
      <h2 id="users-heading" className="text-lg font-semibold tracking-tight">
        Users {users.data && <span className="text-muted-foreground">({users.data.total})</span>}
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search users by email or name"
            placeholder="Search by email or name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="bg-background pl-8"
          />
        </div>
        <select
          aria-label="Filter by role"
          className={selectClass}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role | '');
            resetPage();
          }}
        >
          <option value="">All roles</option>
          <option value="ADMIN">Admins</option>
          <option value="USER">Users</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={includeDemo}
            onChange={(e) => {
              setIncludeDemo(e.target.checked);
              resetPage();
            }}
          />
          Include demo sandboxes
        </label>
      </div>

      {users.isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading users">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : users.isError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3"
        >
          <p className="text-sm text-destructive">Couldn't load users: {users.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => users.refetch()}>
            Try again
          </Button>
        </div>
      ) : users.data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No users match.</p>
      ) : (
        <ul className={cn('space-y-2', users.isPlaceholderData && 'opacity-60')} aria-label="Users">
          {users.data.items.map((user) => {
            const isMe = user.id === me?.id;
            return (
              <li key={user.id}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {user.name}
                      {isMe && <Badge variant="secondary">You</Badge>}
                      {user.isDemo && <Badge variant="secondary">Demo</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email} · joined {formatDate(user.createdAt)} · {plural(user.documentCount, 'doc')} ·{' '}
                      {plural(user.chatCount, 'chat')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={`Role for ${user.email}`}
                      className={selectClass}
                      value={user.role}
                      disabled={isMe || user.isDemo}
                      title={isMe ? "You can't change your own role" : undefined}
                      onChange={(e) => changeRole(user, e.target.value as Role)}
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${user.email}`}
                      disabled={isMe}
                      onClick={() => remove(user)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {users.data && <Pagination page={page} totalPages={users.data.totalPages} onPageChange={setPage} label="Users" />}
    </section>
  );
}
