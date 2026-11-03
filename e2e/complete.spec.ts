import { expect, type Page, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

// On-device AI switched on, with a stand-in for Chrome's model that streams a continuation for each kind of field,
// in pieces, with more after the line that should never be read. Named by the line each message starts with.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('unlined-ai-assist', JSON.stringify({ state: { enabled: true }, version: 0 }));
    const lines: Record<string, string> = {
      Note: ' there\nnever read',
      Script: 'sort()\nnever read',
      Math: '+1',
      'Math+': '+b',
      Row: '+1',
      Cell: '^2',
      Formula: 'B3)',
    };
    const prompts: string[] = [];
    Object.assign(window, { prompts });
    const session = () => ({
      clone: async () => session(),
      destroy: () => {},
      prompt: async () => '{}',
      promptStreaming: (input: string) => {
        prompts.push(input);
        const reply = lines[input.slice(0, input.indexOf(' up to the cursor'))] ?? '';
        let at = 0;
        return new ReadableStream<string>({
          pull: async (controller) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            if (at >= reply.length) return controller.close();
            controller.enqueue(reply.slice(at, at + 3));
            at += 3;
          },
        });
      },
    });
    Object.assign(window, {
      LanguageModel: { availability: async () => 'available', create: async () => session() },
    });
  });
  await openApp(page);
});

const lastPrompt = (page: Page) =>
  page.evaluate(() => (window as unknown as { prompts: string[] }).prompts.at(-1));

test('Text: Tab offers the rest of the line at the caret, and Tab takes it as one undo step', async ({
  page,
}) => {
  await placeNode(page, 'Text');
  const node = nodes(page).first();
  await node.dblclick();
  const textarea = node.locator('textarea');
  await textarea.fill('# Notes\nHi, said Sam');
  await textarea.evaluate((t: HTMLTextAreaElement) => t.setSelectionRange(11, 11));
  await page.keyboard.press('Tab');
  await expect(node.locator('.complete-copy')).toHaveText('# Notes\nHi, there');
  expect(await lastPrompt(page)).toBe('Note up to the cursor:\n# Notes\nHi,');
  await expect(textarea).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(textarea).toHaveValue('# Notes\nHi, there said Sam');
  await expect(node.locator('.complete-copy')).toHaveCount(0);
  await expect(textarea).toBeFocused();
  expect(await textarea.evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe(17);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(textarea).toHaveValue('# Notes\nHi, said Sam');
});

test('Text: any other key drops the line and types as usual', async ({ page }) => {
  await placeNode(page, 'Text');
  const node = nodes(page).first();
  await node.dblclick();
  const textarea = node.locator('textarea');
  await textarea.fill('Hi,');
  await page.keyboard.press('Tab');
  await expect(node.locator('.complete-copy')).toBeVisible();
  await page.keyboard.type('!');
  await expect(node.locator('.complete-copy')).toHaveCount(0);
  await expect(textarea).toHaveValue('Hi,!');
});

test('Script: Tab offers the rest of the line at the caret, drawn in the editor', async ({ page }) => {
  await placeNode(page, 'Script');
  const node = nodes(page).first();
  const editor = node.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  // The editor closes the bracket itself, after the caret.
  await page.keyboard.type('console.log(nums.');
  await page.keyboard.press('Tab');
  await expect(node.locator('.cm-content .complete-ghost')).toHaveText('sort()');
  expect(await lastPrompt(page)).toBe('Script up to the cursor:\nconsole.log(nums.');

  await page.keyboard.press('Tab');
  await expect(node.locator('.complete-ghost')).toHaveCount(0);
  await expect(editor).toHaveText('console.log(nums.sort())');
  await page.keyboard.type(';');
  await expect(editor).toHaveText('console.log(nums.sort();)');
});
