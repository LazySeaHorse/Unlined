import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

// On-device AI switched on, with a stand-in for Chrome's model that always writes the same row.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('unlined-ai-assist', JSON.stringify({ state: { enabled: true }, version: 0 }));
    const session = () => ({
      clone: async () => session(),
      destroy: () => {},
      prompt: async () => '{"latex":"y=-2x^2"}',
    });
    Object.assign(window, {
      LanguageModel: { availability: async () => 'available', create: async () => session() },
    });
  });
  await openApp(page);
});

test('a graph row typed as ? and words is offered faintly, then accepted as one undo step', async ({
  page,
}) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  await row.locator('math-field').click();
  await expect(row.locator('math-field')).toBeFocused();
  const height = (await row.boundingBox())?.height;
  await page.keyboard.press('Shift+Slash');
  const words = row.getByLabel('Describe it');
  await expect(words).toBeFocused();
  expect((await row.boundingBox())?.height).toBe(height);
  await page.keyboard.type('downward parabola');
  await page.keyboard.press('Enter');
  await expect(row.locator('.ask-ghost .katex')).toBeVisible();
  await expect(nodes(page).locator('.MafsView .ask-ghost path[d]')).toBeAttached();

  await page.keyboard.press('Tab');
  const field = row.locator('math-field');
  await expect(field).toBeFocused();
  await expect.poll(() => field.evaluate((f: HTMLElement & { value: string }) => f.value)).toBe('y=-2x^2');
  await expect(nodes(page).locator('.MafsView .ask-ghost')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => field.evaluate((f: HTMLElement & { value: string }) => f.value)).toBe('');
});

test('Escape goes back to the words, then to the empty row', async ({ page }) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  await row.locator('math-field').click();
  await expect(row.locator('math-field')).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(row.getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('a parabola');
  await page.keyboard.press('Enter');
  await expect(row.locator('.ask-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row.getByLabel('Describe it')).toHaveValue('a parabola');
  await page.keyboard.press('Escape');
  await expect(row.getByLabel('Describe it')).toHaveCount(0);
  await expect(row.locator('math-field')).toBeFocused();
});
