/** Durations in milliseconds, the same as the --dur-* tokens in index.css. */
export const DUR_FAST = 120;
export const DUR = 180;
export const DUR_MOVE = 320;
/** How long a node an undo or redo changed stays marked. */
export const HISTORY_FLASH_MS = 900;

/** The --ease-spring and --ease-bounce curves, for animations started from script. */
export const EASE_SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const EASE_BOUNCE =
  'linear(0, 0.14 5%, 0.52 14%, 0.86 24%, 1.03 34%, 1.07 42%, 1.05 52%, 1.01 64%, 0.995 78%, 1)';

const reducedQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/**
 * Whether to animate at all. Every animation started from script asks this first; CSS animations have their own
 * `prefers-reduced-motion` blocks. Also false where the Web Animations API is missing (jsdom in unit tests).
 */
export function motionOK(): boolean {
  return !reducedQuery?.matches && typeof Element !== 'undefined' && 'animate' in Element.prototype;
}

/** Runs `fn` once a change has been drawn: after React and the components below it (some sync in an effect). */
export function afterRender(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
