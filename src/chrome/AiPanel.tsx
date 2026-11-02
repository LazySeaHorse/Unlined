import { Check, ChevronDown, CircleAlert, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type AgentEvent,
  agentEvents,
  getAgentTools,
  selectAgentCalls,
  useAgentEvents,
  useAgentStore,
} from '@/agent';
import { getAgentView } from '@/agent/view';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { useCanvasStore } from '@/store/canvasStore';
import { organiseCanvas } from '@/store/groups';
import { type AiTab, useUiStore } from '@/store/uiStore';
import { Alert, AlertDescription, AlertTitle } from '@/ui/Alert';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { confirmAction } from '@/ui/dialogs';
import { EmptyState } from '@/ui/EmptyState';
import { Mascot } from '@/ui/Mascot';
import { Switch } from '@/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs';
import { OnDeviceTab } from './OnDeviceTab';
import { Panel } from './Panel';

const MCP_URL = 'http://127.0.0.1:47801/mcp';
const RELEASES_URL = 'https://github.com/LazySeaHorse/Unlined/releases';
const SETUP_COMMANDS = [
  ['Claude Code', `claude mcp add --transport http unlined ${MCP_URL}`],
  ['Codex', `codex mcp add unlined --url ${MCP_URL}`],
  ['Gemini CLI', `gemini mcp add --transport http unlined ${MCP_URL}`],
] as const;

/** Asks first, organises the canvas so agents can find their way around, then turns AI control on. */
export async function enableAiControl(): Promise<void> {
  const ok = await confirmAction({
    title: 'Turn on AI control?',
    message:
      'Connected agents will be able to read and edit this canvas. First, nearby nodes are grouped and spaced ' +
      'evenly (Organise); undo reverts that. While an agent is editing, the canvas is read-only for you.',
    confirmLabel: 'Organise and turn on',
    hero: { mood: 'plug', scene: 'ai' },
  });
  if (!ok) return;
  if (useCanvasStore.getState().nodes.length > 0) organiseCanvas();
  useAgentStore.getState().setEnabled(true);
}

function StatusBlock() {
  const { enabled, bridgeConnected, webMcpTools } = useAgentStore();
  const connected = enabled && bridgeConnected;
  const variant = connected ? 'success' : enabled ? 'warning' : 'info';
  return (
    <div className="flex flex-col gap-2">
      <Alert variant={variant} size="sm">
        <AlertTitle>{bridgeConnected ? 'Bridge connected' : 'Bridge not connected'}</AlertTitle>
        <AlertDescription>
          {!enabled
            ? 'Turn AI control on to let a coding agent read and edit this canvas.'
            : bridgeConnected
              ? 'A coding agent can use the tools below.'
              : 'Run the bridge on this computer, then this tab connects by itself.'}
        </AlertDescription>
      </Alert>
      {webMcpTools > 0 && (
        <Alert variant="success" size="sm">
          <AlertTitle>WebMCP: {webMcpTools} tools registered</AlertTitle>
        </Alert>
      )}
    </div>
  );
}

function ConnectTab() {
  const enabled = useAgentStore((s) => s.enabled);
  const setEnabled = useAgentStore((s) => s.setEnabled);
  const [setupOpen, setSetupOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const tools = useMemo(() => getAgentTools(), []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label htmlFor="ai-enable" className="text-xs font-medium">
            Allow AI agents to control this canvas
          </label>
          <p className="mt-0.5 text-2xs text-muted">Off each time you open the app.</p>
        </div>
        <Switch
          id="ai-enable"
          checked={enabled}
          onCheckedChange={(on) => (on ? void enableAiControl() : setEnabled(false))}
        />
      </div>

      <StatusBlock />

      <div>
        <button
          type="button"
          aria-expanded={setupOpen}
          onClick={() => setSetupOpen((o) => !o)}
          className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-muted hover:text-fg"
        >
          Connect a coding agent
          <ChevronDown className={cn('size-3.5 transition-transform', setupOpen && 'rotate-180')} />
        </button>
        {setupOpen && (
          <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted">
            <p>
              1. Download and run the bridge for your OS from the{' '}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                latest bridge release
              </a>
              .
            </p>
            <p>2. Turn AI control on. This tab connects by itself.</p>
            <p>3. Add it to your agent once:</p>
            {SETUP_COMMANDS.map(([agent, command]) => (
              <div key={agent}>
                <span className="text-fg">{agent}</span>
                <code className="mt-0.5 block rounded-lg bg-surface-2 px-2 py-1.5 font-mono text-2xs break-all text-fg select-all">
                  {command}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((o) => !o)}
          className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-muted hover:text-fg"
        >
          Tools an agent can use ({tools.length})
          <ChevronDown className={cn('size-3.5 transition-transform', toolsOpen && 'rotate-180')} />
        </button>
        {toolsOpen && (
          <ul className="mt-2 flex flex-col gap-1 text-2xs text-muted">
            {tools.map((tool) => (
              <li key={tool.name} className="flex items-center justify-between gap-2">
                <span>{tool.title}</span>
                {!tool.annotations.readOnlyHint && (
                  <Badge variant="muted" size="micro">
                    edits
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ event }: { event: AgentEvent }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const targets = (event.affectedNodeIds ?? []).filter((id) => nodes.some((n) => n.id === id));
  const focus = () => targets.length > 0 && getAgentView()?.fitNodes(targets);
  const failed = event.phase === 'failed';
  return (
    <li className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={focus}
        disabled={targets.length === 0}
        className="flex w-full cursor-pointer items-start gap-2.5 px-4 py-2.5 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="mt-0.5 shrink-0">
          {event.phase === 'started' && <LoaderCircle className="size-3.5 animate-spin text-accent" />}
          {event.phase === 'succeeded' && <Check className="size-3.5 text-success" />}
          {failed && <CircleAlert className="size-3.5 text-danger" />}
        </span>
        <span className={cn('min-w-0 flex-1 text-xs break-words', failed && 'text-danger')}>
          {failed ? event.error : (event.summary ?? event.tool)}
        </span>
        <time className="shrink-0 text-micro text-muted tabular-nums">{timeAgo(event.at)}</time>
      </button>
    </li>
  );
}

function ActivityTab() {
  const events = useAgentEvents();
  const calls = useMemo(() => selectAgentCalls(events), [events]);
  const setAiTab = useUiStore((s) => s.setAiTab);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {calls.length === 0 ? (
        <EmptyState
          size="compact"
          mascot={<Mascot mood="curious" animated className="h-24" title="Curious octopus" />}
          title="No AI activity yet"
          description={
            <>
              Turn on AI control in the{' '}
              <button
                type="button"
                className="cursor-pointer underline hover:text-fg"
                onClick={() => setAiTab('connect')}
              >
                Connect tab
              </button>
              , then ask your agent to work on this canvas. Its calls show up here.
            </>
          }
        />
      ) : (
        <>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {[...calls].reverse().map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ol>
          <div className="flex justify-end border-t border-border px-3 py-2">
            <Button size="xs" onClick={() => agentEvents.clear()}>
              Clear feed
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function AiPanel() {
  const tab = useUiStore((s) => s.aiTab);
  const setTab = useUiStore((s) => s.setAiTab);
  const close = useUiStore((s) => s.toggleAiPanel);

  return (
    <Panel
      aria-label="AI panel"
      className="max-h-[calc(100dvh-18.75rem)] min-h-60 w-[22rem] flex-col items-stretch gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-accent" />
          <h2 className="text-sm font-semibold">AI control</h2>
          <Badge variant="warning" size="micro">
            Experimental
          </Badge>
        </div>
        <IconButton icon={X} label="Close AI panel" size="sm" onClick={close} />
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as AiTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-3 shrink-0">
          <TabsTrigger value="connect">Connect</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="device">On-device</TabsTrigger>
        </TabsList>
        <TabsContent value="connect" className="min-h-0 flex-1 overflow-y-auto">
          <ConnectTab />
        </TabsContent>
        <TabsContent value="activity" className="flex min-h-0 flex-1 flex-col pt-2">
          <ActivityTab />
        </TabsContent>
        <TabsContent value="device" className="min-h-0 flex-1 overflow-y-auto">
          <OnDeviceTab />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

/** Shown while AI control is on and the panel is closed. Opens the panel on the Activity tab. */
export function AiStatusPill() {
  const enabled = useAgentStore((s) => s.enabled);
  const locked = useAgentStore((s) => s.locked);
  const connected = useAgentStore((s) => s.bridgeConnected || s.webMcpTools > 0);
  const open = useUiStore((s) => s.aiPanelOpen);
  const openAiPanel = useUiStore((s) => s.openAiPanel);
  const count = useAgentEvents((events) => selectAgentCalls(events as AgentEvent[]).length);

  if (!enabled || locked || open) return null;
  return (
    <button
      type="button"
      onClick={() => openAiPanel('activity')}
      className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-2xs font-medium shadow-lg hover:bg-surface-2"
    >
      {connected ? (
        <Mascot mood="curious" className="-my-1 -ml-1.5 size-6" />
      ) : (
        <span className="size-2 rounded-full bg-warning" />
      )}
      {connected ? 'AI connected' : 'AI on, waiting for an agent'}
      <span className="text-muted">
        {count} {count === 1 ? 'call' : 'calls'}
      </span>
    </button>
  );
}

/** Shown while an agent is editing: the canvas is read-only until it pauses or the user takes over. */
export function AiLockBanner() {
  const locked = useAgentStore((s) => s.locked);
  if (!locked) return null;
  return (
    <Panel className="gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm" role="status">
      <Mascot mood="working" animated className="-my-1 size-7 shrink-0" />
      <span>AI is editing. The canvas is read-only.</span>
      <Button
        variant="primary"
        size="sm"
        className="rounded-full"
        onClick={() => useAgentStore.getState().setEnabled(false)}
      >
        Take over
      </Button>
    </Panel>
  );
}
