import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string) => path.join(import.meta.dirname, '.fixtures', name);

async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();
}

test('upload a PDF, ask a question, and jump to the cited page', async ({ page }) => {
  // The preview server sends the production Content-Security-Policy: nothing the app does may violate it.
  const cspViolations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  const res = await page.goto('/');
  expect(res?.headers()['content-security-policy']).toContain("script-src 'self'");

  await register(page);

  await page.getByTestId('file-input').setInputFiles(fixture('freedonia.pdf'));
  const row = page.getByRole('list', { name: 'Documents' }).getByRole('listitem').first();
  await expect(row.getByText('Ready')).toBeVisible({ timeout: 15_000 });

  await row.getByRole('link', { name: 'freedonia.pdf' }).click();
  await expect(page).toHaveURL(/\/chats\//);
  await expect(page.getByTestId('page-number')).toHaveValue('1');

  await page.getByLabel('Question').fill('What is the capital of Freedonia?');
  await page.keyboard.press('Enter');

  const answer = page.getByTestId('assistant-message').last();
  await expect(answer).toContainText('Fredville');

  // Inline citation chip -> viewer jumps to page 2
  await answer.getByRole('button', { name: 'p.2' }).first().click();
  await expect(page.getByTestId('page-number')).toHaveValue('2');

  // History is saved per document
  await page.reload();
  await expect(page.getByTestId('assistant-message')).toHaveCount(1);
  await expect(page.getByText('What is the capital of Freedonia?')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible(); // the PDF itself rendered (worker allowed)
  expect(cspViolations).toEqual([]);
});

test('rejects a scanned PDF with a clear message', async ({ page }) => {
  await register(page);
  await page.getByTestId('file-input').setInputFiles(fixture('scanned.pdf'));
  await expect(page.getByText(/no text found/i)).toBeVisible();
});
