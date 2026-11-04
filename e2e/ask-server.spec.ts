import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

// On-device AI switched on with a local server (LM Studio's address) in place of Chrome's model; the server is a
// stand-in that lists one model and always answers with the same row. No `LanguageModel` exists in the page.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'unlined-ai-assist',
      JSON.stringify({
        state: {
          enabled: true,
          provider: 'server',
          server: { url: 'http://localhost:1234/v1', model: 'qwen', key: '' },
        },
        version: 0,
      }),
    );
  });
  await page.route('http://localhost:1234/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = request.url().endsWith('/models')
      ? { data: [{ id: 'qwen' }] }
      : { choices: [{ message: { content: '{"latex":"y=-2x^2"}' } }] };
    return route.fulfill({ json: body, headers: CORS });
  });
  await openApp(page);
});

test('a ? in a graph row is answered by the local server', async ({ page }) => {
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const row = nodes(page).locator('li').nth(1);
  const field = row.locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Slash');
  await expect(row.getByLabel('Describe it')).toBeFocused();
  await page.keyboard.type('downward parabola');
  await page.keyboard.press('Enter');
  await expect(row.getByLabel('Describe it')).toHaveCount(0);
  const value = () => field.evaluate((f: HTMLElement & { value: string }) => f.value);
  await expect.poll(value).toBe('y=-2x^2');
});
