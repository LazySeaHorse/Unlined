import { expect, type Page, test } from '@playwright/test';
import { nodes, openApp } from './helpers';

/** Writes `content` into the open canvas's row in IndexedDB and reloads. */
async function seed(page: Page, content: object) {
  await page.evaluate(async (content) => {
    const request = indexedDB.open('unlined');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const [canvas] = await new Promise<{ id: string }[]>((resolve) => {
      const r = db.transaction('canvases').objectStore('canvases').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('contents', 'readwrite');
      tx.objectStore('contents').put({ id: canvas.id, ...content });
      tx.oncomplete = resolve;
    });
  }, content);
  await page.reload();
}

test('mobile is a read-only viewer', async ({ page }) => {
  await openApp(page);
  // Seed a node through the store-backed IndexedDB by importing via the desktop flow is not possible here,
  // so create content directly in the database and reload.
  await seed(page, {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'n1', type: 'text', position: { x: 40, y: 200 }, data: { markdown: '# Read me' } }],
  });

  await expect(page.getByText('View only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(nodes(page).locator('h1')).toHaveText('Read me');

  await nodes(page).first().click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  await nodes(page).locator('.markdown').dblclick();
  await expect(nodes(page).locator('textarea')).toHaveCount(0);

  await page.locator('.react-flow__pane').dblclick({ position: { x: 200, y: 600 } });
  await expect(nodes(page)).toHaveCount(1);
});

test('mobile shows links but cannot select or rename them', async ({ page }) => {
  await openApp(page);
  await seed(page, {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: 'n1', type: 'text', position: { x: 24, y: 192 }, data: { markdown: 'A' } },
      { id: 'n2', type: 'text', position: { x: 24, y: 480 }, data: { markdown: 'B' } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', data: { label: 'k' } }],
  });
  const edge = page.locator('.react-flow__edge');
  await expect(edge).toHaveCount(1);
  // A vertical line has no width, which Playwright would call hidden.
  const box = await edge.locator('.react-flow__edge-path').boundingBox();
  expect(box?.height).toBeGreaterThan(100);
  await expect(edge).not.toHaveClass(/selectable/);
  await edge.locator('.react-flow__edge-path').dispatchEvent('click');
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
  await edge.locator('.react-flow__edge-path').dispatchEvent('dblclick');
  await expect(page.locator('.react-flow input')).toHaveCount(0);
});

test('mobile shows no context menu', async ({ page }) => {
  await openApp(page);
  await page.locator('.react-flow__pane').dispatchEvent('contextmenu', { clientX: 200, clientY: 400 });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('mobile can reach the cloud sync settings', async ({ page }) => {
  await page.route('https://api.jsonbin.io/**', (route) => route.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      'unlined-sync',
      JSON.stringify({ state: { key: 'k', keyKind: 'master', manifestId: 'm' }, version: 0 }),
    ),
  );
  await openApp(page);
  await page.getByRole('button', { name: 'Untitled canvas' }).click();
  const manager = page.getByRole('dialog', { name: 'Canvases' });
  await expect(manager.getByRole('button', { name: 'Cloud sync settings' })).toBeVisible();
  // A device that has the key but not the password still has to be given it.
  await expect(manager.getByText('Enter your password to sync with the cloud')).toBeVisible();
  await manager.getByRole('button', { name: 'Cloud sync settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Cloud sync' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(manager.getByRole('button', { name: 'New canvas' })).toHaveCount(0);
  await expect(manager.getByRole('button', { name: 'Push all' })).toHaveCount(0);
});
