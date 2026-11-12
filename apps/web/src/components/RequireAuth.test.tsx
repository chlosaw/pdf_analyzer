// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { RequireAuth } from './RequireAuth';

describe('RequireAuth', () => {
  afterEach(() => vi.useRealTimers());

  it('explains a slow first load (free hosting waking up) instead of spinning silently', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise(() => {})); // the API is still asleep
    renderWithProviders(
      <RequireAuth>
        <p>secret page</p>
      </RequireAuth>
    );
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText(/Waking up the server/)).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(screen.getByText(/Waking up the server/)).toBeInTheDocument();
    expect(screen.queryByText('secret page')).toBeNull();
  });
});
