import type { MathfieldElement } from 'mathlive';
import { type RefObject, useEffect, useState } from 'react';
import { splitBody } from './evaluate';

/** Where a line of a multi-line field sits, from the field's top, in px. */
export interface LineBox {
  top: number;
  height: number;
}

/** The index of the line a field's LaTeX up to some caret position ends in. */
export const lineOfPrefix = (prefix: string): number =>
  splitBody(prefix.replace(/^\s*\\displaylines\s*\{/, '')).length - 1;

/** Each line's box (by line index; none for a line with nothing in it), read from MathLive's own layout. */
function measure(field: MathfieldElement): (LineBox | undefined)[] {
  const origin = field.getBoundingClientRect().top;
  const edges: { top: number; bottom: number }[] = [];
  for (let offset = 0; offset <= field.lastOffset; offset++) {
    const bounds = field.getElementInfo(offset)?.bounds;
    if (!bounds || bounds.height === 0) continue;
    const line = lineOfPrefix(field.getValue(0, offset, 'latex'));
    const top = bounds.top - origin;
    const bottom = top + bounds.height;
    const edge = edges[line];
    if (edge) {
      edge.top = Math.min(edge.top, top);
      edge.bottom = Math.max(edge.bottom, bottom);
    } else edges[line] = { top, bottom };
  }
  return Array.from(edges, (edge) => edge && { top: edge.top, height: edge.bottom - edge.top });
}

const same = (a: (LineBox | undefined)[], b: (LineBox | undefined)[]) =>
  a.length === b.length && a.every((box, i) => box?.top === b[i]?.top && box?.height === b[i]?.height);

/**
 * The boxes of the lines in the `<math-field>` inside `host`, kept up to date as the field is typed in, resized
 * or its fonts arrive. `latex` is the field's value: a change to it is a reason to measure again.
 */
export function useLineBoxes(host: RefObject<HTMLElement | null>, latex: string): (LineBox | undefined)[] {
  const [boxes, setBoxes] = useState<(LineBox | undefined)[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `latex` is when the field's lines change.
  useEffect(() => {
    const field = host.current?.querySelector<MathfieldElement>('math-field');
    if (!field) return;
    const update = () => {
      const next = measure(field);
      setBoxes((previous) => (same(previous, next) ? previous : next));
    };
    update();
    // MathLive lays out after the value is set, and again when its fonts load or the field's width changes.
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(field);
    document.fonts?.ready.then(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [host, latex]);

  return boxes;
}
