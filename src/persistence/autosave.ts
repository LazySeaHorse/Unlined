import { createSerialQueue } from '@/lib/serialQueue';

const MAX_RETRY_MS = 30_000;

/**
 * Debounced saver: `schedule()` on every change, `flush()` when the save must happen now (switching canvases,
 * closing the tab).
 *
 * A change is an `edit` or only a `view` change (pan, zoom); the save is told whether an edit is among those it
 * covers. A save that fails keeps its changes pending and is tried again with growing pauses, so nothing is lost
 * until a later save succeeds. Saves run one at a time.
 */
export function createAutosave(
  save: (edited: boolean) => Promise<void>,
  delayMs = 500,
  onError?: (error: unknown) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: 'view' | 'edit' | undefined;
  let failures = 0;
  const queue = createSerialQueue();

  const note = (level: 'view' | 'edit') => {
    pending = pending === 'edit' || level === 'edit' ? 'edit' : 'view';
  };

  /** Saves what is pending. Resolves to whether everything is saved now; never rejects. */
  const flush = (): Promise<boolean> => {
    clearTimeout(timer);
    return queue(async () => {
      if (!pending) return true;
      const level = pending;
      // Changes that arrive while saving make it pending again, and get a save of their own.
      pending = undefined;
      try {
        await save(level === 'edit');
        failures = 0;
        return true;
      } catch (error) {
        note(level);
        failures++;
        onError?.(error);
        clearTimeout(timer);
        timer = setTimeout(flush, Math.min(delayMs * 2 ** failures, MAX_RETRY_MS));
        return false;
      }
    });
  };

  return {
    schedule(level: 'view' | 'edit' = 'edit') {
      note(level);
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    /** Drops pending changes without saving. */
    cancel() {
      pending = undefined;
      failures = 0;
      clearTimeout(timer);
    },
  };
}
