import { afterEach, describe, expect, it, vi } from 'vitest';
import { glide, setGlideDriver, takeGlide } from './glide';

vi.mock('./motion', () => ({ motionOK: () => true }));

const at = (x: number) => new Map([['a', { x, y: 0 }]]);

afterEach(() => setGlideDriver(null));

describe('glide', () => {
  it('just runs fn without a driver', () => {
    expect(glide(() => 7)).toBe(7);
    expect(takeGlide()).toBeNull();
  });

  it('hands the positions from before fn to the next canvas update, once', () => {
    let x = 0;
    setGlideDriver({ capture: () => at(x) });
    glide(() => {
      x = 50;
    });
    expect(takeGlide()).toEqual(at(0));
    expect(takeGlide()).toBeNull();
  });

  it('lets go when the canvas never updates', () => {
    vi.useFakeTimers();
    setGlideDriver({ capture: () => at(0) });
    glide(() => undefined);
    vi.advanceTimersByTime(200);
    expect(takeGlide()).toBeNull();
    vi.useRealTimers();
  });

  it('keeps gliding every update while a promise runs, each from the last', async () => {
    let x = 0;
    setGlideDriver({ capture: () => at(x) });
    let finish = () => {};
    const done = glide(() => new Promise<void>((resolve) => (finish = resolve)));
    x = 10;
    expect(takeGlide()).toEqual(at(0));
    x = 20;
    expect(takeGlide()).toEqual(at(10));
    finish();
    await done;
    expect(takeGlide()).toEqual(at(20));
    expect(takeGlide()).toBeNull();
  });

  it('folds a glide inside another into the outer one', () => {
    let captures = 0;
    setGlideDriver({ capture: () => (captures++, at(0)) });
    glide(() => glide(() => undefined));
    expect(captures).toBe(1);
  });
});
