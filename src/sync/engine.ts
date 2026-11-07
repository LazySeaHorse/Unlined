import { create } from 'zustand';
import { createSerialQueue } from '@/lib/serialQueue';
import * as repo from '@/persistence/canvasRepo';
import * as workspace from '@/store/workspace';
import { Cloud, type CloudEntry, type PushJob } from './cloud';
import { SyncError, type SyncErrorKind } from './errors';
import { jsonbin } from './jsonbin';
import { keepLocalImages } from './pack';
import { isConfigured, useSyncSettings } from './settings';
import { compareAll, pullable, pushable } from './status';

/**
 * Runs cloud sync against this device's canvases. `check` looks at the cloud and remembers what it found;
 * the status of each canvas is then worked out from that and from what is on the device (see `compareAll`),
 * so it stays right as canvases are edited. Push and pull never decide for themselves what to overwrite:
 * the caller has already asked.
 */

interface SyncState {
  /** The cloud's canvases as of the last check; null before any. */
  entries: Record<string, CloudEntry> | null;
  checkedAt: number | null;
  /** Ids of canvases being synced, or every one while a bulk action runs. */
  busy: string[] | 'all';
}

export const useSync = create<SyncState>(() => ({ entries: null, checkedAt: null, busy: [] }));

let session: { signature: string; cloud: Promise<Cloud> } | undefined;

const settingsOrThrow = () => {
  const settings = useSyncSettings.getState();
  if (!isConfigured(settings)) throw new SyncError('other', 'Set up cloud sync first.');
  return settings;
};

/** The cloud save for the current settings; the password is only stretched into a key once per session. */
function cloudOf(): Promise<Cloud> {
  const { key, keyKind, manifestId, password } = settingsOrThrow();
  const signature = JSON.stringify([key, keyKind, manifestId, password]);
  if (session?.signature !== signature) {
    const cloud = Cloud.connect(jsonbin(key, keyKind), manifestId, password);
    const mine = { signature, cloud };
    session = mine;
    // A failed connection is not kept, so fixing the settings (or the network) and trying again works.
    cloud.catch(() => {
      if (session === mine) session = undefined;
    });
  }
  return session.cloud;
}

/**
 * Checks `key` and `password` against the save in bin `manifestId`, or against a new save if there is none
 * yet, and returns the bin's id. Settings are not touched.
 */
export async function connect(options: {
  key: string;
  keyKind: 'master' | 'access';
  manifestId: string;
  password: string;
}): Promise<string> {
  const store = jsonbin(options.key, options.keyKind);
  const cloud = options.manifestId
    ? await Cloud.connect(store, options.manifestId, options.password)
    : await Cloud.create(store, options.password);
  return cloud.manifestId;
}

/** One thing at a time: two pushes at once could swap each other's changes to the index. */
const exclusive = createSerialQueue();

const markBusy = async <T>(ids: string[] | 'all', task: () => Promise<T>): Promise<T> => {
  useSync.setState({ busy: ids });
  try {
    return await task();
  } finally {
    useSync.setState({ busy: [] });
  }
};

const remember = (patch: Record<string, CloudEntry>) =>
  useSync.setState((s) => ({ entries: { ...s.entries, ...patch } }));

async function lookAtCloud(): Promise<Record<string, CloudEntry>> {
  const entries = (await (await cloudOf()).readIndex()).canvases;
  useSync.setState({ entries, checkedAt: Date.now() });
  return entries;
}

/**
 * Sends these canvases to the cloud in one go: with a single write to the cloud's index. A canvas missing
 * here is only pushed as a deletion if it was synced, which is what its sync record shows.
 */
async function sendCanvases(ids: string[]): Promise<{ failed: { id: string; error: SyncError }[] }> {
  await workspace.flushSave();
  const cloud = await cloudOf();
  const jobs: PushJob[] = [];
  const failed: { id: string; error: SyncError }[] = [];
  const edited = new Map<string, number>();
  for (const id of ids) {
    const meta = await repo.getCanvas(id);
    if (meta) {
      edited.set(id, meta.updatedAt);
      jobs.push({ id, canvas: { name: meta.name, content: await repo.loadContent(id) } });
    } else if (await repo.getSyncRecord(id)) {
      jobs.push({ id, canvas: null });
    } else {
      failed.push({ id, error: new SyncError('not-found', 'That canvas is not on this device.') });
    }
  }
  const sent = await cloud.pushMany(jobs);
  for (const [id, entry] of Object.entries(sent.entries)) {
    if (entry.deleted) await repo.forgetSyncRecord(id);
    else await repo.putSyncRecord({ id, rev: entry.rev, localUpdatedAt: edited.get(id) ?? 0 });
  }
  remember(sent.entries);
  return { failed: [...failed, ...sent.failed] };
}

async function sendCanvas(id: string): Promise<void> {
  const { failed } = await sendCanvases([id]);
  if (failed[0]) throw failed[0].error;
}

async function fetchCanvas(id: string): Promise<void> {
  await workspace.flushSave();
  const { entry, canvas } = await (await cloudOf()).pull(id);
  if (!canvas) {
    // Deleted in the cloud: the canvas goes from here too.
    await workspace.removeCanvas(id);
    await repo.forgetSyncRecord(id);
    remember({ [id]: entry });
    return;
  }
  const nodes = keepLocalImages(canvas.content.nodes, (await repo.loadContent(id)).nodes);
  await workspace.savePulledCanvas(id, canvas.name, { ...canvas.content, nodes }, entry.rev);
  remember({ [id]: entry });
}

/** Looks at the cloud, to see which canvases differ. Changes nothing. */
export const check = () => exclusive(() => markBusy('all', async () => void (await lookAtCloud())));

export const push = (id: string) => exclusive(() => markBusy([id], () => sendCanvas(id)));

export const pull = (id: string) => exclusive(() => markBusy([id], () => fetchCanvas(id)));

export interface BulkResult {
  done: number;
  failed: { id: string; message: string }[];
}

/** After these the rest would fail the same way, so a bulk action stops instead of trying each. */
const FATAL: SyncErrorKind[] = ['auth', 'password', 'network', 'rate-limit'];

/**
 * Pushes (or pulls) every canvas that can go without overwriting changes: those only changed on this side,
 * or missing on the other. Deletions travel too: a canvas deleted on one side is deleted on the other. Canvases changed on both sides are left for the user to settle one by one.
 */
export const syncAll = (direction: 'push' | 'pull') =>
  exclusive(() =>
    markBusy('all', async () => {
      const entries = useSync.getState().entries ?? (await lookAtCloud());
      const { statuses, cloudOnly, deletedHere } = compareAll(
        await repo.listCanvases(),
        await repo.listSyncRecords(),
        entries,
      );
      const ids =
        direction === 'push'
          ? [...Object.keys(statuses).filter((id) => pushable(statuses[id])), ...deletedHere.map((c) => c.id)]
          : [...Object.keys(statuses).filter((id) => pullable(statuses[id])), ...cloudOnly.map((c) => c.id)];
      const result: BulkResult = { done: 0, failed: [] };
      if (direction === 'push') {
        const { failed } = await sendCanvases(ids);
        result.done = ids.length - failed.length;
        result.failed = failed.map(({ id, error }) => ({ id, message: error.message }));
        return result;
      }
      for (const id of ids) {
        try {
          await fetchCanvas(id);
          result.done++;
        } catch (error) {
          if (!(error instanceof SyncError)) throw error;
          result.failed.push({ id, message: error.message });
          if (FATAL.includes(error.kind)) break;
        }
      }
      return result;
    }),
  );

/** Drops what was learned of the cloud, e.g. after the settings changed. */
export function reset() {
  session = undefined;
  useSync.setState({ entries: null, checkedAt: null, busy: [] });
}

/**
 * Where every canvas stands, for deciding what an action would overwrite. It goes by the last check, and
 * only looks at the cloud if there has been none: refreshing is up to the user.
 */
export async function inspect() {
  if (!useSync.getState().entries) await check();
  return compareAll(
    await repo.listCanvases(),
    await repo.listSyncRecords(),
    useSync.getState().entries ?? {},
  );
}
