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
