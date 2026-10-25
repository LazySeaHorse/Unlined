import { z } from 'zod';
import { glide } from '@/motion/glide';
import type { AgentToolDescriptor, AgentToolResult, AnyAgentTool } from './defineTool';
import { ToolError } from './errors';
import { type AgentEvent, agentEvents } from './events';
import { holdLock, markTouched, useAgentStore } from './store';
import { ALL_TOOLS } from './tools';

const toolsByName = new Map<string, AnyAgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

const errorResult = (payload: Record<string, unknown>): AgentToolResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

// Write tools and scripts run one at a time so each call sees the canvas the previous one left.
let exclusiveQueue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = exclusiveQueue.then(fn, fn);
  exclusiveQueue = run.catch(() => undefined);
  return run;
}

let callCounter = 0;

/** Runs one tool call: enabled check, input validation, canvas lock, handler, activity event. Never rejects. */
export async function runAgentTool(name: string, rawInput: unknown): Promise<AgentToolResult> {
  const id = `call${++callCounter}`;
  const emit = (phase: AgentEvent['phase'], extra: Partial<AgentEvent> = {}) =>
    agentEvents.emit({ id, tool: name, phase, input: rawInput, at: Date.now(), ...extra });
  const fail = (payload: { error: string; message: string } & Record<string, unknown>) => {
    emit('failed', { error: payload.message });
    return errorResult(payload);
  };

  const tool = toolsByName.get(name);
  if (!tool)
    return errorResult({
      error: 'unknown_tool',
      message: `Unknown tool "${name}".`,
      tools: [...toolsByName.keys()],
    });
  if (!useAgentStore.getState().enabled)
    return errorResult({
      error: 'agent_disabled',
      message: 'AI control is turned off in Unlined. Ask the user to turn it on in the AI panel.',
    });

  emit('started');
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`,
    );
    return fail({ error: 'invalid_input', message: `Invalid input for ${name}: ${issues.join('; ')}` });
  }

  if (!tool.readOnly) holdLock();
  try {
    // What an agent moves glides there, so the user can follow the edit.
    const run = () => Promise.resolve(tool.handler(parsed.data));
    const exec = tool.readOnly ? run : () => glide(run);
    const outcome = await (tool.exclusive ? runExclusive(exec) : exec());
    if (!tool.readOnly) {
      holdLock();
      markTouched(outcome.affectedNodeIds ?? []);
    }
    emit('succeeded', { summary: outcome.summary, affectedNodeIds: outcome.affectedNodeIds });
    return { content: [{ type: 'text', text: outcome.text }] };
  } catch (err) {
    if (err instanceof ToolError) return fail({ error: err.code, message: err.message, ...err.details });
    console.error(`[agent] ${name} failed`, err);
    return fail({ error: 'internal_error', message: err instanceof Error ? err.message : String(err) });
  }
}

/** Every tool with a JSON Schema input, ready for WebMCP or the bridge. */
export function getAgentTools(): AgentToolDescriptor[] {
  return ALL_TOOLS.map((tool) => {
    const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<
      string,
      unknown
    >;
    delete schema.$schema;
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: schema,
      annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: tool.destructive },
      execute: (input: unknown) => runAgentTool(tool.name, input),
    };
  });
}
