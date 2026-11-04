import { expect, type Page, test } from '@playwright/test';
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
  // Mafs keeps its own labels in the DOM when the axes are off screen, so look for labels that are really inside
  // the plot: one along the left edge and one along the bottom edge, which only the rulers can put there.
  const inside = async (edge: 'left' | 'bottom') => {
    const texts = nodes(page).locator('svg text');
    const box = (await plot.boundingBox()) as { x: number; y: number; width: number; height: number };
    for (let i = 0; i < (await texts.count()); i++) {
      const b = await texts.nth(i).boundingBox();
      if (!b || b.width === 0) continue;
      const within =
        b.x >= box.x - 1 &&
        b.y >= box.y - 1 &&
        b.x + b.width <= box.x + box.width + 1 &&
        b.y + b.height <= box.y + box.height + 1;
      if (!within) continue;
      if (edge === 'left' && b.x < box.x + 30) return true;
      if (edge === 'bottom' && b.y + b.height > box.y + box.height - 30) return true;
    }
    return false;
  };
  await expect.poll(() => inside('left')).toBe(true);
  await expect.poll(() => inside('bottom')).toBe(true);
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
  const tip = nodes(page).locator('[data-hover-tip]');
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

test('typing y=e^x fits a sane window and the page stays responsive', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  const field = nodes(page).locator('li').first().locator('math-field');
  await field.click();
  await field.evaluate((f: HTMLElement & { value: string }) => {
    f.value = 'y=e^x';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(
    nodes(page).locator('svg path[stroke-linejoin="round"], svg .mafs-plot-of-x').first(),
  ).toBeAttached();
  await expect.poll(async () => (await nodes(page).locator('svg text').count()) < 60).toBe(true);
  await expect(nodes(page).getByRole('application', { name: 'Graph' })).toBeVisible();
});

for (const equal of [false, true]) {
  test(`the hover mark is under the pointer when the canvas is zoomed${equal ? ' (axes 1:1)' : ''}`, async ({
    page,
  }) => {
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
    if (equal) {
      const at0 = (await plot.boundingBox()) as { x: number; y: number };
      await page.mouse.click(at0.x + 30, at0.y + 30, { button: 'right' });
      const item = page
        .getByRole('menuitemcheckbox', { name: 'Keep axes 1:1' })
        .or(page.getByRole('menuitem', { name: 'Keep axes 1:1' }));
      await item.click();
    }
    // Zoom the canvas away from 100%: the node is then drawn scaled.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(800);
    const tip = nodes(page).locator('[data-hover-tip]');
    const mark = nodes(page).locator('[data-hover-mark]').first();
    await expect(nodes(page).locator('svg text').first()).toBeVisible();
    const at = (await plot.boundingBox()) as { x: number; y: number; width: number; height: number };
    // Sweep until the tooltip reads the crossing, then compare the mark with the pointer.
    let found: { x: number; y: number } | undefined;
    await expect
      .poll(
        async () => {
          for (let i = 0; i <= 80; i++) {
            const [mx, my] = [at.x + (at.width * i) / 80, at.y + at.height * 0.45];
            await page.mouse.move(mx, my);
            if ((await tip.allTextContents()).join(' ').includes('(2, 2)')) {
              found = { x: mx, y: my };
              return true;
            }
          }
          return false;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const m = (await mark.boundingBox()) as { x: number; y: number; width: number; height: number };
    const [cx, cy] = [m.x + m.width / 2, m.y + m.height / 2];
    // Snapping moves the mark off the pointer by up to the snap radius at most; unscaled it was hundreds of pixels.
    expect(Math.hypot(cx - (found?.x ?? 0), cy - (found?.y ?? 0))).toBeLessThan(25);
  });
}

test('clicking while hovering pins the chip; pins stack and a click on a chip unpins it', async ({
  page,
}) => {
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
  const tip = nodes(page).locator('[data-hover-tip]');
  const pins = nodes(page).locator('[data-pin]');

  /** Sweeps the pointer over the plot until the tooltip reads `text`, and leaves it there. */
  const hoverOn = (text: string) =>
    expect
      .poll(
        async () => {
          for (let r = 0.1; r < 1; r += 0.07)
            for (let c = 0.02; c < 1; c += 0.04) {
              const [x, y] = [at.x + at.width * c, at.y + at.height * r];
              // A pinned chip over the place would take the click: it is not a place to try.
              if (
                await page.evaluate(
                  ([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-pin]'),
                  [x, y],
                )
              )
                continue;
              await page.mouse.move(x, y);
              if ((await tip.allTextContents()).join(' ').includes(text)) return true;
            }
          return false;
        },
        { timeout: 30_000 },
      )
      .toBe(true);

  await hoverOn('(2, 2)');
  await page.mouse.down();
  await page.mouse.up();
  await expect(pins).toHaveCount(1);
  await expect(pins.first()).toHaveText('(2, 2)');
  // It stays when the pointer goes elsewhere, and a second place can be pinned beside it.
  await page.mouse.move(at.x + 3, at.y + 3);
  await expect(pins).toHaveCount(1);
  await hoverOn('(4, 0)');
  await page.mouse.down();
  await page.mouse.up();
  await expect(pins).toHaveCount(2);
  // A drag pans and pins nothing.
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 + 40, at.y + at.height / 2 + 10, { steps: 5 });
  await page.mouse.up();
  await expect(pins).toHaveCount(2);
  // Clicking a chip takes it off.
  await pins.filter({ hasText: '(2, 2)' }).click();
  await expect(pins).toHaveCount(1);
  await expect(pins.first()).toHaveText('(4, 0)');
});

/** Sets row `i` of the open graph to `value`, and names it through the colour dot's popover. */
async function setRow(page: Page, i: number, value: string, name?: string) {
  const row = nodes(page).locator('li').nth(i);
  await row.locator('math-field').evaluate((f: HTMLElement & { value: string }, v: string) => {
    f.value = v;
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  if (name === undefined) return;
  await row.getByRole('button', { name: /^Curve colour and name/ }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
}

test('a named line is written along its curve, and the name goes when it is cleared', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  await setRow(page, 0, 'y=2x+1', 'Revenue');
  const names = nodes(page).locator('[data-graph-names]');
  // Plain text sits on the curve as text on a path.
  await expect(names.locator('textPath', { hasText: 'Revenue' })).toHaveCount(2);
  // The dot says what it names.
  const dot = nodes(page).getByRole('button', { name: 'Curve colour and name: Revenue' });
  await expect(dot).toBeVisible();
  // The label is near the curve: inside the plot, upright (the text box is wider than tall).
  const plot = nodes(page).getByRole('application', { name: 'Graph' });
  const box = (await plot.boundingBox()) as { x: number; y: number; width: number; height: number };
  const label = names.locator('text').last();
  const at = (await label.boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(at.x).toBeGreaterThanOrEqual(box.x);
  expect(at.x + at.width).toBeLessThanOrEqual(box.x + box.width);
  expect(at.y).toBeGreaterThanOrEqual(box.y);
  expect(at.y + at.height).toBeLessThanOrEqual(box.y + box.height);

  // Hovering the curve names it in the chip: sweep across the plot until the pointer is on the line.
  const chip = async () => {
    for (const h of [0.3, 0.7])
      for (let i = 0; i <= 40; i++) {
        await page.mouse.move(box.x + (box.width * i) / 40, box.y + box.height * h);
        const text = (await nodes(page).locator('[data-hover-tip]').allTextContents()).join(' ');
        if (text.includes('Revenue')) return text;
      }
    return '';
  };
  await expect.poll(chip).toMatch(/^Revenue\s*\(/);

  await dot.click();
  await page.getByLabel('Name', { exact: true }).fill('');
  await page.keyboard.press('Escape');
  await expect(names).toHaveCount(0);
  await expect(nodes(page).getByRole('button', { name: 'Curve colour and name', exact: true })).toBeVisible();
});

test('names with maths are typeset, and a point is named beside its dot', async ({ page }) => {
  await openApp(page);
  await placeNode(page, 'Graph');
  await nodes(page).getByRole('button', { name: 'Add equation' }).click();
  await setRow(page, 0, 'y=x^2', 'parabola $f(x)=x^2$');
  await setRow(page, 1, '(1,2)', 'peak');
  const names = nodes(page).locator('[data-graph-names]');
  await expect(names.locator('.katex')).toHaveCount(1);
  await expect(names.locator('[data-graph-name]')).toContainText('f(x)');
  await expect(names.locator('text', { hasText: 'peak' })).toHaveCount(2);
});
