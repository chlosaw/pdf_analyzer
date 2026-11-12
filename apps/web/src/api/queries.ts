import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  AdminStatsDTO,
  AdminUserDTO,
  AdminUserListQuery,
  ChatDTO,
  ChatDetailDTO,
  ChatListQuery,
  CreateChatInput,
  DocumentDTO,
  DocumentListQuery,
  LoginInput,
  Page,
  RegisterInput,
  UserDTO
} from '@pdf-analyzer/shared';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import { api, ApiError } from './client';

export const keys = {
  me: ['me'] as const,
  documents: ['documents'] as const,
  documentList: (query: DocumentListQuery) => ['documents', 'list', query] as const,
  chats: ['chats'] as const,
  chatList: (query: ChatListQuery) => ['chats', 'list', query] as const,
  adminStats: ['admin', 'stats'] as const,
  adminUsers: (query: AdminUserListQuery) => ['admin', 'users', query] as const,
  chat: (id: string) => ['chats', id] as const,
  documentChat: (documentId: string) => ['documents', documentId, 'chat'] as const
};

// ---- auth -------------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<UserDTO>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<UserDTO>('/auth/login', { method: 'POST', json: input }),
    onSuccess: (user) => qc.setQueryData(keys.me, user)
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api<UserDTO>('/auth/register', { method: 'POST', json: input }),
    onSuccess: (user) => qc.setQueryData(keys.me, user)
  });
}

/** "Try the demo": the API creates a throwaway sandbox and signs us into it. */
export function useStartDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<UserDTO>('/auth/demo', { method: 'POST' }),
    onSuccess: (user) => qc.setQueryData(keys.me, user)
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    }
  });
}

// ---- documents ----------------------------------------------------------------

/** `?q=&status=` from the defined, non-empty values */
const toSearch = (query: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
};

export function useDocuments(query: DocumentListQuery = {}) {
  return useQuery({
    queryKey: keys.documentList(query),
    queryFn: () => api<Page<DocumentDTO>>(`/documents${toSearch(query)}`),
    // While typing a search or turning pages, keep showing the last results instead of a skeleton.
    placeholderData: keepPreviousData,
    // Keep polling while something is still being embedded.
    refetchInterval: (q) => (q.state.data?.items.some((d) => d.status === 'PROCESSING') ? POLL_INTERVAL_MS : false)
  });
}

/**
 * Optimistic update for every cached page of a list: apply `change` now, put the old pages back if the
 * server says no, and refetch either way so totals and ordering are right.
 */
function optimisticListUpdate<T extends { id: string }, V>(
  qc: ReturnType<typeof useQueryClient>,
  listKey: QueryKey,
  change: (items: T[], vars: V) => T[]
) {
  return {
    async onMutate(vars: V) {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueriesData<Page<T>>({ queryKey: listKey });
      qc.setQueriesData<Page<T>>({ queryKey: listKey }, (page) => page && { ...page, items: change(page.items, vars) });
      return { previous };
    },
    onError(_err: Error, _vars: V, context?: { previous: [QueryKey, Page<T> | undefined][] }) {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    }
  };
}

export function useRenameDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<DocumentDTO>(`/documents/${id}`, { method: 'PATCH', json: { name } }),
    ...optimisticListUpdate<DocumentDTO, { id: string; name: string }>(qc, ['documents', 'list'], (items, v) =>
      items.map((d) => (d.id === v.id ? { ...d, name: v.name } : d))
    ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.documents });
      qc.invalidateQueries({ queryKey: keys.chats });
    }
  });
}

/** Removed from the list at once; it comes back if the delete fails. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/documents/${id}`, { method: 'DELETE' }),
    ...optimisticListUpdate<DocumentDTO, string>(qc, ['documents', 'list'], (items, id) =>
      items.filter((d) => d.id !== id)
    ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.documents });
      qc.invalidateQueries({ queryKey: keys.chats });
    }
  });
}

/** Get-or-create is idempotent, so a query (deduped, StrictMode-safe) fits better than a mutation. */
export function useDocumentChat(documentId: string) {
  return useQuery({
    queryKey: keys.documentChat(documentId),
    queryFn: () => api<ChatDTO>(`/documents/${documentId}/chat`, { method: 'POST' }),
    retry: false
  });
}

// ---- chats --------------------------------------------------------------------

export function useChats(query: ChatListQuery = {}) {
  return useQuery({
    queryKey: keys.chatList(query),
    queryFn: () => api<Page<ChatDTO>>(`/chats${toSearch(query)}`),
    placeholderData: keepPreviousData
  });
}

export function useRenameChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<ChatDTO>(`/chats/${id}`, { method: 'PATCH', json: { name } }),
    ...optimisticListUpdate<ChatDTO, { id: string; name: string }>(qc, ['chats', 'list'], (items, v) =>
      items.map((c) => (c.id === v.id ? { ...c, title: v.name } : c))
    ),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chats })
  });
}

export function useChat(id: string) {
  return useQuery({
    queryKey: keys.chat(id),
    queryFn: () => api<ChatDetailDTO>(`/chats/${id}`),
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.status === 'PROCESSING') ? POLL_INTERVAL_MS : false),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChatInput) => api<ChatDTO>('/chats', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.chats })
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/chats/${id}`, { method: 'DELETE' }),
    ...optimisticListUpdate<ChatDTO, string>(qc, ['chats', 'list'], (items, id) => items.filter((c) => c.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.chats })
  });
}

export function useClearHistory(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/chats/${chatId}/messages`, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<ChatDetailDTO>(keys.chat(chatId), (old) => old && { ...old, messages: [] })
  });
}

// ---- admin --------------------------------------------------------------------

export function useAdminStats() {
  return useQuery({ queryKey: keys.adminStats, queryFn: () => api<AdminStatsDTO>('/admin/stats') });
}

export function useAdminUsers(query: AdminUserListQuery) {
  return useQuery({
    queryKey: keys.adminUsers(query),
    queryFn: () => api<Page<AdminUserDTO>>(`/admin/users${toSearch(query)}`),
    placeholderData: keepPreviousData
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminUserDTO['role'] }) =>
      api<AdminUserDTO>(`/admin/users/${id}`, { method: 'PATCH', json: { role } }),
    ...optimisticListUpdate<AdminUserDTO, { id: string; role: AdminUserDTO['role'] }>(
      qc,
      ['admin', 'users'],
      (items, v) => items.map((u) => (u.id === v.id ? { ...u, role: v.role } : u))
    ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] })
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    ...optimisticListUpdate<AdminUserDTO, string>(qc, ['admin', 'users'], (items, id) =>
      items.filter((u) => u.id !== id)
    ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin'] })
  });
}
