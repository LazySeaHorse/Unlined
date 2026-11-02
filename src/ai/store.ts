import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useReadOnly } from '@/canvas/readOnly';
import { type Availability, checkAvailability, downloadModel, releaseSessions } from './languageModel';

interface AiAssistState {
  /** The user's switch. Off by default, and per device (it is not part of any canvas). */
  enabled: boolean;
  availability: Availability;
  /** 0..1 while the model downloads. */
  progress: number;
  setEnabled: (enabled: boolean) => void;
  refresh: () => Promise<void>;
  /** Starts the download; call it from a click. Resolves when finished or cancelled. */
  download: (signal?: AbortSignal) => Promise<void>;
}

export const useAiAssist = create<AiAssistState>()(
  persist(
    (set, get) => ({
      enabled: false,
      availability: 'unsupported',
      progress: 0,
      setEnabled: (enabled) => {
        if (!enabled) releaseSessions();
        set({ enabled });
        if (enabled) void get().refresh();
      },
      refresh: async () => {
        set({ availability: await checkAvailability() });
      },
      download: async (signal) => {
        set({ availability: 'downloading', progress: 0 });
        try {
          await downloadModel((progress) => set({ progress }), signal);
        } catch {
          // Cancelled or failed: the availability check below says which.
        }
        await get().refresh();
      },
    }),
    { name: 'unlined-ai-assist', partialize: ({ enabled }) => ({ enabled }) },
  ),
);

/** The setting is on and the model is on this device. */
export const aiAvailable = (s: Pick<AiAssistState, 'enabled' | 'availability'>): boolean =>
  s.enabled && s.availability === 'available';

/**
 * True when on-device AI can be used right now. Every AI control renders nothing otherwise, so nothing is reserved
 * for it. The read-only context covers the phone viewer and the moments an agent is editing.
 */
export function useAiReady(): boolean {
  const readOnly = useReadOnly();
  return useAiAssist(aiAvailable) && !readOnly;
}

/** Checks the model once at startup, but only for people who switched it on. */
export function initAiAssist(): void {
  if (useAiAssist.getState().enabled) void useAiAssist.getState().refresh();
}
