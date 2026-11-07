import { expect, test } from '@playwright/test';
import { nodes, openApp } from './helpers';

// A 1x1 transparent PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHWxYZQAAAABJRU5ErkJggg==';

/** Drags `files` over the pane and drops them there, as a file manager would. */
async function dropFiles(
  page: import('@playwright/test').Page,
  files: { name: string; type: string; base64: string }[],
) {
  const data = await page.evaluateHandle((list) => {
    const transfer = new DataTransfer();
    for (const { name, type, base64 } of list) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type }));
    }
    return transfer;
  }, files);
  const pane = page.locator('.react-flow__pane');
  const over = await pane.evaluate((el, transfer) => {
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, data);
  await pane.evaluate((el, transfer) => {
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, data);
  return over;
}

test('dropping an image file adds an image node', async ({ page }) => {
  await openApp(page);
  const accepted = await dropFiles(page, [{ name: 'dot.png', type: 'image/png', base64: PNG }]);
  expect(accepted).toBe(true);
  await expect(nodes(page)).toHaveCount(1);
  await expect(page.locator('.react-flow__node-image img')).toHaveAttribute('src', /^data:image\/png/);
});

test('a file that cannot be used is turned down with a message, not opened by the browser', async ({
  page,
}) => {
  await openApp(page);
  const accepted = await dropFiles(page, [{ name: 'a.zip', type: 'application/zip', base64: 'AA==' }]);
  expect(accepted).toBe(true);
  await expect(page.getByText('Only images and PDFs can be dropped here')).toBeVisible();
  await expect(nodes(page)).toHaveCount(0);
});
