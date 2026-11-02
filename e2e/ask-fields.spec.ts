import { expect, type Locator, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

// On-device AI switched on, with a stand-in for Chrome's model: a reasoned, fenced reply for a Math node, and a
// cell as JSON for a table.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('unlined-ai-assist', JSON.stringify({ state: { enabled: true }, version: 0 }));
    const session = () => ({
      clone: async () => session(),
      destroy: () => {},
      prompt: async (input: string) =>
        input.startsWith('Math:')
          ? 'By parts, twice.\n```\n\\frac{e^x(\\sin x-\\cos x)}{2}+C\n```'
          : '{"latex":"\\\\frac{1}{2}"}',
    });
    Object.assign(window, {
      LanguageModel: { availability: async () => 'available', create: async () => session() },
    });
  });
  await openApp(page);
});

const value = (field: Locator) => field.evaluate((f: HTMLElement & { value: string }) => f.value);

test('a Math node typed as ? and words takes the worked answer as one undo step', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(nodes(page).getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('integrate e^x sin x');
  await page.keyboard.press('Enter');
  await expect(nodes(page).locator('.ask-ghost .katex')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await expect.poll(() => value(field)).toBe('\\frac{e^x(\\sin x-\\cos x)}{2}+C');

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => value(field)).toBe('');
});

test('a table cell typed as ? and words takes the answer, and only that cell', async ({ page }) => {
  await placeNode(page, 'Table');
  const fields = nodes(page).locator('math-field');
  await fields.nth(4).click();
  await expect(fields.nth(4)).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(nodes(page).getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('a half');
  await page.keyboard.press('Enter');
  await expect(nodes(page).locator('.ask-ghost .katex')).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(fields.nth(4)).toBeFocused();
  await expect.poll(() => value(fields.nth(4))).toBe('\\frac{1}{2}');
  expect(await Promise.all([0, 1, 2, 3, 5, 6, 7, 8].map((i) => value(fields.nth(i))))).toEqual(
    Array(8).fill(''),
  );
});
