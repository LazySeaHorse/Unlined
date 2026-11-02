import { useEffect } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { nodeBody, oneLine } from '@/agent/format';
import type { AppNode } from '@/model/types';
import { asUndoStep, useCanvasStore } from '@/store/canvasStore';
import { type AskResult, ask, type Check } from './languageModel';
import { aiAvailable, useAiAssist, useAiReady } from './store';

/**
 * Suggest title: the model reads one node's own content and offers a very short title, shown faintly on the node
 * until Enter (all) or a click (one) accepts it, or Escape drops them. Pending and suggested titles live here, not
 * in node data, so they are neither saved nor undoable; only accepting is.
 */

export const TITLE_MAX_WORDS = 5;
export const TITLE_MAX_CHARS = 40;
const TEXT_CHARS = 600;
/** Linked nodes share one request up to this many. */
export const GROUP_MAX = 4;

/** Kinds with readable text and a title. Sections and stacks are their own titles; images and pdfs have no text. */
const TITLED = new Set<AppNode['type']>([
  'text',
  'math',
  'mathPlus',
  'graph',
  'table',
  'sheet',
  'code',
  'video',
  'web',
]);

/** Quotes, trailing full stops and spaces off; undefined when nothing, or too long, is left. */
export function cleanTitle(raw: string): string | undefined {
  const title = raw
    .replace(/^\s*(title\s*:\s*)/i, '')
    .replace(/^["'`“”‘’\s]+|["'`“”‘’\s]+$/g, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ');
  if (!title || title.length > TITLE_MAX_CHARS || title.split(' ').length > TITLE_MAX_WORDS) return undefined;
  return title;
}

const system = `You name notes on a canvas. For each note give a title of at most ${TITLE_MAX_WORDS} words, in English, naming what it is about. No quotes, no full stop. Think briefly, then put only the title in a \`\`\` block. When several notes are numbered, put one line per note in the block, as "1: title".`;

const EXAMPLES: Array<[string, string]> = [
  ['[text]\nBuy milk, eggs and flour. Also call the plumber about the kitchen tap.', 'Shopping and errands'],
  ['[math]\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', 'Quadratic formula'],
  [
    '(1)\n[mathPlus]\nr := 3 \\\\ A := \\pi r^2\n\n(2)\n[text]\nThe garden pond is round, 3 m across.',
    '1: Pond area\n2: Garden pond',
  ],
];

const reply = z.string();

const single: Check<string, string> = async (text) => {
  const title = cleanTitle(text);
  return title
    ? { ok: true, value: title }
    : { ok: false, reason: `Give a title of at most ${TITLE_MAX_WORDS} words.` };
};

const grouped =
  (count: number): Check<string, string[]> =>
  async (text) => {
    const titles: string[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*\(?(\d+)\s*[:.)-]\s*(.+)$/);
      const title = m?.[2] ? cleanTitle(m[2]) : undefined;
      if (m && title) titles[Number(m[1]) - 1] = title;
    }
    return Array.from({ length: count }, (_, i) => titles[i]).every(Boolean)
      ? { ok: true, value: titles.slice(0, count) }
      : { ok: false, reason: `Give one numbered line per note, ${count} in all.` };
  };

/** What the model sees of a node: its kind and its own content, capped. */
export function titleInput(node: AppNode): string {
  return `[${node.type}]\n${oneLine(nodeBody(node), TEXT_CHARS)}`;
}

export const canSuggestTitle = (node: AppNode): boolean =>
  TITLED.has(node.type) && nodeBody(node).trim().length > 0;

/** `ids` split into requests: nodes joined by links (among `ids`) share one, up to GROUP_MAX; the rest go alone. */
export function titleBatches(ids: string[], links: Array<{ source: string; target: string }>): string[][] {
  const wanted = new Set(ids);
  const near = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { source, target } of links)
    if (source !== target && wanted.has(source) && wanted.has(target)) {
      near.get(source)?.push(target);
      near.get(target)?.push(source);
    }
  const seen = new Set<string>();
  const batches: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    seen.add(id);
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      component.push(next);
      for (const other of near.get(next) ?? [])
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
    }
    for (let i = 0; i < component.length; i += GROUP_MAX) batches.push(component.slice(i, i + GROUP_MAX));
  }
  return batches;
}

interface TitleState {
  /** Nodes whose title is being worked out. */
  pending: Record<string, true>;
  /** Suggested titles waiting to be accepted. */
  ghosts: Record<string, string>;
}

export const useTitleSuggestions = create<TitleState>(() => ({ pending: {}, ghosts: {} }));

let controller: AbortController | undefined;

const without = <T>(record: Record<string, T>, ids: string[]) => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

/** Escape: drops every suggestion and stops the requests still running. */
export function discardTitles(): void {
  controller?.abort();
  controller = undefined;
  useTitleSuggestions.setState({ pending: {}, ghosts: {} });
}

/** Enter, or a click on one ghost: writes the suggested titles, as one undo step. */
export function acceptTitles(only?: string): void {
  const { ghosts } = useTitleSuggestions.getState();
  const ids = only ? (only in ghosts ? [only] : []) : Object.keys(ghosts);
  if (ids.length === 0) return;
  asUndoStep(() => {
    for (const id of ids) {
      const title = ghosts[id];
      if (title && useCanvasStore.getState().nodes.some((n) => n.id === id))
        useCanvasStore.getState().updateNodeData(id, { title });
    }
  });
  useTitleSuggestions.setState((s) => ({ ghosts: without(s.ghosts, ids) }));
}

/**
 * A canvas key while suggestions are about: Enter takes the waiting ones, Escape drops them all and stops the
 * requests still running. True when the key did that, so the canvas leaves it alone; false otherwise (Escape
 * then deselects as usual).
 */
export function titleKey(key: string): boolean {
  const { pending, ghosts } = useTitleSuggestions.getState();
  const waiting = Object.keys(ghosts).length > 0;
  if (key === 'enter' && waiting) acceptTitles();
  else if (key === 'escape' && (waiting || Object.keys(pending).length > 0)) discardTitles();
  else return false;
  return true;
}

/**
 * Mounted with the canvas. Suggestions go when on-device AI stops being ready (switched off, the canvas
 * read-only) and when the canvas does (another one opens): the cleanup runs on either.
 */
export function useTitleSuggestionsScope(): void {
  const ready = useAiReady();
  useEffect(() => (ready ? discardTitles : undefined), [ready]);
}

/** Starts suggesting titles for `ids`, replacing any suggestions still showing. */
export function suggestTitles(ids: string[]): void {
  if (!aiAvailable(useAiAssist.getState())) return;
  discardTitles();
  const { nodes, edges } = useCanvasStore.getState();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const usable = ids.filter((id) => {
    const node = byId.get(id);
    return node && canSuggestTitle(node);
  });
  if (usable.length === 0) return;
  const own = new AbortController();
  controller = own;
  useTitleSuggestions.setState({
    pending: Object.fromEntries(usable.map((id) => [id, true as const])),
    ghosts: {},
  });

  const settle = (batch: string[], titles: Array<string | undefined>) => {
    if (own.signal.aborted) return;
    useTitleSuggestions.setState((s) => {
      const ghosts = { ...s.ghosts };
      batch.forEach((id, i) => {
        const t = titles[i];
        if (t) ghosts[id] = t;
      });
      return { pending: without(s.pending, batch), ghosts };
    });
  };

  for (const batch of titleBatches(usable, edges)) {
    const parts = batch.map((id) => titleInput(byId.get(id) as AppNode));
    const one = batch.length === 1;
    const input = one ? (parts[0] as string) : parts.map((p, i) => `(${i + 1})\n${p}`).join('\n\n');
    const request: Promise<AskResult<string | string[]>> = ask<string, string | string[]>({
      feature: 'title',
      system,
      examples: EXAMPLES,
      input,
      schema: reply,
      format: 'fenced',
      check: one ? single : grouped(batch.length),
      signal: own.signal,
    });
    void request.then((r) =>
      settle(batch, r.status === 'ok' ? (one ? [r.value as string] : (r.value as string[])) : []),
    );
  }
}
