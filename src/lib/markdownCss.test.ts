import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? cssFiles(join(dir, entry.name))
      : entry.name.endsWith('.css')
        ? [join(dir, entry.name)]
        : [],
  );

describe('the app stylesheets', () => {
  // `[class~="x"] *` (as Tailwind Typography's `not-prose` guard writes it) ties the style of every descendant to
  // the `class` of its ancestors, so the browser re-styles a whole subtree whenever one `class` changes. React Flow
  // changes the pane's the moment a pan starts, which on a big canvas stalled every pan for 200ms and more.
  it('never match an element by a class attribute on one of its ancestors', () => {
    const offending = cssFiles('src').flatMap((file) =>
      readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => /\[class[^\]]*\]\s*[ >+~]\s*[*\w.:[]/.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(offending).toEqual([]);
  });
});
