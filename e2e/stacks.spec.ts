import { expect, type Page, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

const stack = (page: Page) => page.locator('.react-flow__node-stack');
const frontTab = (page: Page) => stack(page).locator('.stack-card[data-front] .node-tab');
const backTabs = (page: Page) => stack(page).locator('.stack-card[data-front] .stack-tab');

/** A Text, a Math and a Graph node, stacked from the selection. */
async function stackThree(page: Page) {
  await placeNode(page, 'Text', 300, 300);
  await page.mouse.click(1300, 820);
  await placeNode(page, 'Math', 800, 300);
  await page.mouse.click(1300, 820);
  await placeNode(page, 'Graph', 400, 600);
  await page.mouse.click(1300, 850);
  await expect(nodes(page)).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(nodes(page)).toHaveCount(1);
}

test('Ctrl+Shift+G stacks the selection; tabs, ] and [ switch cards, and the choice is saved', async ({
  page,
}) => {
  await stackThree(page);
  await expect(frontTab(page)).toContainText('Text');
  await expect(backTabs(page)).toHaveCount(2);

  await backTabs(page).first().click();
  await expect(frontTab(page)).toContainText('Math');

  await page.keyboard.press(']');
  await expect(frontTab(page)).toContainText('Graph');
  await page.keyboard.press('[');
  await expect(frontTab(page)).toContainText('Math');

  await page.waitForTimeout(800);
  await page.reload();
  await expect(nodes(page)).toHaveCount(1);
  await expect(frontTab(page)).toContainText('Math');
});

test('a card can be taken out of its stack, and the stack unstacked', async ({ page }) => {
  await stackThree(page);
  await frontTab(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Take out of stack' }).click();
  await expect(nodes(page)).toHaveCount(2);
  await expect(backTabs(page)).toHaveCount(1);

  await frontTab(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unstack all' }).click();
  await expect(nodes(page)).toHaveCount(3);
  await expect(stack(page)).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(stack(page)).toHaveCount(1);
});

test('dropping a node on another node’s tab stacks it there, in front', async ({ page }) => {
  await placeNode(page, 'Text', 300, 300);
  await page.mouse.click(1300, 820);
  await placeNode(page, 'Math', 800, 500);
  await page.mouse.click(1300, 820);
  const tab = page.locator('.react-flow__node-text .node-tab');
  const handle = page.locator('.react-flow__node-math .node-tab');
  const to = await tab.boundingBox();
  const from = await handle.boundingBox();
  if (!to || !from) throw new Error('tabs not found');
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 12 });
  await expect(page.locator('.react-flow__node.stack-drop')).toHaveCount(1);
  await page.mouse.up();
  await expect(nodes(page)).toHaveCount(1);
  await expect(frontTab(page)).toContainText('Math');
});

test('deleting a stack deletes its cards, and undo brings them back', async ({ page }) => {
  await stackThree(page);
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(nodes(page)).toHaveCount(1);
  await expect(backTabs(page)).toHaveCount(2);
});

test('Space fans the cards out: arrows and Enter, or a click, pick one; Escape folds them up', async ({
  page,
}) => {
  await stackThree(page);
  const picks = stack(page).locator('.stack-pick');
  await page.keyboard.press('Space');
  await expect(picks).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(picks).toHaveCount(0);
  await expect(frontTab(page)).toContainText('Graph');

  await page.keyboard.press('Space');
  await picks.nth(1).click();
  await expect(picks).toHaveCount(0);
  await expect(frontTab(page)).toContainText('Math');

  await stack(page).locator('.stack-fan').click();
  await expect(picks).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(picks).toHaveCount(0);
  await expect(frontTab(page)).toContainText('Math');
});

test('dragging a fanned card away from the row takes it out of the stack', async ({ page }) => {
  await stackThree(page);
  await page.keyboard.press('Space');
  const card = await stack(page).locator('.stack-pick').nth(0).boundingBox();
  if (!card) throw new Error('no fanned card');
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2 + 350, { steps: 10 });
  await page.mouse.up();
  await expect(nodes(page)).toHaveCount(2);
  await expect(backTabs(page)).toHaveCount(1);
});
