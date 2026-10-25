import { flushSync } from 'react-dom';
import { motionOK } from './motion';

/**
 * Applies `update` (a store write, plus anything that must change with it) as a view transition: the browser
 * crossfades the page from before to after. Where that is unsupported, or motion is reduced, it just applies it.
 */
export function viewTransition(update: () => void): void {
  if (!motionOK() || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
