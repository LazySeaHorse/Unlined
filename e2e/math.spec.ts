import { expect, type Locator, test } from '@playwright/test';
import { nodes, openApp, placeNode } from './helpers';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
test.beforeEach(async ({ page }) => openApp(page));

test('React Flow attribution is hidden', async ({ page }) => {
  await expect(page.locator('.react-flow__attribution')).toHaveCount(0);
});

for (const tool of ['Math', 'Math+']) {
  test(`${tool}: mouse places the caret and selects text`, async ({ page }) => {
    await placeNode(page, tool);
    const field = nodes(page).locator('math-field');
    await field.click();
    await expect(field).toBeFocused();
    await page.keyboard.type('abc');
    await expect.poll(() => field.evaluate((el: HTMLElement & { value: string }) => el.value)).toBe('abc');
    const box = await field.boundingBox();
    if (!box) throw new Error('missing field box');

    await page.mouse.click(box.x + 2, box.y + box.height / 2);
    expect(await field.evaluate((el: HTMLElement & { position: number }) => el.position)).toBe(0);

    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(
      await field.evaluate((el: HTMLElement & { selectionIsCollapsed: boolean }) => el.selectionIsCollapsed),
    ).toBe(false);
  });
}

for (const tool of ['Math', 'Math+']) {
  test(`${tool}: "(" wraps what follows it in parentheses`, async ({ page }) => {
    await placeNode(page, tool);
    const field = nodes(page).locator('math-field');
    await field.click();
    await expect(field).toBeFocused();
    await page.keyboard.type('1+(2+3');
    await expect
      .poll(() => field.evaluate((el: HTMLElement & { value: string }) => el.value))
      .toBe('1+\\left(2+3\\right)');
  });
}

test('Math+: copy button puts the result LaTeX on the clipboard', async ({ page }) => {
  await placeNode(page, 'Math+');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('1/3');
  const result = nodes(page).locator('li', { hasText: '=' }).first();
  await expect(result).toBeVisible();
  await result.hover();
  await result.getByRole('button', { name: 'Copy LaTeX' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('frac');
});

test('Ctrl+D waits while typing in a math field; Escape hands the node back to the canvas', async ({
  page,
}) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes(page)).toHaveCount(2);
});

test('pasting multi-line math into a line of a multi-line field cannot nest it and break the node', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // MathLive rejecting a saved value is caught so the canvas survives, but it must not happen at all.
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('a');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('b');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');

  // What gets saved is never nested, so reopening or duplicating the node cannot crash MathLive.
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(field).toBeVisible();
  await page.keyboard.press('Escape');
  await nodes(page)
    .first()
    .click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes(page)).toHaveCount(2);
  await expect(nodes(page).locator('math-field')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('duplicating a multi-line Math+ node works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await placeNode(page, 'Math+');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('a:=2');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('a*3');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes(page)).toHaveCount(2);
  await expect(nodes(page).locator('math-field')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a command committed from LaTeX mode takes the next key as its argument', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('x+\\hat');
  await expect.poll(() => field.evaluate((el: HTMLElement & { mode: string }) => el.mode)).toBe('latex');
  await page.keyboard.press('Enter');
  await page.keyboard.type('U');
  await expect
    .poll(() => field.evaluate((el: HTMLElement & { value: string }) => el.value))
    .toBe('x+\\hat{U}');
});

test('a drag that ends inside a square root selects the whole root', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await field.evaluate((el: HTMLElement & { setValue: (v: string) => void }) =>
    el.setValue('ab+\\sqrt{xyzw}'),
  );
  const box = await field.boundingBox();
  if (!box) throw new Error('missing field box');
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const selected = await field.evaluate(
    (el: HTMLElement & { selection: unknown; getValue: (s: unknown, f: string) => string }) =>
      el.getValue(el.selection, 'latex'),
  );
  expect(selected).toBe('ab+\\sqrt{xyzw}');
});

const LINES = '\\displaylines{C_1=5p_1+3p_2+6p_3\\\\ C_2=3p_1+5p_2+4p_3\\\\ C_3=6p_1+4p_2+3p_3}';

/** The centre of each glyph drawn in a math field, line by line from the top. */
async function glyphLines(field: Locator) {
  // MathLive draws a new value on the next frame; the layout settles on the one after.
  await field.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const glyphs = await field.evaluate((el) =>
    [...(el.shadowRoot?.querySelectorAll('span') ?? [])]
      .filter((s) => !s.children.length && s.textContent?.trim().replace('\u200b', ''))
      .map((s) => {
        const r = s.getBoundingClientRect();
        return { text: s.textContent ?? '', x: r.x + r.width / 2, y: r.y + r.height / 2, right: r.right };
      }),
  );
  const lines: (typeof glyphs)[] = [];
  for (const g of glyphs) {
    const line = lines.find((l) => Math.abs(l[0].y - g.y) < 10);
    if (line) line.push(g);
    else lines.push([g]);
  }
  return lines.sort((a, b) => a[0].y - b[0].y);
}

const selectedLatex = (field: Locator) =>
  field.evaluate((el: HTMLElement & { selection: unknown; getValue: (s: unknown, f: string) => string }) =>
    el.getValue(el.selection, 'latex'),
  );

test('a drag along a line of multi-line math takes in its subscripts and stops at the end of the line', async ({
  page,
}) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await field.evaluate((el: HTMLElement & { setValue: (v: string) => void }, v) => el.setValue(v), LINES);
  const [line] = await glyphLines(field);
  const five = line[line.findIndex((g) => g.text === '=') + 1];
  const subscript = line[line.length - 1];
  expect(subscript.text).toBe('3');

  await page.mouse.move(five.x - 6, five.y);
  await page.mouse.down();
  await page.mouse.move(subscript.x, five.y, { steps: 10 });
  expect(await selectedLatex(field)).toBe('5p_1+3p_2+6p_3');
  // Every line ends at the right edge of the math, so a drag just past it must not run to the end of the field.
  await page.mouse.move(subscript.right + 30, five.y, { steps: 5 });
  expect(await selectedLatex(field)).toBe('5p_1+3p_2+6p_3');
  await page.mouse.up();
});

test('math copied across lines keeps its line breaks', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await field.evaluate((el: HTMLElement & { setValue: (v: string) => void }, v) => el.setValue(v), LINES);
  const [first, second] = await glyphLines(field);
  const five = first[first.findIndex((g) => g.text === '=') + 1];
  await page.mouse.move(five.x - 6, five.y);
  await page.mouse.down();
  await page.mouse.move(second[second.length - 1].right + 30, second[0].y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '\\displaylines{5p_1+3p_2+6p_3\\\\ C_2=3p_1+5p_2+4p_3}',
  );
});

test('math copied across lines pastes as lines, around the caret', async ({ page }) => {
  await placeNode(page, 'Math', 400, 300);
  await placeNode(page, 'Math', 900, 300);
  const [source, target] = [
    nodes(page).nth(0).locator('math-field'),
    nodes(page).nth(1).locator('math-field'),
  ];
  await source.click();
  await source.evaluate((el: HTMLElement & { setValue: (v: string) => void }, v) => el.setValue(v), LINES);
  const [first, second] = await glyphLines(source);
  const five = first[first.findIndex((g) => g.text === '=') + 1];
  await page.mouse.move(five.x - 6, five.y);
  await page.mouse.down();
  await page.mouse.move(second[second.length - 1].right + 30, second[0].y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+c');

  await target.click();
  await target.click();
  await expect(target).toBeFocused();
  await target.evaluate((el: HTMLElement & { setValue: (v: string) => void; position: number }) => {
    el.setValue('x+y');
    el.position = 1;
  });
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => target.evaluate((el: HTMLElement & { value: string }) => el.value))
    .toBe('\\displaylines{x5p_1+3p_2+6p_3\\\\ C_2=3p_1+5p_2+4p_3+y}');
  // The caret ends after the pasted math, not at the end of the field.
  await page.keyboard.type('q');
  await expect
    .poll(() => target.evaluate((el: HTMLElement & { value: string }) => el.value))
    .toBe('\\displaylines{x5p_1+3p_2+6p_3\\\\ C_2=3p_1+5p_2+4p_3q+y}');
});

test('Backspace at the start of a cell of aligned math joins it to the cell before', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  const value = () => field.evaluate((el: HTMLElement & { value: string }) => el.value);
  await field.evaluate(
    (el: HTMLElement & { setValue: (v: string) => void }) =>
      el.setValue(
        '\\begin{aligned}\\text{Row 1: } & 5q_1=v\\\\ \\text{Row 2: } & 3q_1=v\\\\ & 6q_1=v\\end{aligned}',
      ),
    undefined,
  );
  const lines = await glyphLines(field);
  // The left half of a glyph puts the caret before it: the start of its cell.
  const six = lines[2][0];
  await page.mouse.click(six.x - 2, six.y);
  await page.keyboard.press('Backspace');
  expect(await value()).toContain('\\\\ 6q_1=v & \\end{aligned}');

  const five = lines[0].find((g) => g.text === '5');
  if (!five) throw new Error('missing 5');
  await page.mouse.click(five.x - 2, five.y);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  expect(await value()).toContain('\\text{Row 1:}5q_1=v & \\\\');
});

test('Backspace joins a line to the one above, and does nothing at the start of the first line', async ({
  page,
}) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  const backspaceAt = async (position: number) => {
    await field.evaluate((el: HTMLElement & { setValue: (v: string) => void; position: number }, p) => {
      el.setValue('\\displaylines{a+b\\\\ c+d}');
      el.position = p;
    }, position);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('x');
    return field.evaluate((el: HTMLElement & { value: string }) => el.value);
  };
  expect(await backspaceAt(0)).toBe('\\displaylines{xa+b\\\\ c+d}');
  expect(await backspaceAt(4)).toBe('a+bxc+d');
});

test('Ctrl+Z in a field steps back through the one canvas history, newest edit first', async ({ page }) => {
  await placeNode(page, 'Math', 400, 300);
  const field = nodes(page).locator('math-field');
  const math = () => field.evaluate((el: HTMLElement & { value: string }) => el.value);
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type('x+1');
  await expect.poll(math).toBe('x+1');
  await page.keyboard.press('Escape');

  await placeNode(page, 'Text', 800, 500);
  await page.locator('.react-flow__node-text .p-4').dblclick();
  const textarea = page.locator('.react-flow__node-text textarea');
  await expect(textarea).toBeFocused();
  await page.waitForTimeout(500); // past the undo coalescing window, so the typing is its own step
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('ab');
  await expect(textarea).toHaveValue('ab');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(textarea).not.toHaveValue('ab');
  expect(await math()).toBe('x+1');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(textarea).toHaveValue('ab');
  expect(await math()).toBe('x+1');

  // In the math field too, Ctrl+Z is the canvas's: the newest edit is the text, not the math.
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(nodes(page).locator('.react-flow__node-text', { hasText: 'ab' })).toHaveCount(0);
  expect(await math()).toBe('x+1');
});

test('math written in black turns light in dark mode', async ({ page }) => {
  await placeNode(page, 'Math');
  const field = nodes(page).locator('math-field');
  await field.click();
  await expect(field).toBeFocused();
  await field.evaluate((el: HTMLElement & { setValue: (v: string) => void }) =>
    el.setValue('\\textcolor{black}{B}'),
  );
  await page.keyboard.press('Escape');
  const color = () =>
    field.evaluate((el) => {
      const atom = el.shadowRoot?.querySelector<HTMLElement>('[style*="color"]');
      return atom ? getComputedStyle(atom).color : null;
    });
  await expect.poll(color).toBe('rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await expect.poll(color).toBe('rgb(255, 255, 255)');
});

test('math pasted in with nested multi-line LaTeX loads, flattened', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const file = {
    app: 'unlined',
    version: 1,
    kind: 'nodes',
    nodes: [
      {
        id: 'm',
        type: 'math',
        position: { x: 0, y: 0 },
        data: { latex: '\\displaylines{a\\\\ \\displaylines{b\\\\ c}}' },
      },
    ],
  };
  await page.evaluate((text) => navigator.clipboard.writeText(text), JSON.stringify(file));
  await page.mouse.move(500, 400);
  await page.keyboard.press('ControlOrMeta+v');
  const field = nodes(page).locator('math-field');
  await expect(field).toHaveCount(1);
  await expect
    .poll(() => field.evaluate((el: HTMLElement & { value: string }) => el.value))
    .toBe('\\displaylines{a\\\\ b\\\\ c}');
  expect(errors).toEqual([]);
});
