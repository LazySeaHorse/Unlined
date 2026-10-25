import { create } from 'zustand';
import { mark } from '@/motion/marks';

/** How long the canvas stays locked for the user after the agent's last edit. */
export const LOCK_MS = 8000;
/** How long nodes the agent changed stay highlighted. */
export const TOUCH_HIGHLIGHT_MS = 1600;

interface AgentState {
  /** Master switch, off on every page load. While false every tool call is refused. */
  enabled: boolean;
  /** True while the agent is editing: the canvas is read-only for the user. */
  locked: boolean;
  bridgeConnected: boolean;
  /** Tools registered with the browser's WebMCP API (0 when unsupported). */
  webMcpTools: number;
  setEnabled: (enabled: boolean) => void;
  setBridgeConnected: (connected: boolean) => void;
  setWebMcpTools: (count: number) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  enabled: false,
  locked: false,
  bridgeConnected: false,
  webMcpTools: 0,
  setEnabled: (enabled) => {
    if (!enabled) releaseLock();
    set({ enabled });
  },
  setBridgeConnected: (bridgeConnected) => set({ bridgeConnected }),
  setWebMcpTools: (webMcpTools) => set({ webMcpTools }),
}));

let lockTimer: ReturnType<typeof setTimeout> | undefined;

/** Locks the canvas for the user, or extends the lock, until LOCK_MS after the latest call. */
export function holdLock(): void {
  clearTimeout(lockTimer);
  if (!useAgentStore.getState().locked) useAgentStore.setState({ locked: true });
  lockTimer = setTimeout(releaseLock, LOCK_MS);
}

export function releaseLock(): void {
  clearTimeout(lockTimer);
  if (useAgentStore.getState().locked) useAgentStore.setState({ locked: false });
}

/** Highlights nodes the agent changed, for a moment. */
export function markTouched(ids: string[]): void {
  mark(ids, 'ai-touched', TOUCH_HIGHLIGHT_MS);
}
