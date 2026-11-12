// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { calls, mockApi, renderWithProviders } from '@/test/render';
import { RegisterPage } from './RegisterPage';

const signedOut = { status: 401, body: { error: 'Not signed in' } };

describe('RegisterPage (form validation)', () => {
  it('shows a clear error under each invalid field, without calling the API', async () => {
    const api = mockApi(({ path }) => (path === '/auth/me' ? signedOut : undefined));
    renderWithProviders(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Password must be at least 8 characters');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(calls(api)).not.toContain('POST /auth/register');
  });

  it('sends valid input and shows the server error if it is refused', async () => {
    const api = mockApi(({ method, path }) => {
      if (path === '/auth/me') return signedOut;
      if (method === 'POST' && path === '/auth/register') {
        return { status: 409, body: { error: 'An account with this email already exists', code: 'EMAIL_TAKEN' } };
      }
    });
    renderWithProviders(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ADA@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists');
    const register = api.mock.calls.find(
      ([url, init]) => String(url).endsWith('/auth/register') && init?.method === 'POST'
    );
    // Normalised by the same schema the server uses
    expect(JSON.parse(String(register?.[1]?.body))).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse'
    });
  });
});
