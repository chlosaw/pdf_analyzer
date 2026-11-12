import { expect, test } from '@playwright/test';

test('only administrators reach the admin page, where they can manage users', async ({ page }) => {
  // A regular user: no Admin link, and the page itself says no
  await page.goto('/register');
  const email = `e2e-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Regular User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your documents' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByText('This page is for administrators only.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // The seeded administrator
  await page.getByLabel('Email').fill('admin@e2e.test');
  await page.getByLabel('Password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  await expect(page.getByText('Questions, last 7 days')).toBeVisible();

  // Find the user (debounced search) and promote them
  await page.getByLabel('Search users by email or name').fill(email);
  const users = page.getByRole('list', { name: 'Users' });
  await expect(users.getByRole('listitem')).toHaveCount(1);
  await users.getByLabel(`Role for ${email}`).selectOption('ADMIN');
  await expect(page.getByText(`${email} is now an admin`)).toBeVisible();

  // Your own row can't be changed or deleted
  await page.getByLabel('Search users by email or name').fill('admin@e2e.test');
  await expect(users.getByLabel('Role for admin@e2e.test')).toBeDisabled();
  await expect(users.getByRole('button', { name: 'Delete admin@e2e.test' })).toBeDisabled();
});
