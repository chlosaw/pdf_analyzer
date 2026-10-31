import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatDTO,
  ChatDetailDTO,
  CreateChatInput,
  DocumentDTO,
  LoginInput,
  RegisterInput,
  UserDTO
} from '@pdf-analyzer/shared';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import { api, ApiError } from './client';

export const keys = {
  me: ['me'] as const,
  documents: ['documents'] as const,
  chats: ['chats'] as const,
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

export function useDocuments() {
  return useQuery({
    queryKey: keys.documents,
    queryFn: () => api<DocumentDTO[]>('/documents'),
    // Keep polling while something is still being embedded.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'PROCESSING') ? POLL_INTERVAL_MS : false)
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
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

export function useChats() {
  return useQuery({ queryKey: keys.chats, queryFn: () => api<ChatDTO[]>('/chats') });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.chats })
  });
}

export function useClearHistory(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/chats/${chatId}/messages`, { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<ChatDetailDTO>(keys.chat(chatId), (old) => old && { ...old, messages: [] })
  });
}
