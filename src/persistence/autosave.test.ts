import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createAutosave', () => {
  it('saves once after changes settle', async () => {
    const save = vi.fn(async () => {});
    const autosave = createAutosave(save, 100);
    autosave.schedule();
    vi.advanceTimersByTime(50);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately and only when dirty', async () => {
    const save = vi.fn(async () => {});
    const autosave = createAutosave(save, 100);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
    autosave.schedule();
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel drops pending changes', () => {
    const save = vi.fn(async () => {});
    const autosave = createAutosave(save, 100);
    autosave.schedule();
    autosave.cancel();
    vi.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
  });

  it('tells the save whether an edit is among the changes', async () => {
    const save = vi.fn(async (_edited: boolean) => {});
    const autosave = createAutosave(save, 100);
    autosave.schedule('view');
    await autosave.flush();
    autosave.schedule('view');
    autosave.schedule('edit');
    autosave.schedule('view');
    await autosave.flush();
    expect(save.mock.calls).toEqual([[false], [true]]);
  });

  it('keeps changes whose save failed, and tries again', async () => {
    const save = vi.fn(async (_edited: boolean) => {}).mockRejectedValueOnce(new Error('quota'));
    const onError = vi.fn();
    const autosave = createAutosave(save, 100, onError);
    autosave.schedule();
    expect(await autosave.flush()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await autosave.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(true);
  });

  it('retries a failed save by itself, after a growing pause', async () => {
    const save = vi.fn(async (_edited: boolean) => {}).mockRejectedValueOnce(new Error('quota'));
    const autosave = createAutosave(save, 100);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not lose a change made while a save is running', async () => {
    let finish = () => {};
    const save = vi
      .fn(async (_edited: boolean) => {})
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const autosave = createAutosave(save, 100);
    autosave.schedule();
    const first = autosave.flush();
    await vi.advanceTimersByTimeAsync(0); // the save is running
    autosave.schedule();
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('never runs two saves at once', async () => {
    let running = 0;
    let most = 0;
    const save = vi.fn(async (_edited: boolean) => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running--;
    });
    const autosave = createAutosave(save, 5);
    autosave.schedule();
    const first = autosave.flush();
    await vi.advanceTimersByTimeAsync(0); // the first save is running
    autosave.schedule();
    const second = autosave.flush();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });
});
