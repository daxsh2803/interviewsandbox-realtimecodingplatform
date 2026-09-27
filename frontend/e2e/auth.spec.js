import { test, expect } from '@playwright/test';

test.describe('Authentication E2E', () => {
  test('user can register, login, survive reload, and logout', async ({ page }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Test User ${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'password123'
    };

    // 1. Register a new unique user
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    
    await page.getByLabel('Name').fill(testUser.name);
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').fill(testUser.password);
    await page.getByRole('button', { name: 'Register' }).click();

    // 2. Login with that user
    // The app redirects to login on successful registration
    await expect(page).toHaveURL(/\/login/);
    
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').fill(testUser.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 3. Verify authenticated dashboard/application state
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Welcome, ${testUser.name}!` })).toBeVisible();

    // 4. Reload the browser page
    await page.reload();

    // 5. Verify the authenticated session survives reload via the HTTP-only cookie
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Welcome, ${testUser.name}!` })).toBeVisible();

    // 6. Logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // 7. Verify the user is returned to an unauthenticated state
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    
    // Attempting to go to a protected route should redirect to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
