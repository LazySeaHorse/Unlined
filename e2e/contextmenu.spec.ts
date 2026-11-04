import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

const menu = (page: import('@playwright/test').Page) => page.getByRole('menu');
const viewport = (page: import('@playwright/test').Page) =>
  page.locator('.react-flow__viewport').getAttribute('style');

test('right-clicking the empty canvas opens the canvas menu at the pointer', async ({ page }) => {
  await page.mouse.click(600, 400, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Add node' })).toBeVisible();
  const box = await menu(page).boundingBox();
  expect(Math.abs((box?.x ?? 0) - 600)).toBeLessThan(40);
  expect(Math.abs((box?.y ?? 0) - 400)).toBeLessThan(40);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('right-drag pans the canvas without opening a menu', async ({ page }) => {
  const before = await viewport(page);
  await page.mouse.move(600, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(700, 480, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(() => viewport(page)).not.toBe(before);
  await expect(menu(page)).toHaveCount(0);
});

test('adding a node from the menu puts it at the click', async ({ page }) => {
  await page.mouse.click(600, 400, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Add node' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  const node = page.locator('.react-flow__node');
  await expect(node).toHaveCount(1);
  const box = await node.boundingBox();
  expect(Math.abs((box?.x ?? 0) - 600)).toBeLessThan(20);
  expect(Math.abs((box?.y ?? 0) - 400)).toBeLessThan(20);
});

test("right-clicking inside a math field opens our menu with MathLive's editing items", async ({ page }) => {
  await placeNode(page, 'Math');
  await nodes(page).locator('math-field').click({ button: 'right' });
  for (const name of ['Insert', 'Insert matrix', 'Text colour', 'Background', 'Copy LaTeX'])
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  await expect(page.locator('.ui-menu-container')).toHaveCount(0);
});

/** The stored LaTeX of the only math node, as the app saw it. */
const latex = (page: import('@playwright/test').Page) =>
  nodes(page)
    .locator('math-field')
    .evaluate((f) => (f as unknown as { value: string }).value);

test('math menu inserts a matrix and a template at the caret', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('x=1');
  await page.keyboard.press('ArrowLeft');
  await field.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert matrix' }).click();
  await page.getByRole('button', { name: '2 × 2' }).click();
  await expect.poll(() => latex(page)).toContain('\\begin{pmatrix}');
  expect(await latex(page)).toMatch(/^x=\\begin\{pmatrix\}.*\\end\{pmatrix\}1$/);

  await field.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Integral' }).click();
  await expect.poll(() => latex(page)).toContain('\\int');
  await expect(field).toBeFocused();
});

test('math menu inserts a matrix of a typed size', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await field.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert matrix' }).click();
  await page.getByLabel('Rows', { exact: true }).fill('2');
  await page.getByLabel('Columns', { exact: true }).fill('3');
  await page.keyboard.press('Enter');
  await expect.poll(() => latex(page)).toContain('\\begin{pmatrix}');
  expect((await latex(page)).match(/&/g)).toHaveLength(4);
});

test('math menu colours the selected math', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('y');
  await page.keyboard.press('ControlOrMeta+a');
  await field.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Text colour' }).click();
  await page.getByRole('menuitem', { name: 'Red' }).click();
  await expect.poll(() => latex(page)).toMatch(/\\(textcolor|color)\{red\}/);
});

test('math menu tints the node background', async ({ page }) => {
  await placeNode(page, 'Math+');
  await nodes(page).locator('math-field').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Background' }).click();
  await page.getByRole('menuitem', { name: 'Blue' }).click();
  const card = nodes(page).locator('div[style*="--section-blue"]');
  await expect(card).toHaveCount(1);
  await nodes(page).locator('math-field').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Background' }).click();
  await page.getByRole('menuitem', { name: 'None' }).click();
  await expect(card).toHaveCount(0);
});

test('node menu: Duplicate copies the node', async ({ page }) => {
  await placeNode(page, 'Text');
  await expect(nodes(page)).toHaveCount(1);
  await nodes(page).locator('.prose').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(nodes(page)).toHaveCount(2);
});

test('node menu: Delete removes the node and undo brings it back', async ({ page }) => {
  await placeNode(page, 'Text');
  await nodes(page).locator('.prose').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(nodes(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(nodes(page)).toHaveCount(1);
});

async function wrapTwoTexts(page: import('@playwright/test').Page) {
  await placeNode(page, 'Text', 500, 350);
  await placeNode(page, 'Text', 500, 600);
  await page.mouse.click(1300, 820);
  await page.mouse.move(300, 250);
  await page.mouse.down();
  await page.mouse.move(1100, 850, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
}

test('selection menu wraps in a section; section menu removes it', async ({ page }) => {
  await wrapTwoTexts(page);
  await page
    .locator('.react-flow__nodesselection-rect')
    .click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Wrap in section' }).click();
  const section = page.locator('.react-flow__node-section');
  await expect(section).toHaveCount(1);
  await section.locator('input').press('Enter');

  await section.locator('.section-handle').click({ button: 'right', position: { x: 60, y: 20 } });
  await page.getByRole('menuitem', { name: 'Remove section' }).click();
  await expect(section).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(2);
});

test('section menu renames the section', async ({ page }) => {
  await wrapTwoTexts(page);
  await page.keyboard.press('ControlOrMeta+g');
  const section = page.locator('.react-flow__node-section');
  await section.locator('input').press('Enter');
  await section.locator('.section-handle').click({ button: 'right', position: { x: 60, y: 20 } });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const title = section.locator('input');
  await expect(title).toBeFocused();
  await title.fill('Plan');
  await title.press('Enter');
  await expect(section.getByText('Plan')).toBeVisible();
});

test('selection menu aligns the selected nodes', async ({ page }) => {
  await wrapTwoTexts(page);
  const lefts = async () =>
    (await nodes(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left))).map(Math.round);
  await page
    .locator('.react-flow__nodesselection-rect')
    .click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Align' }).click();
  await page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  const [a, b] = await lefts();
  expect(a).toBe(b);
});

test('the browser menu never shows: every real contextmenu event is cancelled', async ({ page }) => {
  await placeNode(page, 'Text', 400, 300);
  await page.mouse.click(1300, 800);
  // Recorded after every other handler has run, so this is what the browser acts on.
  await page.evaluate(() => {
    const w = window as unknown as { seen: { trusted: boolean; prevented: boolean; on: string }[] };
    w.seen = [];
    window.addEventListener('contextmenu', (e) => {
      w.seen.push({ trusted: e.isTrusted, prevented: e.defaultPrevented, on: (e.target as Element).tagName });
    });
  });
  const menu = page.getByRole('menu');
  await page.mouse.click(1000, 600, { button: 'right' }); // empty canvas
  await expect(menu).toBeVisible();
  await page.mouse.click(1250, 750, { button: 'right' }); // elsewhere while the menu is open
  await page.keyboard.press('Escape');
  await nodes(page).first().click({ button: 'right' }); // a node
  await expect(menu).toBeVisible();
  await menu.click({ button: 'right', position: { x: 10, y: 10 } }); // on the menu itself

  const seen = await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen);
  expect(seen.length).toBeGreaterThan(0);
  expect(
    seen.filter(
      (e) =>
        (e as { trusted: boolean; prevented: boolean }).trusted && !(e as { prevented: boolean }).prevented,
    ),
  ).toEqual([]);
});

test('a node can be titled from its menu, and an empty title restores the default', async ({ page }) => {
  await placeNode(page, 'Table', 500, 300);
  const node = nodes(page);
  await expect(node.getByText('Table', { exact: true })).toBeVisible();
  await node.click({ button: 'right', position: { x: 20, y: 18 } });
  await page.getByRole('menuitem', { name: 'Add title' }).click();
  await page.keyboard.type('Costs');
  await page.keyboard.press('Enter');
  await expect(node.getByText('Costs', { exact: true })).toBeVisible();
  await expect(node.getByText('Table', { exact: true })).toHaveCount(0);

  await node.getByText('Costs', { exact: true }).dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(node.getByText('Table', { exact: true })).toBeVisible();
});

test('a math node shows its title above the field', async ({ page }) => {
  await placeNode(page, 'Math', 500, 300);
  await expect(nodes(page).locator('math-field')).toBeVisible();
  await nodes(page).click({ button: 'right', position: { x: 10, y: 10 } });
  await page.getByRole('menuitem', { name: 'Add title' }).click();
  await page.keyboard.type('Objective');
  await page.keyboard.press('Enter');
  await expect(nodes(page).getByText('Objective')).toBeVisible();
});
