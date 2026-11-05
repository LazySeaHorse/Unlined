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

test('a graph row typed as ? and words takes the equation as a normal row, in one undo step', async ({
  page,
}) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  const field = row.locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  const box = await nodes(page).first().boundingBox();
  const height = (await row.boundingBox())?.height;
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByLabel('Describe it')).toBeFocused();
  // The bubble is labelled and says what the keys do; nothing in the node moved.
  const bubble = page.getByRole('dialog', { name: 'Ask AI' });
  await expect(bubble).toContainText('Enter');
  await expect(page.getByPlaceholder('Describe the equation')).toBeVisible();
  expect((await row.boundingBox())?.height).toBe(height);
  expect(await nodes(page).first().boundingBox()).toEqual(box);
  await page.keyboard.type('downward parabola');
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Describe it')).toHaveCount(0);
  await expect(field).toBeFocused();
  const value = () => field.evaluate((f: HTMLElement & { value: string }) => f.value);
  await expect.poll(value).toBe('y=-2x^2');

  // It is an ordinary row: typing carries on from the end.
  await page.keyboard.type('+1');
  await expect.poll(value).toBe('y=-2x^2+1');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(value).toBe('');
});

test('Escape leaves the words and goes back to the empty row', async ({ page }) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  await row.locator('math-field').click();
  await expect(row.locator('math-field')).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('a parabola');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Describe it')).toHaveCount(0);
  await expect(row.locator('math-field')).toBeFocused();
});

test('the bubble follows the field on a zoomed-in canvas, and the node is not resized', async ({ page }) => {
  await placeNode(page, 'Math');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
  const node = nodes(page).first();
  const field = node.locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.waitForTimeout(300);
  const box = await node.boundingBox();
  await page.keyboard.press('Shift+Slash');
  const bubble = page.getByRole('dialog', { name: 'Ask AI' });
  await expect(bubble).toBeVisible();
  const at = await bubble.boundingBox();
  const fieldBox = await field.boundingBox();
  // Hanging just under the field, at its left edge, whatever the zoom.
  expect(Math.abs((at?.x ?? 0) - (fieldBox?.x ?? 0))).toBeLessThan(2);
  expect((at?.y ?? 0) - ((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0))).toBeLessThan(16);
  expect(await node.boundingBox()).toEqual(box);
});

test('a press outside the bubble puts it away', async ({ page }) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  const field = row.locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('something');
  await page.mouse.click(1200, 150);
  await expect(page.getByLabel('Describe it')).toHaveCount(0);
});
