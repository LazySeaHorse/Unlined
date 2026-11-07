import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

const section = (page: import('@playwright/test').Page) => page.locator('.react-flow__node-section');

async function marquee(
  page: import('@playwright/test').Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

async function wrapTwoTexts(page: import('@playwright/test').Page) {
  await placeNode(page, 'Text', 500, 350);
  await placeNode(page, 'Text', 500, 600);
  await page.mouse.click(1300, 820);
  await marquee(page, 300, 250, 1100, 850);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+g');
  await expect(section(page)).toHaveCount(1);
}

test('Ctrl+G wraps the selection in a titled section', async ({ page }) => {
  await wrapTwoTexts(page);
  const title = section(page).locator('input');
  await expect(title).toBeFocused();
  await title.fill('Plan');
  await title.press('Enter');
  await expect(section(page).getByText('Plan')).toBeVisible();

  await page.waitForTimeout(800);
  await page.reload();
  await expect(section(page).getByText('Plan')).toBeVisible();
});

test('dragging a section moves the nodes inside it', async ({ page }) => {
  await wrapTwoTexts(page);
  await section(page).locator('input').press('Enter');
  const text = nodes(page)
    .filter({ has: page.locator('.markdown') })
    .first();
  const before = await text.boundingBox();
  const sectionBefore = await section(page).boundingBox();
  const header = await section(page).locator('.section-handle').boundingBox();
  if (!before || !header || !sectionBefore) throw new Error('missing boxes');
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + header.width / 2 + 80, header.y + header.height / 2 + 40, { steps: 10 });
  await page.mouse.up();
  const after = await text.boundingBox();
  const sectionAfter = await section(page).boundingBox();
  if (!after || !sectionAfter) throw new Error('missing box');
  expect(after.x - before.x).toBeGreaterThan(40);
  expect(after.x - before.x).toBeCloseTo(sectionAfter.x - sectionBefore.x, 0);
  expect(after.y - before.y).toBeCloseTo(sectionAfter.y - sectionBefore.y, 0);
});

test('the inside of a section still takes marquee and double-click', async ({ page }) => {
  await wrapTwoTexts(page);
  await section(page).locator('input').press('Enter');
  const box = await section(page).boundingBox();
  if (!box) throw new Error('missing section box');
  // Double-click on empty section body places a node there.
  await page.getByRole('button', { name: 'Math', exact: true }).click();
  await page.mouse.dblclick(box.x + box.width - 40, box.y + box.height / 2);
  await expect(nodes(page).filter({ has: page.locator('math-field') })).toHaveCount(1);
  // Marquee that starts inside the section selects the nodes it touches, not the section.
  await page.mouse.click(1300, 860);
  await marquee(page, box.x + 20, box.y + 60, box.x + box.width - 20, box.y + box.height - 20);
  await expect(section(page)).not.toHaveClass(/selected/);
});
