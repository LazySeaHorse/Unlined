import type { XYPosition } from '@xyflow/react';
import { motionOK } from './motion';

/**
 * Moves the app makes for the user (Organise, align, undo, an agent's edit) glide instead of teleporting.
 *
 * `glide(fn)` notes where every node is on screen, runs `fn`, and once the canvas has the new positions animates
 * each moved node from its old place to its new one. Nothing here touches the store: the animation is the CSS
 * `translate` property on React Flow's node element, which composes with the `transform` React Flow owns, so
 * positions, undo and saving never see it. The canvas installs the driver (see useGlide); without one, or with
 * reduced motion, `glide` just runs `fn`.
 */
export interface GlideDriver {
  /** Where each node is drawn now, by id. */
  capture: () => Map<string, XYPosition>;
}

interface Session {
  before: Map<string, XYPosition>;
  /** Still inside `fn` (or its promise): every canvas update in that time glides. */
  open: boolean;
}

let driver: GlideDriver | null = null;
let session: Session | null = null;

/** Lets go of a session this long after `fn` returns if the canvas never updated. */
const SETTLE_MS = 100;

export function setGlideDriver(next: GlideDriver | null): void {
  driver = next;
  session = null;
}

/**
 * Runs `fn`, a store write, and glides the nodes it moves. Returns what `fn` does; a promise keeps gliding until
 * it settles. `from` says where nodes not drawn yet come from, e.g. cards leaving a stack glide out of it.
 */
export function glide<T>(fn: () => T, from?: ReadonlyMap<string, XYPosition>): T {
  // Inside another glide (an agent's tool undoing several steps), the outer one already covers this.
  if (!driver || !motionOK() || session?.open) return fn();
  const before = driver.capture();
  for (const [id, at] of from ?? []) if (!before.has(id)) before.set(id, at);
  const current: Session = { before, open: true };
  session = current;
  const close = () => {
    current.open = false;
    setTimeout(() => {
      if (session === current) session = null;
    }, SETTLE_MS);
  };
  const result = fn();
  if (result instanceof Promise) result.finally(close);
  else close();
  return result;
}

/**
 * For the driver: the canvas just took new positions. Returns where the nodes were before, or null when no glide
 * is waiting. A session still open goes on to the next update, measured from here.
 */
export function takeGlide(): Map<string, XYPosition> | null {
  if (!session || !driver) return null;
  const { before } = session;
  if (session.open) session.before = driver.capture();
  else session = null;
  return before;
}
