/**
 * Runs tasks one at a time, in the order they are queued. A task starts when the one before it has finished,
 * whether that succeeded or failed; each caller gets its own task's result or error.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
