import { useLiveQuery } from 'dexie-react-hooks';
import { Boxes, Clock, Download, Library, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { downloadJson, slugify } from '@/lib/files';
import { placedNodes } from '@/lib/stacks';
import { timeAgo } from '@/lib/time';
import type { CanvasContent, CanvasMeta } from '@/model/types';
import { listSyncRecords, loadContent } from '@/persistence/canvasRepo';
import * as workspace from '@/store/workspace';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { askText, confirmAction } from '@/ui/dialogs';
import { EmptyState } from '@/ui/EmptyState';
import { Mascot } from '@/ui/Mascot';
import { Modal } from '@/ui/Modal';
import { CanvasSyncRow, CloudOnlyList, SyncBar, useSyncEnabled } from './CloudSync';
import { promptNewCanvas } from './newCanvas';
import { SyncSettings } from './SyncSettings';
import { useCanvasList } from './useCurrentCanvas';

interface CanvasManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** View-only mode: open canvases, but no create/rename/delete. */
  readOnly?: boolean;
}

const THUMB = { width: 64, height: 44, pad: 4 };

/** A tiny map of where the nodes sit, drawn from the saved content. */
function Thumbnail({ content }: { content: CanvasContent | undefined }) {
  const boxes = useMemo(() => {
    const nodes = placedNodes(content?.nodes ?? []);
    if (nodes.length === 0) return [];
    const rects = nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width ?? n.width ?? 160,
      h: n.measured?.height ?? n.height ?? 80,
    }));
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const spanX = Math.max(...rects.map((r) => r.x + r.w)) - minX;
    const spanY = Math.max(...rects.map((r) => r.y + r.h)) - minY;
    const scale = Math.min((THUMB.width - THUMB.pad * 2) / spanX, (THUMB.height - THUMB.pad * 2) / spanY);
    const offsetX = (THUMB.width - spanX * scale) / 2;
    const offsetY = (THUMB.height - spanY * scale) / 2;
    return rects.map((r) => ({
      x: offsetX + (r.x - minX) * scale,
      y: offsetY + (r.y - minY) * scale,
      w: Math.max(2, r.w * scale),
      h: Math.max(2, r.h * scale),
    }));
  }, [content]);

  return (
    <svg
      width={THUMB.width}
      height={THUMB.height}
      role="img"
      aria-label="Canvas preview"
      className="shrink-0 rounded-lg border border-border bg-canvas"
    >
      {boxes.map((b) => (
        <rect
          key={`${b.x}:${b.y}`}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={1.5}
          className="fill-accent/60"
        />
      ))}
    </svg>
  );
}

function CanvasRow({
  canvas,
  current,
  readOnly,
  syncing,
  onOpen,
}: {
  canvas: CanvasMeta;
  current: boolean;
  readOnly: boolean;
  /** Whether cloud sync is set up, which adds a line of sync controls. */
  syncing: boolean;
  onOpen: () => void;
}) {
  const content = useLiveQuery(() => loadContent(canvas.id), [canvas.id, canvas.updatedAt]);
  const count = content?.nodes.length;

  const rename = async () => {
    const name = await askText({
      title: 'Rename canvas',
      label: 'Name',
      initial: canvas.name,
      hero: { mood: 'idle', scene: 'canvas' },
    });
    if (name !== null) await workspace.renameCanvas(canvas.id, name);
  };

  const exportOne = async () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`${slugify(canvas.name)}-${date}.json`, await workspace.exportCanvasById(canvas.id));
  };

  const remove = async () => {
    const synced = (await listSyncRecords()).some((r) => r.id === canvas.id);
    const confirmed = await confirmAction({
      title: 'Delete canvas?',
      message: synced
        ? `"${canvas.name}" will be deleted from this device. Its cloud copy stays until you push the deletion.`
        : `"${canvas.name}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      destructive: true,
      hero: { mood: 'nervous', scene: 'delete' },
    });
    if (confirmed) await workspace.removeCanvas(canvas.id);
  };

  return (
    <li
      className={cn(
        'group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border p-2.5 transition-colors',
        current
          ? 'border-accent/50 bg-accent/5'
          : 'border-border hover:border-accent/30 hover:bg-surface-2/60',
      )}
    >
      <Thumbnail content={content} />
      <button
        type="button"
        aria-label={`Open ${canvas.name}`}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left"
        onClick={onOpen}
      >
        <span className="flex w-full items-center gap-2">
          <span className="truncate text-sm font-medium">{canvas.name}</span>
          {current && (
            <Badge variant="info" size="sm">
              Open
            </Badge>
          )}
        </span>
        <span className="mt-1 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {timeAgo(canvas.updatedAt)}
          </span>
          {count !== undefined && (
            <span className="flex items-center gap-1">
              <Boxes className="size-3" />
              {count} {count === 1 ? 'node' : 'nodes'}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        {!readOnly && (
          <div
            className={cn(
              'flex transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0',
              current && 'sm:opacity-100',
            )}
          >
            <IconButton icon={Pencil} label="Rename" size="sm" onClick={() => void rename()} />
            <IconButton icon={Download} label="Export" size="sm" onClick={() => void exportOne()} />
            <IconButton
              icon={Trash2}
              label="Delete"
              size="sm"
              className="hover:bg-danger/10 hover:text-danger"
              onClick={() => void remove()}
            />
          </div>
        )}
        {!current && (
          <Button variant="primary" size="sm" onClick={onOpen}>
            Open
          </Button>
        )}
      </div>
      {syncing && <CanvasSyncRow id={canvas.id} name={canvas.name} pullOnly={readOnly} />}
    </li>
  );
}

export function CanvasManager({ open, onOpenChange, readOnly = false }: CanvasManagerProps) {
  const canvases = useCanvasList();
  const currentId = workspace.useWorkspace((s) => s.currentId);
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const syncing = useSyncEnabled();
  const close = () => onOpenChange(false);

  const create = async () => {
    const name = await promptNewCanvas();
    if (name === null) return;
    await workspace.newCanvas(name);
    close();
  };

  const visible = canvases?.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
      title="Canvases"
      icon={<Library />}
      description="Open, rename or delete your canvases. They are stored in this browser."
      className="max-w-xl"
      footer={
        <div className="flex w-full flex-col gap-3">
          <SyncBar pullOnly={readOnly} onOpenSettings={() => setSettingsOpen(true)} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {canvases?.length ?? 0} canvas{canvases?.length === 1 ? '' : 'es'}
            </span>
            <Button className="h-9 rounded-xl border border-border px-5" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 flex gap-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted focus-within:border-accent">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search canvases"
            aria-label="Search canvases"
            className="w-full bg-transparent text-fg outline-none placeholder:text-muted"
          />
        </label>
        {!readOnly && (
          <Button variant="primary" className="h-9 shrink-0" onClick={create}>
            <Plus className="size-4" /> New canvas
          </Button>
        )}
      </div>
      {visible && visible.length === 0 ? (
        <EmptyState
          size="compact"
          mascot={<Mascot mood="map" className="h-20" />}
          title={query ? 'No matches' : 'No canvases yet'}
          description={query ? 'Try a different name.' : 'Create one to get started.'}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible?.map((canvas) => (
            <CanvasRow
              key={canvas.id}
              canvas={canvas}
              current={canvas.id === currentId}
              readOnly={readOnly}
              syncing={syncing}
              onOpen={async () => {
                await workspace.openCanvas(canvas.id);
                close();
              }}
            />
          ))}
        </ul>
      )}
      {syncing && <CloudOnlyList pullOnly={readOnly} />}
      <SyncSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Modal>
  );
}
