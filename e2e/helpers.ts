import { expect, type Locator, type Page } from '@playwright/test';

export const nodes = (page: Page) => page.locator('.react-flow__node');

export async function openApp(page: Page) {
  await page.goto('./');
  await expect(page.locator('.react-flow__pane')).toBeVisible();
}

/** Selects a toolbar tool and double-clicks the empty canvas at (x, y) to place it. */
export async function placeNode(page: Page, tool: string, x = 500, y = 400) {
  await page.getByRole('button', { name: tool, exact: true }).click();
  await page.mouse.dblclick(x, y);
}

/** Enter in a Math+ row: a new row below takes the caret (once MathLive has mounted it, a moment later). */
export async function newRow(page: Page, rows: Locator, index: number) {
  await page.keyboard.press('Enter');
  await expect(rows.nth(index)).toBeFocused();
}
