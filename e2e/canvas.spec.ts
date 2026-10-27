import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test('starts with an empty untitled canvas', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Untitled canvas/ })).toBeVisible();
  await expect(nodes(page)).toHaveCount(0);
});

test('places, edits and persists a text node', async ({ page }) => {
  await placeNode(page, 'Text');
  await expect(nodes(page)).toHaveCount(1);
  await nodes(page).locator('.prose').dblclick();
  const editor = nodes(page).locator('textarea');
  await editor.fill('# Hello\n\nSome **bold** text and $x^2$');
  await editor.press('Escape');
  await expect(nodes(page).locator('h1')).toHaveText('Hello');
  await expect(nodes(page).locator('.katex')).toBeVisible();

  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(nodes(page).locator('h1')).toHaveText('Hello');
});

test('undo, redo, duplicate and delete', async ({ page }) => {
  await placeNode(page, 'Text');
  await expect(nodes(page)).toHaveCount(1);
  await page.mouse.click(1000, 700); // click empty canvas: keyboard focus back to the page
  await page.keyboard.press('ControlOrMeta+z');
  await expect(nodes(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(nodes(page)).toHaveCount(1);

  await nodes(page).first().click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes(page)).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(1);
});

test('marquee selection and drag', async ({ page }) => {
  await placeNode(page, 'Text', 400, 300);
  await placeNode(page, 'Text', 400, 600);
  await page.mouse.click(1200, 800);
  await page.mouse.move(300, 200);
  await page.mouse.down();
  await page.mouse.move(1000, 850, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);

  const before = await nodes(page).first().boundingBox();
  const header = nodes(page).first().locator('.prose');
  const box = await header.boundingBox();
  if (!before || !box) throw new Error('missing node box');
  await page.mouse.move(box.x + 10, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 55, { steps: 50 });
  await page.mouse.up();
  const after = await nodes(page).first().boundingBox();
  // React Flow's drag threshold swallows the first mouse step.
  expect(after?.x).toBeGreaterThan(before.x + 95);
});

test('math node accepts input', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await expect(field).toBeVisible();
  await field.click();
  await expect(field).toBeFocused(); // MathLive focuses shortly after the click
  await page.keyboard.type('x^2', { delay: 30 });
  await expect.poll(() => field.evaluate((el) => (el as HTMLInputElement).value)).toContain('x^2');
});

test('math+ nodes share variables', async ({ page }) => {
  await placeNode(page, 'Math+', 500, 250);
  await nodes(page).locator('math-field').click();
  await expect(nodes(page).locator('math-field')).toBeFocused();
  await page.keyboard.type('a:=5', { delay: 30 });
  await page.mouse.click(1200, 850);
  await placeNode(page, 'Math+', 500, 500);
  await nodes(page).nth(1).locator('math-field').click();
  await expect(nodes(page).nth(1).locator('math-field')).toBeFocused();
  await page.keyboard.type('a*2', { delay: 30 });
  await expect(nodes(page).nth(1).locator('ol')).toContainText('10', { timeout: 20_000 });
});

test('graph node plots a function', async ({ page }) => {
  await placeNode(page, 'Graph');
  await expect(nodes(page).locator('.MafsView path[d]').first()).toBeAttached({ timeout: 20_000 });
});

test('graph node plots rows that are not y=', async ({ page }) => {
  await placeNode(page, 'Graph');
  const plotted = nodes(page).locator('.MafsView path[d]');
  await expect(plotted.first()).toBeAttached({ timeout: 20_000 });
  const before = await plotted.count();
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  await nodes(page).locator('math-field').nth(1).click();
  await expect(nodes(page).locator('math-field').nth(1)).toBeFocused();
  await page.keyboard.type('x=3', { delay: 30 });
  await expect.poll(() => plotted.count()).toBeGreaterThan(before);
});

test('graph node traces an equation in x and y', async ({ page }) => {
  await placeNode(page, 'Graph');
  const plotted = nodes(page).locator('.MafsView path[d]');
  await expect(plotted.first()).toBeAttached({ timeout: 20_000 });
  const before = await plotted.count();
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  await nodes(page).locator('math-field').nth(1).click();
  await expect(nodes(page).locator('math-field').nth(1)).toBeFocused();
  await page.keyboard.type('x^2+y^2=1', { delay: 30 });
  await expect.poll(() => plotted.count()).toBeGreaterThan(before);
});

test('graph curves take a colour from the palette', async ({ page }) => {
  await placeNode(page, 'Graph');
  const curve = nodes(page).locator('.MafsView path[d]').first();
  await expect(curve).toBeAttached({ timeout: 20_000 });
  const before = await curve.evaluate((el) => getComputedStyle(el).stroke);
  await nodes(page).getByRole('button', { name: 'Curve colour' }).click();
  await page.getByRole('button', { name: 'pink', exact: true }).click();
  await expect.poll(() => curve.evaluate((el) => getComputedStyle(el).stroke)).not.toBe(before);
});

test('script node runs code in the sandbox', async ({ page }) => {
  await placeNode(page, 'Script');
  await nodes(page).getByRole('button', { name: 'Run' }).click();
  await expect(nodes(page)).toContainText('Hello from the sandbox!');
  await expect(nodes(page)).toContainText('10');
});

test('script node stops infinite loops', async ({ page }) => {
  test.setTimeout(30_000);
  await placeNode(page, 'Script');
  const editor = nodes(page).locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('while (true) {}');
  await nodes(page).getByRole('button', { name: 'Run' }).click();
  await expect(nodes(page)).toContainText('Stopped', { timeout: 10_000 });
});

test('sheet node evaluates formulas', async ({ page }) => {
  await placeNode(page, 'Sheet');
  const cells = nodes(page).locator('td.Spreadsheet__cell');
  await cells.nth(0).click();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter'); // commits and moves to A2
  await page.keyboard.type('=A1*21');
  await page.keyboard.press('Enter');
  await expect(cells.nth(4)).toHaveText('42');
  await expect(nodes(page)).toHaveCount(1); // Delete/typing inside the grid must not touch the node
});

test('table node rows and columns', async ({ page }) => {
  await placeNode(page, 'Table');
  await expect(nodes(page).locator('math-field')).toHaveCount(9);
  // The last gridline of each kind is the table's bottom/right edge, where "+" appends. Its pill only takes
  // pointer events while hovered, so click it by event.
  await nodes(page).getByRole('button', { name: 'Insert row' }).last().dispatchEvent('click');
  await nodes(page).getByRole('button', { name: 'Insert column' }).last().dispatchEvent('click');
  await expect(nodes(page).locator('math-field')).toHaveCount(16);
});

test('inserting a row keeps text cells as text', async ({ page }) => {
  await placeNode(page, 'Table');
  const fields = nodes(page).locator('math-field');
  const value = (i: number) => fields.nth(i).evaluate((el: HTMLElement & { value: string }) => el.value);
  // Typed in text mode, a cell is left with its caret inside the text.
  for (const [i, word] of [
    [0, 'one'],
    [3, 'two'],
  ] as const) {
    await fields.nth(i).click();
    await expect(fields.nth(i)).toBeFocused();
    await nodes(page).getByRole('button', { name: 'Switch to text mode' }).click();
    await page.keyboard.type(word);
  }
  await expect.poll(() => value(3)).toBe('\\text{two}');
  // A row on top moves every cell's value down a row, into fields left in text mode.
  await nodes(page).getByRole('button', { name: 'Insert row' }).first().dispatchEvent('click');
  await expect(fields).toHaveCount(12);
  await expect.poll(() => value(3)).toBe('\\text{one}');
  await expect.poll(() => value(6)).toBe('\\text{two}');
});

test('a video keeps its play button when the canvas is zoomed out, unlike editing controls', async ({
  page,
}) => {
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '' }),
  );
  await page.getByRole('button', { name: 'Insert video', exact: true }).click();
  await page.getByRole('textbox').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'OK' }).click();
  await placeNode(page, 'Script', 300, 250);
  await expect(nodes(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+a');
  const play = nodes(page).getByRole('button', { name: 'Play' });
  const run = nodes(page).getByRole('button', { name: 'Run' });
  await expect(play).toBeVisible();
  await expect(run).toBeVisible();
  // Clicks made while the view is still animating can be lost, so keep zooming until the tier changes.
  await expect(async () => {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(page.locator('.react-flow[data-zoom="mid"]')).toHaveCount(1, { timeout: 400 });
  }).toPass();
  await expect(run).toBeHidden();
  await expect(play).toBeVisible();
});

test('search dims non-matching nodes', async ({ page }) => {
  await placeNode(page, 'Text', 400, 300);
  await placeNode(page, 'Script', 900, 300);
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByLabel('Search nodes').fill('sandbox');
  await expect(page.getByText('1 found')).toBeVisible();
  await expect(page.locator('.react-flow__node.search-miss')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.react-flow__node.search-miss')).toHaveCount(0);
});

test('manages multiple canvases', async ({ page }) => {
  await placeNode(page, 'Text');
  await page.getByRole('button', { name: /Untitled canvas/ }).click();
  await page.getByRole('button', { name: 'New canvas' }).click();
  await page.getByRole('textbox').fill('Second');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('button', { name: /Second/ })).toBeVisible();
  await expect(nodes(page)).toHaveCount(0);

  await page.getByRole('button', { name: /Second/ }).click();
  await page.getByRole('button', { name: /Open Untitled canvas/ }).click();
  await expect(nodes(page)).toHaveCount(1);
});

test('exports and re-imports a canvas', async ({ page }) => {
  await placeNode(page, 'Text');
  await page.getByRole('button', { name: 'Unlined menu' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'This canvas' }).click();
  const download = await downloadPromise;
  const path = await download.path();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Unlined menu' }).click();
  await page.getByRole('menuitem', { name: /Import/ }).click();
  await (await chooserPromise).setFiles(path);
  await expect(page.getByText('Imported 1 canvas')).toBeVisible();
  await expect(nodes(page)).toHaveCount(1);
});

test('dark mode toggles', async ({ page }) => {
  await page.getByRole('button', { name: /Dark mode|Light mode/ }).click();
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: /Dark mode|Light mode/ }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!dark);
});

test('buttons never glow, and dark mode has no shadows at all', async ({ page }) => {
  await placeNode(page, 'Text');
  await page.getByRole('button', { name: 'Math', exact: true }).click();

  // A shadow shows when a layer has colour and an offset or blur. Dark mode's are empty (`0 0 #0000`), and a ring
  // (spread only) is a border, not a shadow.
  const shadowed = () =>
    page.evaluate(() => {
      const layer = /rgba?\(([^)]*)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g;
      const shows = (shadow: string) =>
        [...shadow.matchAll(layer)].some(([, color, x, y, blur]) => {
          const alpha = Number(color.split(',')[3] ?? 1);
          return alpha > 0 && (Number(x) !== 0 || Number(y) !== 0 || Number(blur) !== 0);
        });
      return [...document.querySelectorAll('*')]
        .filter((el) => shows(getComputedStyle(el).boxShadow))
        .map((el) => (el as HTMLElement).className?.toString().slice(0, 60) || el.tagName);
    });
  const activeButtonShadow = () =>
    page
      .locator('button[aria-pressed="true"]')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow);

  expect(await activeButtonShadow()).toBe('none');
  expect(await shadowed()).not.toEqual([]); // light mode has some, so the check can see them

  await page.getByRole('button', { name: /Dark mode/ }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  expect(await activeButtonShadow()).toBe('none');
  // Nodes fade their shadow out over a short transition when the theme flips.
  await expect.poll(shadowed).toEqual([]);
});
