import { create } from 'zustand';

/**
 * Short-lived classes on nodes: "just added", "an agent changed this", "undo touched this". Each mark is a CSS
 * class the canvas puts on the node until it expires. View state only: never saved, never undoable.
 */
interface MarksState {
  /** Node id → the classes it carries, space-separated. */
  marks: ReadonlyMap<string, string>;
}

export const useMarks = create<MarksState>()(() => ({ marks: new Map() }));

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function withClass(marks: ReadonlyMap<string, string>, ids: string[], name: string) {
  const next = new Map(marks);
  for (const id of ids) {
    const classes = new Set(next.get(id)?.split(' '));
    classes.add(name);
    next.set(id, [...classes].join(' '));
  }
  return next;
}

function withoutClass(marks: ReadonlyMap<string, string>, name: string) {
  const next = new Map<string, string>();
  for (const [id, classes] of marks) {
    const rest = classes.split(' ').filter((c) => c !== name);
    if (rest.length > 0) next.set(id, rest.join(' '));
  }
  return next;
}

/**
 * Puts class `name` on nodes `ids` for `ms`. Marking again with the same name before it expires extends every
 * node carrying it, so a burst of changes fades out together.
 */
export function mark(ids: Iterable<string>, name: string, ms: number): void {
  const list = [...ids];
  if (list.length === 0) return;
  useMarks.setState((s) => ({ marks: withClass(s.marks, list, name) }));
  clearTimeout(timers.get(name));
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      useMarks.setState((s) => ({ marks: withoutClass(s.marks, name) }));
    }, ms),
  );
}
