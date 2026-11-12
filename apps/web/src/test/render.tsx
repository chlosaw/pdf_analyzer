import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

/** Renders with the app's providers: a fresh query cache (no retries) and an in-memory router. */
export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    )
  };
}

type Handler = (req: {
  method: string;
  path: string;
  body: unknown;
}) => { status?: number; body?: unknown } | undefined;

/**
 * Replaces fetch with a tiny fake API. The handler gets each request and returns { status, body };
 * returning undefined answers 404. Returns the mock, so tests can inspect calls.
 */
export function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const res = handler({ method, path: url.pathname.replace(/^\/api/, '') + url.search, body }) ?? {
      status: 404,
      body: { error: 'Not found' }
    };
    const status = res.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const calls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input).replace(/^\/api/, '')}`);
