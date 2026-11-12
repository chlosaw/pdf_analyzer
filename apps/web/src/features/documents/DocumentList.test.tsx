// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentDTO, Page } from '@pdf-analyzer/shared';
import { calls, mockApi, renderWithProviders } from '@/test/render';
import { DocumentList } from './DocumentList';

const doc = (id: string, name: string): DocumentDTO => ({
  id,
  name,
  sizeBytes: 2048,
  pageCount: 3,
  status: 'READY',
  error: null,
  createdAt: '2026-11-01T10:00:00.000Z'
});
const page = (items: DocumentDTO[]): Page<DocumentDTO> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 10,
  totalPages: 1
});
const DOCS = [doc('a', 'Annual report.pdf'), doc('b', 'Handbook.pdf')];

const renderList = () =>
  renderWithProviders(<DocumentList selected={new Set()} onToggle={() => {}} onDeleted={() => {}} />);

describe('DocumentList', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a loading state, then the documents', async () => {
    mockApi(() => ({ body: page(DOCS) }));
    renderList();
    expect(screen.getByLabelText('Loading documents')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Documents' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows an empty state for a new account', async () => {
    mockApi(() => ({ body: page([]) }));
    renderList();
    expect(await screen.findByText(/No documents yet/)).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    let fail = true;
    mockApi(() =>
      fail ? { status: 500, body: { error: 'Something went wrong on our side.' } } : { body: page(DOCS) }
    );
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Documents' })).toBeInTheDocument();
  });

  it('debounces the search: one request after typing stops, not one per key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi(({ path }) => {
      const q = new URLSearchParams(path.split('?')[1]).get('q')?.toLowerCase();
      return { body: page(q ? DOCS.filter((d) => d.name.toLowerCase().includes(q)) : DOCS) };
    });
    renderList();
    await screen.findByRole('list', { name: 'Documents' });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('Search documents by name'), 'hand');
    await act(() => vi.advanceTimersByTimeAsync(350));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    const searches = calls(api).filter((c) => c.includes('q='));
    expect(searches).toEqual(['GET /documents?q=hand&sort=newest&page=1&pageSize=10']);
  });

  it('deletes optimistically, and puts the document back if the server refuses', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let respondToDelete: (ok: boolean) => void = () => {};
    const deleteDone = new Promise<boolean>((r) => (respondToDelete = r));
    mockApi(({ method }) => (method === 'DELETE' ? undefined : { body: page(DOCS) }));
    // The DELETE hangs until we decide how it ends
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        const ok = await deleteDone;
        return new Response(JSON.stringify(ok ? {} : { error: 'Database unavailable' }), { status: ok ? 204 : 500 });
      }
      return realFetch(input, init);
    });

    renderList();
    await screen.findByRole('list', { name: 'Documents' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete Handbook.pdf' }));

    // Gone straight away, before the server has answered
    await waitFor(() => expect(screen.queryByText('Handbook.pdf')).toBeNull());
    respondToDelete(false);
    // ...and restored when it fails
    expect(await screen.findByText('Handbook.pdf')).toBeInTheDocument();
  });
});
