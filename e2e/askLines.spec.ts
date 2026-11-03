import { expect, type Page, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

// On-device AI switched on, with a stand-in for Chrome's model: Math+ lines for Math+, a sentence for a note.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('unlined-ai-assist', JSON.stringify({ state: { enabled: true }, version: 0 }));
    const session = () => ({
      clone: async () => session(),
      destroy: () => {},
      prompt: async (input: string) =>
        input.startsWith('Lines:') ? '{"lines":["s:=a+b"]}' : '```\nSo $x^2$ it is.\n```',
    });
    Object.assign(window, {
      LanguageModel: { availability: async () => 'available', create: async () => session() },
    });
  });
  await openApp(page);
});

const value = (page: Page) =>
  nodes(page)
    .locator('math-field')
    .evaluate((f: HTMLElement & { value: string }) => f.value);

test('Math+: ? on an empty line offers lines with their results, accepted in its place', async ({ page }) => {
  await placeNode(page, 'Math+');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  // MathLive reports edits a task later, so keys go at a human pace, each edit saved before the next.
  for (const key of ['a', ':', '=', '2', 'Shift+Enter', 'b', ':', '=', '3', 'Shift+Enter', 'Shift+Slash']) {
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 30)));
  }
  const words = nodes(page).getByLabel('Describe it');
  await expect(words).toBeFocused();
  await page.keyboard.type('add them');
  await page.keyboard.press('Enter');
  const ghost = nodes(page).locator('.ask-ghost');
  await expect(ghost.locator('.katex')).toHaveCount(2);
  await expect(ghost).toContainText('5');

  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await expect.poll(() => value(page)).toBe('\\displaylines{a\\coloneq2\\\\ b\\coloneq3\\\\ s:=a+b}');

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => value(page)).not.toContain('s:=');
});

test('Text: ? on an empty line offers text under the lines above, accepted in its place', async ({
  page,
}) => {
  await placeNode(page, 'Text');
  const node = nodes(page).first();
  await node.dblclick();
  const textarea = node.locator('textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('# Notes\n');
  await page.keyboard.press('ControlOrMeta+End');
  const top = (await node.boundingBox())?.y;
  await page.keyboard.press('Shift+Slash');
  const words = node.getByLabel('Describe it');
  await expect(words).toBeFocused();
  await expect(node).toContainText('# Notes');
  expect((await node.boundingBox())?.y).toBe(top);
  await page.keyboard.type('a square');
  await page.keyboard.press('Enter');
  await expect(node.locator('.ask-ghost')).toHaveText('So $x^2$ it is.');
  await page.keyboard.press('Enter');
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue('# Notes\nSo $x^2$ it is.');
});

for (const tool of ['Math', 'Math+']) {
  test(`${tool}: asking from a line under a matrix keeps the matrix drawn and the node the size it was`, async ({
    page,
  }) => {
    await placeNode(page, tool);
    const node = nodes(page).first();
    const field = node.locator('math-field');
    // Set through the field, as typing a matrix takes a menu, saved as an edit, ending in an empty line with the caret on it.
    await field.evaluate(
      (f: HTMLElement & { setValue: (latex: string) => void; executeCommand: (command: string) => void }) => {
        f.setValue('\\displaylines{\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\\\ }');
        f.dispatchEvent(new Event('input'));
        f.focus();
        f.executeCommand('moveToMathfieldEnd');
      },
    );
    await page.waitForTimeout(300);
    const size = async () => {
      const box = await node.boundingBox();
      return [box?.width, box?.height].map((n) => Math.round(n ?? 0));
    };
    const before = await size();
    await page.keyboard.press('Shift+Slash');
    await expect(node.getByLabel('Describe it')).toBeFocused();
    // The matrix is one typeset line, not rows split into pieces that show as raw LaTeX.
    await expect(node.locator('.ask-slot .katex')).toHaveCount(1);
    await expect(node).not.toContainText('\\begin');
    // A pixel for MathLive and KaTeX setting the same matrix a little apart.
    const asking = await size();
    expect(Math.abs(asking[0] - before[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(asking[1] - before[1])).toBeLessThanOrEqual(2);
    await page.keyboard.type('a very long request, longer than the node is wide, to see it keep its size');
    expect(await size()).toEqual(asking);
  });
}
