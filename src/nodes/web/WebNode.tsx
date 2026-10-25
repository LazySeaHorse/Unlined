import type { NodeProps } from '@xyflow/react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, X } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import type { NodeDataMap, NodeOf } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { NodeShell } from '../NodeShell';
import { useHiddenInStack, usePlacedId } from '../stack/cardContext';
import { type FrameCommand, parseFrameState, sendFrameCommand } from './frameMessages';
import { hostnameOf, normaliseWebUrl } from './url';
import { useNearScreen } from './useLoaded';
import { useWebExtension } from './useWebExtension';

/** No `allow-top-navigation`: a page that tries to break out of its frame stays in it. */
const SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
const ALLOW =
  'clipboard-read; clipboard-write; fullscreen; microphone; autoplay; encrypted-media; picture-in-picture';
/** How long after a page loads the extension's script has to report in before the page is taken to be without it. */
const REPORT_WAIT_MS = 1500;

/**
 * Saves where the page is now. Browsing is not an edit: it leaves undo history alone, so Ctrl+Z
 * never drags a page back and a redo stack survives a click on a link.
 */
function recordPage(id: string, patch: Partial<NodeDataMap['web']>) {
  const { nodes, updateNodeData } = useCanvasStore.getState();
  const current = nodes.find((n) => n.id === id)?.data as Partial<NodeDataMap['web']> | undefined;
  if (!current || (Object.keys(patch) as (keyof typeof patch)[]).every((k) => current[k] === patch[k]))
    return;
  const history = useCanvasStore.temporal.getState();
  const tracking = history.isTracking;
  if (tracking) history.pause();
  updateNodeData<'web'>(id, patch);
  if (tracking) history.resume();
}

function BarButton({
  icon: Icon,
  label,
  ...props
}: { icon: typeof Globe; label: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      {...props}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/** Address field: shows the page's address, and takes a new one on Enter. */
function AddressBar({
  url,
  favicon,
  readOnly,
  onSubmit,
}: {
  url: string;
  favicon?: string;
  readOnly: boolean;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [brokenIcon, setBrokenIcon] = useState<string>();
  return (
    <div className="relative min-w-0 flex-1">
      {favicon && favicon !== brokenIcon ? (
        <img
          src={favicon}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBrokenIcon(favicon)}
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
        />
      ) : (
        <Globe className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted" />
      )}
      <input
        aria-label="Web address"
        value={draft ?? url}
        readOnly={readOnly}
        spellCheck={false}
        placeholder="Enter a web address"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== null) {
            onSubmit(draft);
            setDraft(null);
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className="w-full min-w-0 rounded border border-border bg-surface py-0.5 pr-2 pl-7 text-xs text-fg outline-none placeholder:text-muted focus:border-accent"
      />
    </div>
  );
}

export function WebNode({ id, data, selected, dragging }: NodeProps<NodeOf<'web'>>) {
  const readOnly = useReadOnly();
  const [resizing, setResizing] = useState(false);
  const extension = useWebExtension();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  // What the iframe is told to load. A remount (new `id`) is how a page is reloaded from scratch.
  const [launch, setLaunch] = useState(() => ({ url: normaliseWebUrl(data.url), id: 0 }));
  // The latest report from the page in the frame; null while it has none, e.g. without the extension.
  const [page, setPage] = useState<ReturnType<typeof parseFrameState>>(null);
  // The address last saved by this node, to tell the page's own navigation from an edit made elsewhere.
  const saved = useRef(data.url);
  const reportTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reportedAt = useRef(0);

  // Only http(s) addresses reach the iframe: a `javascript:` URL from an imported file would run in this app.
  const address = normaliseWebUrl(data.url);
  // An iframe swallows mouse events, so it only becomes interactive once its node is selected and still.
  const interactive = selected && !dragging && !resizing;
  // Far from the screen, or behind another card of its stack, the page is unmounted to give its memory and CPU
  // back; it resumes where it was. A node set to keep its page loaded is the exception.
  const hidden = useHiddenInStack();
  const near = useNearScreen(usePlacedId(id)) && !hidden;
  const wanted = data.keepLoaded || near || selected;
  // Unless the node loads by itself, a click is what starts its page, each time it has been unloaded.
  const [started, setStarted] = useState(false);
  const loaded = wanted && (data.autoLoad || started);
  useEffect(() => {
    if (!wanted) setStarted(false);
  }, [wanted]);

  const relaunch = (url: string | null) => {
    setPage(null);
    setLaunch((l) => ({ url, id: l.id + 1 }));
  };

  const openInTab = () => address && window.open(address, '_blank', 'noopener,noreferrer');

  const command = (cmd: FrameCommand) => sendFrameCommand(iframe.current?.contentWindow, cmd);

  /** Opens `url`: in the page's own history when the extension is there to do it, else by reloading the frame. */
  const navigate = (url: string) => (page ? command({ navigate: url }) : relaunch(url));

  const submit = (text: string) => {
    const url = normaliseWebUrl(text);
    if (!url) return;
    saved.current = url;
    recordPage(id, { url, pageTitle: undefined });
    if (url === address) reload();
    else navigate(url);
  };

  const reload = () => {
    setStarted(true);
    if (page) command('reload');
    else relaunch(address);
  };

  // The saved address is where an unloaded page picks up again.
  const unload = useEffectEvent(() => relaunch(normaliseWebUrl(data.url)));
  useEffect(() => {
    if (!loaded) unload();
  }, [loaded]);

  // The page reported in. Its own address is saved without being loaded again.
  const onMessage = useEffectEvent((event: MessageEvent) => {
    if (!iframe.current || event.source !== iframe.current.contentWindow) return;
    const next = parseFrameState(event.data);
    if (!next) return;
    clearTimeout(reportTimer.current);
    reportedAt.current = performance.now();
    setPage(next);
    saved.current = next.url;
    recordPage(id, { url: next.url, pageTitle: next.title || undefined });
  });
  useEffect(() => {
    const listen = (event: MessageEvent) => onMessage(event);
    window.addEventListener('message', listen);
    return () => {
      window.removeEventListener('message', listen);
      clearTimeout(reportTimer.current);
    };
  }, []);

  // An address changed from outside (an agent's edit) takes the frame there. Undo is left alone: it
  // rewinds the saved address, not the page, which would lose whatever is open in it.
  const followEdit = useEffectEvent(() => {
    if (data.url === saved.current) return;
    saved.current = data.url;
    if (readOnly && address) navigate(address);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the saved address changes.
  useEffect(() => followEdit(), [data.url]);

  return (
    <NodeShell
      kind="web"
      selected={selected}
      live={interactive}
      // The page's own title heads the node, until the user names it.
      title={data.pageTitle || undefined}
      customTitle={data.title}
      tint={data.color}
      resize={{ minWidth: 320, minHeight: 240, onResizing: setResizing }}
      toolbar={
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-0.5">
          <BarButton
            icon={ArrowLeft}
            label="Back"
            disabled={!page?.canGoBack}
            onClick={() => command('back')}
          />
          <BarButton
            icon={ArrowRight}
            label="Forward"
            disabled={!page?.canGoForward}
            onClick={() => command('forward')}
          />
          <BarButton icon={RotateCw} label="Reload" disabled={!address} onClick={reload} />
          <AddressBar url={data.url} favicon={page?.favicon} readOnly={readOnly} onSubmit={submit} />
          <BarButton icon={ExternalLink} label="Open in tab" disabled={!address} onClick={openInTab} />
        </div>
      }
    >
      {!launch.url ? (
        <Hint>Type a web address above and press Enter.</Hint>
      ) : !loaded ? (
        <Sleeping title={data.pageTitle} url={launch.url} onLoad={reload} />
      ) : (
        <>
          {!extension && !readOnly && !noticeDismissed && (
            <div className="nodrag nokey flex shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3 py-1 text-xs text-muted">
              <p className="min-w-0 flex-1 truncate">
                Most sites refuse to load here. The Unlined Web extension lets them.
              </p>
              <button
                type="button"
                onClick={openInTab}
                className="shrink-0 cursor-pointer font-medium text-accent hover:underline"
              >
                Open in tab
              </button>
              <BarButton icon={X} label="Dismiss" onClick={() => setNoticeDismissed(true)} />
            </div>
          )}
          <div className={cn('relative min-h-0 flex-1', interactive && 'nodrag nowheel')}>
            <iframe
              key={launch.id}
              ref={iframe}
              src={launch.url}
              title={data.pageTitle || 'Web page'}
              sandbox={SANDBOX}
              allow={ALLOW}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              // The extension's script reports as the page loads; if it does not, there is no extension to ask.
              onLoad={() => {
                if (performance.now() - reportedAt.current < REPORT_WAIT_MS) return;
                clearTimeout(reportTimer.current);
                reportTimer.current = setTimeout(() => setPage(null), REPORT_WAIT_MS);
              }}
              className={cn(
                'absolute inset-0 size-full border-0 bg-white',
                !interactive && 'pointer-events-none',
              )}
            />
          </div>
        </>
      )}
    </NodeShell>
  );
}

/** Stands in for a page that is not running: what it was, and a button to start it. */
function Sleeping({ title, url, onLoad }: { title?: string; url: string; onLoad: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
      <Globe className="mb-1 size-6 text-muted" />
      <p className="max-w-full truncate text-sm font-medium">{title || hostnameOf(url)}</p>
      {title && <p className="max-w-full truncate text-xs text-muted">{hostnameOf(url)}</p>}
      <button
        type="button"
        onClick={onLoad}
        className="nodrag nokey mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
      >
        <RotateCw className="size-3.5" /> Load page
      </button>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm text-muted">{children}</p>;
}
