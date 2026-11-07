import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serialQueue';

describe('createSerialQueue', () => {
  it('never runs two tasks at once, and keeps the order', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([queue(task('a', 20)), queue(task('b', 1))]);
    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('runs on after a task failed, and passes each result to its own caller', async () => {
    const queue = createSerialQueue();
    const failing = queue(async () => {
      throw new Error('boom');
    });
    const next = queue(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
