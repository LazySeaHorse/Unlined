import {
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  Redo2,
  Spline,
  Undo2,
  Upload,
} from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useAgentStore } from '@/agent';
import { useCanvasActions } from '@/canvas/useCanvasActions';
import { nodeSpecs, numberKeyFor, toolbarKinds } from '@/nodes/catalog';
import { redo, undo, useCanvasStore } from '@/store/canvasStore';
import { organiseCanvas } from '@/store/groups';
import { useUiStore } from '@/store/uiStore';
import * as workspace from '@/store/workspace';
import { Badge } from '@/ui/Badge';
import { IconButton, WithTooltip } from '@/ui/Button';
import { Mascot } from '@/ui/Mascot';
import { Menu } from '@/ui/Menu';
import { AiButton } from './AiButton';
import { CanvasManager } from './CanvasManager';
import { promptNewCanvas } from './newCanvas';
import { Divider, Panel } from './Panel';
import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';
import { useCurrentCanvas } from './useCurrentCanvas';

const REPO_URL = 'https://github.com/LazySeaHorse/Unlined';

function BrandMenu() {
  const working = useAgentStore((s) => s.locked);
  const hasSelection = useCanvasStore((s) => s.nodes.some((n) => n.selected));
  const { importJson, exportJson } = useCanvasActions();

  const create = async () => {
    const name = await promptNewCanvas();
    if (name !== null) await workspace.newCanvas(name);
  };

  return (
    <Menu
      header={
        <div className="flex items-center gap-3 px-2.5 pt-2.5 pb-2">
          <Mascot mood={working ? 'working' : 'idle'} className="size-11 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm leading-tight font-semibold">Unlined</div>
            <Badge variant="info" size="sm" className="mt-1">
              Saved in this browser
            </Badge>
          </div>
        </div>
      }
      items={[
        { separator: true },
        { heading: 'Canvas' },
        { label: 'New canvas', icon: FilePlus2, onSelect: () => void create() },
        { separator: true },
        { heading: 'Export' },
        {
          label: 'Selected nodes',
          icon: Download,
          disabled: !hasSelection,
          onSelect: () => void exportJson('selection'),
        },
        { label: 'This canvas', icon: Download, onSelect: () => void exportJson('canvas') },
        { label: 'All canvases', icon: Download, onSelect: () => void exportJson('all') },
        { separator: true },
        { label: 'Import…', icon: Upload, hint: '.json', onSelect: () => void importJson() },
        { separator: true },
        {
          label: 'Source on GitHub',
          icon: ExternalLink,
          onSelect: () => window.open(REPO_URL, '_blank', 'noopener'),
        },
      ]}
      trigger={
        <button
          type="button"
          aria-label="Unlined menu"
          className="group flex h-10 cursor-pointer items-center gap-2 rounded-xl pr-2 pl-1.5 text-sm font-semibold tracking-tight transition-colors hover:bg-accent/10 hover:text-accent data-[state=open]:bg-accent/10 data-[state=open]:text-accent"
        >
          <Mascot
            mood={working ? 'working' : 'idle'}
            className="size-8 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:-rotate-3"
          />
          <span className="hidden whitespace-nowrap xl:inline">Unlined</span>
          <ChevronDown className="size-3.5 opacity-50 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      }
    />
  );
}

export function TopBar() {
  const [managerOpen, setManagerOpen] = useState(false);
  const canvas = useCurrentCanvas();
  const { tool, setTool, linking, setLinking } = useUiStore();
  const { insertImage, insertVideo, insertWeb, insertPdf } = useCanvasActions();
  const canUndo = useStore(useCanvasStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useCanvasStore.temporal, (s) => s.futureStates.length > 0);
  const hasNodes = useCanvasStore((s) => s.nodes.length > 0);

  const insertActions = { image: insertImage, video: insertVideo, web: insertWeb, pdf: insertPdf } as const;

  return (
    <Panel className="h-14 w-full gap-1 px-2.5">
      <BrandMenu />
      <Divider />
      <WithTooltip label="Switch canvas">
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="flex h-9 max-w-52 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm font-medium hover:bg-accent/10"
        >
          <FolderOpen className="size-[18px] shrink-0 text-muted" />
          <span className="truncate">{canvas?.name ?? '…'}</span>
        </button>
      </WithTooltip>
      <CanvasManager open={managerOpen} onOpenChange={setManagerOpen} />

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
        <Divider />
        <IconButton icon={Undo2} label="Undo" hint="Ctrl+Z" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Redo" hint="Ctrl+Shift+Z" disabled={!canRedo} onClick={redo} />
        <Divider />
        <ToolGroup tool={tool}>
          {toolbarKinds().map((kind) => {
            const spec = nodeSpecs[kind];
            return spec.placement === 'place' ? (
              <IconButton
                key={kind}
                icon={spec.icon}
                label={spec.label}
                hint={`${numberKeyFor(kind) ? `${numberKeyFor(kind)}, then ` : ''}double-click canvas to place`}
                active={tool === kind}
                onClick={() => setTool(kind)}
              />
            ) : (
              <IconButton
                key={kind}
                icon={spec.icon}
                label={`Insert ${spec.label.toLowerCase()}`}
                onClick={() => void insertActions[kind as keyof typeof insertActions]()}
              />
            );
          })}
        </ToolGroup>
        <Divider />
        <IconButton
          icon={LayoutGrid}
          label="Organise"
          hint="group nearby nodes and space them evenly"
          disabled={!hasNodes}
          onClick={organiseCanvas}
        />
        <IconButton
          icon={Spline}
          label="Link nodes"
          hint="L, then drag from one node to another"
          active={linking}
          onClick={() => setLinking(!linking)}
        />
      </div>

      <div className="flex-1" />
      <SearchBar />
      <AiButton />
      <Divider />
      <ThemeToggle />
    </Panel>
  );
}

/** The node tools, with a highlight that slides to the tool picked instead of jumping there. */
function ToolGroup({ tool, children }: { tool: string; children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pressed button moves when `tool` changes.
  useLayoutEffect(() => {
    const el = pill.current;
    const active = group.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!el) return;
    if (!active) {
      el.style.opacity = '0';
      return;
    }
    el.style.translate = `${active.offsetLeft}px 0`;
    el.style.width = `${active.offsetWidth}px`;
    el.style.opacity = '1';
    // Put in place once without sliding; from then on it slides.
    const frame = requestAnimationFrame(() => {
      el.dataset.ready = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [tool]);
  return (
    <div ref={group} className="tool-group relative flex items-center gap-1">
      <span ref={pill} aria-hidden className="tool-pill" />
      {children}
    </div>
  );
}
