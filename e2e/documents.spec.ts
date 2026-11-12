import { expect, test } from '@playwright/test';

test('search, rename and delete documents', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /try the demo/i }).click();
  const docs = page.getByRole('list', { name: 'Documents' });
  await expect(docs.getByRole('listitem')).toHaveCount(2);

  // Debounced search: one request after typing stops, not one per keystroke
  const searches: string[] = [];
  page.on('request', (r) => r.url().includes('/api/documents?') && searches.push(new URL(r.url()).search));
  await page.getByLabel('Search documents by name').pressSequentially('handbook', { delay: 40 });
  await expect(docs.getByRole('listitem')).toHaveCount(1);
  await expect(docs).toContainText('Employee Handbook');
  expect(searches.filter((s) => s.includes('q=')).map((s) => new URLSearchParams(s).get('q'))).toEqual(['handbook']);

  // No matches -> empty state with a way out
  await page.getByLabel('Search documents by name').fill('zzz');
  await expect(page.getByText(/No documents match/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(docs.getByRole('listitem')).toHaveCount(2);

  // Rename inline (Enter saves)
  await page.getByRole('button', { name: /Rename Northwind Employee Handbook/ }).click();
  await page.getByLabel(/New name for/).fill('Staff handbook.pdf');
  await page.keyboard.press('Enter');
  await expect(docs.getByRole('link', { name: 'Staff handbook.pdf' })).toBeVisible();
  await page.reload();
  await expect(docs.getByRole('link', { name: 'Staff handbook.pdf' })).toBeVisible();

  // Delete: gone from the list straight away
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete Staff handbook.pdf' }).click();
  await expect(docs.getByRole('listitem')).toHaveCount(1);
});
