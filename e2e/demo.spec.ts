import { expect, test } from '@playwright/test';

test('"Try the demo" opens a sandbox with sample PDFs that answer questions', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /try the demo/i }).click();

  await expect(page.getByText(/you're in a demo sandbox/i)).toBeVisible();
  const docs = page.getByRole('list', { name: 'Documents' });
  await expect(docs.getByText('Ready')).toHaveCount(2);

  await docs
    .getByRole('link', { name: /Annual Report 2025/ })
    .first()
    .click();
  await page.getByLabel('Question').fill('Who is the chief executive?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('assistant-message').last()).toContainText('Maria Lindqvist');
});
