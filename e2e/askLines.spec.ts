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
        input.startsWith('Lines:')
          ? '{"lines":["s:=a+b"]}'
          : input.startsWith('Script:')
            ? "```\nconsole.log('Hello');\n```"
            : '```\nSo $x^2$ it is.\n```',
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
  const words = page.getByLabel('Describe it');
  await expect(words).toBeFocused();
  await page.keyboard.type('add them');
  await page.keyboard.press('Enter');
  const ghost = page.locator('.ask-ghost');
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
  const words = page.getByLabel('Describe it');
  await expect(words).toBeFocused();
  await expect(textarea).toHaveValue('# Notes\n');
  expect((await node.boundingBox())?.y).toBe(top);
  await page.keyboard.type('a square');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ask-ghost')).toHaveText('So $x^2$ it is.');
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
    const latex = await value(page);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByLabel('Describe it')).toBeFocused();
    // The field is the one on the canvas, not a copy: the matrix is still drawn by it, untouched, and the node
    // is exactly the size it was.
    await expect(page.locator('.ask-bubble .katex')).toHaveCount(0);
    expect(await value(page)).toBe(latex);
    expect(await size()).toEqual(before);
    await page.keyboard.type('a very long request, longer than the node is wide, to see it keep its size');
    expect(await size()).toEqual(before);
  });
}

test('Script: asking from a line keeps the line numbers and the node as they were, and the code is only added on Tab', async ({
  page,
}) => {
  await placeNode(page, 'Script');
  const node = nodes(page).first();
  await node.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const box = await node.boundingBox();
  const lines = await node.locator('.cm-lineNumbers .cm-gutterElement').count();
  const source = () => node.locator('.cm-content').innerText();
  const text = await source();
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByLabel('Describe it')).toBeFocused();
  await expect(page.getByPlaceholder('Describe the code')).toBeVisible();
  await expect(node.locator('.cm-gutters')).toBeVisible();
  expect(await node.locator('.cm-lineNumbers .cm-gutterElement').count()).toBe(lines);
  // The editor is the same one, without the `?`.
  expect(await source()).toBe(text);
  expect(await node.boundingBox()).toEqual(box);
  await page.keyboard.type('say hi');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ask-bubble .ask-ghost')).toContainText('Hello');
  expect(await node.boundingBox()).toEqual(box);
  await page.keyboard.press('Tab');
  await expect(node.locator('.cm-content')).toContainText('Hello');
  await expect(node.locator('.cm-content')).toBeFocused();
  expect(await node.locator('.cm-lineNumbers .cm-gutterElement').count()).toBeGreaterThanOrEqual(lines);
});

test('Text: Escape from the words puts the caret back on the line it was on', async ({ page }) => {
  await placeNode(page, 'Text');
  const node = nodes(page).first();
  await node.dblclick();
  const textarea = node.locator('textarea');
  await textarea.fill('top\n\nend');
  await textarea.evaluate((t: HTMLTextAreaElement) => t.setSelectionRange(4, 4));
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByLabel('Describe it')).toBeFocused();
  await expect(textarea).toHaveValue('top\n\nend');
  await page.keyboard.press('Escape');
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe(4);
});
