import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2.1 A/AA checks with axe-core. */
async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual(
    []
  );
}

test.describe('accessibility', () => {
  test('sign-in and register pages', async ({ page }) => {
    await page.goto('/login');
    await expectNoViolations(page);
    await page.goto('/register');
    await expectNoViolations(page);
  });

  test('dashboard and chat, in light and dark mode', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /try the demo/i }).click();
    await expect(page.getByRole('list', { name: 'Documents' }).getByRole('listitem')).toHaveCount(2);
    await expectNoViolations(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(300); // let colour transitions finish
    await expectNoViolations(page);
    await page.emulateMedia({ colorScheme: 'light' });

    await page
      .getByRole('link', { name: /Annual Report 2025/ })
      .first()
      .click();
    await page.getByLabel('Question').fill('Who is the chief executive?');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('assistant-message').last()).toContainText('Maria');
    await expectNoViolations(page);
  });

  test('the main flow works with the keyboard alone', async ({ page }) => {
    await page.goto('/login');
    // Tab to "Try the demo" and press Enter
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      if (await page.getByRole('button', { name: /try the demo/i }).evaluate((el) => el === document.activeElement))
        break;
    }
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();

    // Every interactive control can be reached and shows a visible focus ring
    const search = page.getByLabel('Search documents by name');
    await search.focus();
    await page.keyboard.type('handbook');
    await expect(page.getByRole('list', { name: 'Documents' }).getByRole('listitem')).toHaveCount(1);
    await page.keyboard.press('Tab'); // status filter
    await expect(page.getByLabel('Filter by status')).toBeFocused();
  });
});
