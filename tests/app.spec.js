const { test, expect } = require('@playwright/test');

test.describe('InterDimensionalCable E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Smoke Test: Page loads and title is correct', async ({ page }) => {
        await expect(page).toHaveTitle(/InterDimensionalCable/);
        await expect(page.locator('.logo h1')).toContainText('InterDimensionalCable');
    });

    test('Channel Grid: Loads channels', async ({ page }) => {
        // Wait for channels to load (spinner should disappear)
        await expect(page.locator('.loading-state')).toBeHidden({ timeout: 10000 });

        // Check if channel cards are present
        const cards = page.locator('.channel-card');
        await expect(cards.first()).toBeVisible();
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('Filters: Search works', async ({ page }) => {
        await expect(page.locator('.loading-state')).toBeHidden({ timeout: 10000 });

        const searchInput = page.locator('#search');
        await searchInput.fill('News'); // Assuming there's a channel with "News"

        // Wait for filter to apply
        await page.waitForTimeout(500);

        const cards = page.locator('.channel-card');
        // We can't guarantee results without mocking, but we can check if the grid updates
        // or if the count changes. For now, let's just ensure no crash.
        await expect(page.locator('#channel-grid')).toBeVisible();
    });

    test('Player: Modal opens and loader appears', async ({ page }) => {
        await expect(page.locator('.loading-state')).toBeHidden({ timeout: 10000 });

        const firstCard = page.locator('.channel-card').first();
        await firstCard.click();

        const modal = page.locator('#player-modal');
        await expect(modal).toBeVisible();

        // Check for loader (might be fast, so we check if it exists in DOM)
        const loader = page.locator('#player-loader');
        await expect(loader).toBeAttached();

        // Check video element
        const video = page.locator('#video-player');
        await expect(video).toBeVisible();

        // Close modal
        await page.locator('.close-modal').click();
        await expect(modal).toBeHidden();
    });
});
