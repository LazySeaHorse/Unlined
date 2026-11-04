import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useReadOnly } from '@/canvas/readOnly';
import {
  type Availability,
  checkAvailability,
  downloadModel,
  releaseSessions,
  setServer,
} from './languageModel';
import { LOCAL_PRESETS, type LocalServerConfig, listModels } from './localServer';

/** Whose model answers: the one built into Chrome, or a server on this computer that speaks the OpenAI API. */
export type Provider = 'chrome' | 'server';

interface AiAssistState {
  /** The user's switch. Off by default, and per device (it is not part of any canvas). */
  enabled: boolean;
  availability: Availability;
  /** 0..1 while the model downloads. */
  progress: number;
  provider: Provider;
  /** The server's settings (url, model, key), kept on this device. */
  server: LocalServerConfig;
  /** Models the server offers, as last listed; and why it could not be reached, when it could not. */
  models: string[];
  serverError: string | undefined;
  setProvider: (provider: Provider) => void;
  setServerConfig: (config: Partial<LocalServerConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  refresh: () => Promise<void>;
  /** Starts the download; call it from a click. Resolves when finished or cancelled. */
  download: (signal?: AbortSignal) => Promise<void>;
}

let latest = 0;
let pause: ReturnType<typeof setTimeout> | undefined;

export const useAiAssist = create<AiAssistState>()(
  persist(
    (set, get) => ({
      enabled: false,
      availability: 'unsupported',
      progress: 0,
      provider: 'chrome',
      server: { url: (LOCAL_PRESETS[0] as { url: string }).url, model: '', key: '' },
      models: [],
      serverError: undefined,
      setProvider: (provider) => {
        set({ provider, availability: 'unsupported', models: [], serverError: undefined });
        void get().refresh();
      },
      setServerConfig: (config) => {
        const reach =
          (config.url !== undefined && config.url !== get().server.url) || config.key !== undefined;
        set((s) => ({ server: { ...s.server, ...config }, ...(config.url !== undefined && { models: [] }) }));
        // The model is read at each request, so choosing one needs no new look at the server.
        if (get().provider === 'server') setServer(get().server);
        if (!reach || !get().enabled || get().provider !== 'server') return;
        // Typing an address or key changes it with every key: ask the server once the typing pauses.
        clearTimeout(pause);
        pause = setTimeout(() => void get().refresh(), 400);
      },
      setEnabled: (enabled) => {
        if (!enabled) releaseSessions();
        set({ enabled });
        if (enabled) void get().refresh();
      },
      refresh: async () => {
        const { provider, server } = get();
        setServer(provider === 'server' ? server : undefined);
        // Only the latest look at the model counts.
        const mine = ++latest;
        const current = () => mine === latest;
        if (provider === 'chrome') {
          const availability = await checkAvailability();
          if (current()) set({ availability });
          return;
        }
        // Nothing is sent to a server until the switch is on.
        if (!get().enabled) return;
        try {
          const models = await listModels(server);
          if (!current()) return;
          // Nothing chosen yet: the first model, as the server has it loaded or at hand.
          if (!server.model && models[0]) {
            set((s) => ({ server: { ...s.server, model: models[0] as string } }));
            setServer(get().server);
          }
          set({
            models,
            availability: models.length ? 'available' : 'unavailable',
            serverError: models.length ? undefined : 'The server has no chat models.',
          });
        } catch (e) {
          if (!current()) return;
          set({
            models: [],
            availability: 'unavailable',
            serverError: e instanceof Error && e.message.startsWith('The server') ? e.message : 'unreachable',
          });
        }
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
    {
      name: 'unlined-ai-assist',
      partialize: ({ enabled, provider, server }) => ({ enabled, provider, server }),
    },
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
