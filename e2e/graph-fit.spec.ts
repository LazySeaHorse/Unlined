import { expect, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test('the graph window fits what is typed, and the right-click menu has Fit and 1:1', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  const field = nodes(page).locator('li').first().locator('math-field');
  await field.click();
  await field.evaluate((f: HTMLElement & { value: string }) => {
    f.value = 'y=13000-200x';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const labels = async () => (await nodes(page).locator('svg text').allTextContents()).join(' ');
  // The axes are labelled in thousands, a few at a time, not in single units.
  await expect.poll(labels).toMatch(/10000/);
  expect((await nodes(page).locator('svg text').count()) < 40).toBe(true);

  await page.screenshot({ path: test.info().outputPath('default.png') });
  const plot = nodes(page).getByRole('application', { name: 'Graph' });
  const at = await plot.boundingBox();
  // Right-click the plot itself: the menu is the node's, whichever part of it is under the pointer.
  await page.mouse.click((at?.x ?? 0) + 30, (at?.y ?? 0) + 30, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Fit to equations' })).toBeVisible();
  const equal = page
    .getByRole('menuitemcheckbox', { name: 'Keep axes 1:1' })
    .or(page.getByRole('menuitem', { name: 'Keep axes 1:1' }));
  await equal.click();
  await page.mouse.click((at?.x ?? 0) + 30, (at?.y ?? 0) + 30, { button: 'right' });
  // Its icon, and a tick once it is on.
  await expect(page.getByRole('menuitem', { name: 'Keep axes 1:1' }).locator('svg')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('fit.png') });
});

test('a row restricted with braces is drawn only where the restriction holds', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  const field = nodes(page).locator('li').first().locator('math-field');
  await field.click();
  // The row as the field writes it when `y=-2000+30x{x>0}` is typed (checked by hand: { becomes \left\lbrace).
  await field.evaluate((f: HTMLElement & { value: string }) => {
    f.value = 'y=-2000+30x\\left\\lbrace x>0\\right\\rbrace';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const curve = nodes(page).locator('svg path[stroke-linejoin="round"]');
  await expect(curve).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('restricted.png') });
});

test('points are drawn, and rulers hold the edges once the axes are panned away', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  const field = nodes(page).locator('li').first().locator('math-field');
  await field.click();
  await field.evaluate((f: HTMLElement & { value: string }) => {
    f.value = '(1,2),(3,-1)';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(nodes(page).locator('svg circle')).toHaveCount(2);
  const labels = async () => (await nodes(page).locator('svg text').allTextContents()).join(' ');
  expect(await labels()).toContain('-0.5');

  // Drag the plot until both axes are out of view: their labels go with them, and the rulers take over.
  const plot = nodes(page).getByRole('application', { name: 'Graph' });
  const at = (await plot.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 - 400, at.y + at.height / 2 - 300, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await labels()).includes('-2.5')).toBe(true);
  await expect.poll(async () => /\b5\b/.test(await labels())).toBe(true);
});

test('hovering a graph shows coordinates, snapped to where two lines cross', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  const fields = nodes(page).locator('li math-field');
  const set = (i: number, value: string) =>
    fields.nth(i).evaluate((f: HTMLElement & { value: string }, v: string) => {
      f.value = v;
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  await set(0, 'y=x');
  await set(1, 'y=-x+4');
  const plot = nodes(page).getByRole('application', { name: 'Graph' });
  await expect(nodes(page).locator('svg text').first()).toBeVisible();
  const at = (await plot.boundingBox()) as { x: number; y: number; width: number; height: number };
  const tip = nodes(page).locator('[role=status]');
  // Sweep along the plot: near the crossing the tooltip reads exactly (2, 2), however the pointer lines up.
  await page.mouse.move(at.x + 5, at.y + at.height / 2);
  // The window refits as the rows arrive, so sweep until the tooltip has been to the crossing.
  await expect
    .poll(
      async () => {
        for (let i = 0; i <= 60; i++) {
          await page.mouse.move(at.x + (at.width * i) / 60, at.y + at.height * 0.45);
          if ((await tip.allTextContents()).join(' ').includes('(2, 2)')) return true;
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});
