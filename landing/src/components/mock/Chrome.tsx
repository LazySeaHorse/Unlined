import { Mascot } from '@landing/components/Mascot';
import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  ChartSpline,
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  Minus,
  Moon,
  Plus,
  Redo2,
  Search,
  Sheet,
  Sigma,
  Sparkles,
  SquareDashed,
  SquarePlay,
  SquareTerminal,
  Table,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* The node kinds, in toolbar order — src/nodes/catalog.ts */
export const NODE_KINDS = [
  'text',
  'math',
  'mathPlus',
  'graph',
  'table',
  'sheet',
  'code',
  'image',
  'video',
  'web',
  'pdf',
] as const;

export const ALL_KINDS = [
  'text',
  'math',
  'mathPlus',
  'graph',
  'table',
  'sheet',
  'code',
  'image',
  'video',
  'web',
  'pdf',
  'section',
] as const;

export type Kind = (typeof ALL_KINDS)[number];

export const KIND_META: Record<Kind, { label: string; icon: LucideIcon; hint: string }> = {
  text: { label: 'Text', icon: Type, hint: 'Markdown + LaTeX' },
  math: { label: 'Math', icon: Sigma, hint: 'Typeset LaTeX' },
  mathPlus: { label: 'Math+', icon: Calculator, hint: 'Evaluates expressions' },
  graph: { label: 'Graph', icon: ChartSpline, hint: 'Plot functions, equations and inequalities' },
  table: { label: 'Table', icon: Table, hint: 'Math cells' },
  sheet: { label: 'Sheet', icon: Sheet, hint: 'Spreadsheet with formulas' },
  code: { label: 'Script', icon: SquareTerminal, hint: 'Sandboxed JavaScript' },
  image: { label: 'Image', icon: ImageIcon, hint: 'Drop an image in' },
  video: { label: 'Video', icon: SquarePlay, hint: 'Embed a video' },
  web: { label: 'Web', icon: Globe, hint: 'Browse live websites' },
  pdf: { label: 'PDF', icon: FileText, hint: 'Pin pages from local PDFs' },
  section: { label: 'Section', icon: SquareDashed, hint: 'Group and organise nodes' },
};

/* Everything below is src/chrome/*, drawn without behaviour. */

/** Floating surface for toolbars and controls over the canvas. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-2xl border border-border bg-surface p-1 shadow-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

const Divider = ({ className }: { className?: string }) => (
  <div className={cn('mx-1.5 h-6 w-px shrink-0 bg-border', className)} />
);

function Icon({ icon: I, active, dim }: { icon: LucideIcon; active?: boolean; dim?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
        active ? 'bg-accent text-accent-fg' : 'text-fg',
        dim && 'opacity-40',
      )}
    >
      <I className="size-[18px]" />
    </span>
  );
}

export function TopBar({ canvas = 'untitled-1', aiOn }: { canvas?: string; aiOn?: boolean }) {
  return (
    <Panel className="h-14 w-full px-2.5">
      <span className="flex h-10 items-center gap-2 rounded-xl pr-2 pl-1.5">
        <Mascot track={false} className="size-8" />
        <ChevronDown className="size-3.5 opacity-50" />
      </span>
      <Divider />
      <span className="flex h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-medium">
        <FolderOpen className="size-[18px] shrink-0 text-muted" />
        <span>{canvas}</span>
      </span>
      <Divider />
      <Icon icon={Undo2} />
      <Icon icon={Redo2} dim />
      <Divider />
      {NODE_KINDS.map((kind) => (
        <Icon key={kind} icon={KIND_META[kind].icon} />
      ))}
      <Divider />
      <Icon icon={LayoutGrid} />
      <div className="flex-1" />
      <span className="flex h-9 items-center gap-2 rounded-xl bg-surface-2 px-2.5 text-sm text-muted">
        <Search className="size-4 shrink-0" />
      </span>
      <span className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm font-medium">
        <Sparkles className="size-[18px]" />
        AI
        <span className={cn('size-2 rounded-full', aiOn ? 'bg-emerald-500' : 'bg-border')} />
      </span>
      <Divider />
      <Icon icon={Moon} />
    </Panel>
  );
}

export function ZoomControls({ zoom = 100 }: { zoom?: number }) {
  return (
    <Panel className="flex-col">
      <Icon icon={Plus} />
      <span className="w-9 py-1 text-center text-xs font-medium text-muted tabular-nums">{zoom}%</span>
      <Icon icon={Minus} />
      <Icon icon={Maximize} />
    </Panel>
  );
}

/* ── AI panel (src/chrome/AiPanel.tsx), Activity tab ── */

export type AiRow = { text: string; ago: string; running?: boolean };

export function AiPanelMock({ rows }: { rows: AiRow[] }) {
  return (
    <Panel className="w-[22rem] flex-col items-stretch gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent" />
          <h2 className="text-sm font-medium">AI control</h2>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-amber-600 uppercase">
            Experimental
          </span>
        </div>
        <span className="inline-flex size-7 items-center justify-center rounded-xl">
          <X className="size-4" />
        </span>
      </header>
      <div className="mx-3 mt-3 flex shrink-0 gap-1 rounded-xl bg-surface-2 p-1">
        <span className="flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-medium text-muted">
          Connect
        </span>
        <span className="flex-1 rounded-lg bg-surface px-3 py-1.5 text-center text-xs font-medium text-fg shadow-sm">
          Activity
        </span>
      </div>
      <ol className="mt-2 pb-1">
        {rows.map((r) => (
          <li
            key={r.text}
            className="flex items-start gap-2.5 border-b border-border/60 px-4 py-2.5 last:border-b-0"
          >
            <span className="mt-0.5 shrink-0">
              {r.running ? (
                <LoaderCircle className="size-3.5 text-accent" />
              ) : (
                <Check className="size-3.5 text-emerald-500" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-xs break-words">{r.text}</span>
            <span className="shrink-0 text-[10px] text-muted tabular-nums">{r.ago}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function AiLockBannerMock() {
  return (
    <Panel className="gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm">
      <LoaderCircle className="size-4 text-accent" />
      <span>AI is editing. The canvas is read-only.</span>
      <span className="inline-flex h-7 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg">
        Take over
      </span>
    </Panel>
  );
}
