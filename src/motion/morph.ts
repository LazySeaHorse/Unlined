import { EASE_SPRING, motionOK } from './motion';

/**
 * A row that grows into the panel it opens, and the panel shrinking back into the row.
 *
 * The panel is an absolutely positioned box with overflow hidden, and its one child holds the content at the final
 * size, so only the box changes size: text never re-wraps, and the border and shadow stay real. The panel's `header`
 * lands exactly on the row, so the row looks as if it became the header. Only the DOM is touched here.
 */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OPEN_MS = 240;
const CLOSE_MS = 160;
const FADE_MS = 60;
/** How much wider a panel is than the one it opened from. */
const GROW = 24;
/** The space a panel keeps from the edges of the window. */
const MARGIN = 8;

const frame = ({ x, y, width, height }: Box) => ({
  left: `${x}px`,
  top: `${y}px`,
  width: `${width}px`,
  height: `${height}px`,
});

/** Where the panel's left and top are measured from, in window coordinates. */
function originOf(panel: HTMLElement) {
  const parent = panel.offsetParent ?? document.body;
  const rect = parent.getBoundingClientRect();
  return { x: rect.left + parent.clientLeft, y: rect.top + parent.clientTop };
}

/** The box that puts the panel's header exactly over the row, in the panel's coordinates. */
function overRow(row: HTMLElement, panel: HTMLElement, header: HTMLElement): Box {
  const origin = originOf(panel);
  const r = row.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const h = header.getBoundingClientRect();
  const insetX = h.left - p.left;
  const insetY = h.top - p.top;
  return {
    x: r.left - insetX - origin.x,
    y: r.top - insetY - origin.y,
    width: r.width + 2 * insetX,
    height: r.height + 2 * insetY,
  };
}

/** Lays the panel out over the row, inside the window, and grows it out of the row. */
export function growFromRow(row: HTMLElement, panel: HTMLElement, header: HTMLElement): void {
  const from = overRow(row, panel, header);
  const origin = originOf(panel);
  const width = Math.min(from.width + GROW, window.innerWidth - 2 * MARGIN);
  const maxHeight = window.innerHeight - 2 * MARGIN;
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  const content = panel.firstElementChild as HTMLElement;
  content.style.width = `${panel.clientWidth}px`;
  content.style.maxHeight = `${maxHeight - 2 * panel.clientTop}px`;

  const height = panel.offsetHeight;
  const inside = (start: number, size: number, room: number) =>
    Math.max(MARGIN, Math.min(start, room - MARGIN - size));
  const to = {
    x: inside(origin.x + from.x - GROW / 2, width, window.innerWidth) - origin.x,
    y: inside(origin.y + from.y, height, window.innerHeight) - origin.y,
    width,
    height,
  };
  panel.style.left = `${to.x}px`;
  panel.style.top = `${to.y}px`;

  if (!motionOK()) return;
  panel.animate([frame(from), frame(to)], { duration: OPEN_MS, easing: EASE_SPRING });
  panel.animate({ opacity: [0, 1] }, { duration: FADE_MS });
}

/** Shrinks the panel from wherever it is now back into the row. Resolves when it has gone. */
export async function shrinkToRow(row: HTMLElement, panel: HTMLElement, header: HTMLElement): Promise<void> {
  if (!motionOK()) return;
  const origin = originOf(panel);
  const { left, top, width, height } = panel.getBoundingClientRect();
  const now = { x: left - origin.x, y: top - origin.y, width, height };
  panel.animate([frame(now), frame(overRow(row, panel, header))], {
    duration: CLOSE_MS,
    easing: EASE_SPRING,
    fill: 'forwards',
  });
  await panel.animate({ opacity: [1, 0] }, { delay: CLOSE_MS - FADE_MS, duration: FADE_MS, fill: 'forwards' })
    .finished;
}
