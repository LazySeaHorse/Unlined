import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { useCanvasStore } from '@/store/canvasStore';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { AskSlot } from './AskSlot';
import type { AskSpec } from './inlineAsk';
import { releaseSessions } from './languageModel';
import { useAiAssist } from './store';
import { useInlineAsk } from './useInlineAsk';

// Shouts the words back; "bad" never passes.
const spec: AskSpec<string, { text: string }, string> = {
  feature: 'test-ask',
  system: 'Shout.',
  examples: [{ context: '', words: 'hi', answer: { text: 'HI' } }],
  schema: z.object({ text: z.string() }),
  input: (context, words) => `${context}|${words}`,
  check: async ({ text }) =>
    text === 'bad' ? { ok: false, reason: 'Bad.' } : { ok: true, value: text.toUpperCase() },
};

const node = createNode('text', { x: 0, y: 0 }, { markdown: '' });
const markdown = () => (useCanvasStore.getState().nodes[0].data as { markdown: string }).markdown;
const pastSteps = () => useCanvasStore.temporal.getState().pastStates.length;

/** A node with one plain field, wired the way a node wires its fields. */
function Harness() {
  const text = useCanvasStore((s) => (s.nodes[0].data as { markdown: string }).markdown);
  const set = (value: string) =>
    useCanvasStore.getState().updateNodeData<'text'>(node.id, { markdown: value });
  const ask = useInlineAsk(spec, { context: 'ctx', apply: (value, _at: number) => set(value) });
  return (
    <AskSlot ask={ask} at={0} renderGhost={(value) => <span data-testid="ghost">{value}</span>}>
      <input
        aria-label="field"
        value={text}
        onChange={(e) => {
          if (!ask.trigger(0, text, e.target.value)) set(e.target.value);
        }}
      />
    </AskSlot>
  );
}

let fake: FakeModel | undefined;
const field = () => screen.getByLabelText('field');
const words = () => screen.getByLabelText('Describe it');

beforeEach(() => {
  useCanvasStore.getState().load({ nodes: [node], viewport: DEFAULT_VIEWPORT });
  useAiAssist.setState({ enabled: true, availability: 'available' });
});
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
  useAiAssist.setState({ enabled: false, availability: 'unsupported' });
});

describe('AskSlot', () => {
  it('types ? as usual while on-device AI is not ready', async () => {
    useAiAssist.setState({ availability: 'downloadable' });
    render(<Harness />);
    await userEvent.type(field(), '?');
    expect(markdown()).toBe('?');
    expect(screen.queryByLabelText('Describe it')).toBeNull();
  });

  it('opens on ? in an empty field only, without saving the ?', async () => {
    useCanvasStore.getState().updateNodeData<'text'>(node.id, { markdown: 'a' });
    render(<Harness />);
    await userEvent.type(field(), '?');
    expect(markdown()).toBe('a?');
    await userEvent.clear(field());
    await userEvent.type(field(), '?');
    expect(markdown()).toBe('');
    expect(document.activeElement).toBe(words());
  });

  it('shows the answer faintly, then accepts it as one undo step and refocuses the field', async () => {
    fake = installFakeLanguageModel(['{"text":"hello"}']);
    render(<Harness />);
    await userEvent.type(field(), '?');
    await userEvent.type(words(), 'say hello{Enter}');
    expect((await screen.findByTestId('ghost')).textContent).toBe('HELLO');
    expect(fake.prompts).toEqual(['ctx|say hello']);
    expect(markdown()).toBe('');
    const before = pastSteps();
    await userEvent.keyboard('{Tab}');
    expect(markdown()).toBe('HELLO');
    expect(pastSteps()).toBe(before + 1);
    expect(document.activeElement).toBe(field());
  });

  it('steps back with Escape: from the answer to the words, then out', async () => {
    fake = installFakeLanguageModel(['{"text":"hello"}']);
    render(<Harness />);
    await userEvent.type(field(), '?');
    await userEvent.type(words(), 'say hello{Enter}');
    await screen.findByTestId('ghost');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('ghost')).toBeNull();
    expect((words() as HTMLInputElement).value).toBe('say hello');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Describe it')).toBeNull();
    expect(document.activeElement).toBe(field());
    expect(markdown()).toBe('');
  });

  it('marks a failure on the input, with the reason as its tooltip, and keeps the words', async () => {
    fake = installFakeLanguageModel(['{"text":"bad"}', '{"text":"bad"}']);
    render(<Harness />);
    await userEvent.type(field(), '?');
    await userEvent.type(words(), 'nonsense{Enter}');
    await waitFor(() => expect(words().getAttribute('data-state')).toBe('failed'));
    expect(words().getAttribute('title')).toBeTruthy();
    expect((words() as HTMLInputElement).value).toBe('nonsense');
    await userEvent.type(words(), '!');
    expect(words().getAttribute('data-state')).toBe('typing');
  });

  it('aborts the request when the words change and when the node goes', async () => {
    fake = installFakeLanguageModel(['{"text":"late"}'], 'available', 10_000);
    const { unmount } = render(<Harness />);
    await userEvent.type(field(), '?');
    await userEvent.type(words(), 'slow{Enter}');
    expect(words().getAttribute('data-state')).toBe('running');
    await waitFor(() => expect(fake?.running).toBe(1));
    await userEvent.type(words(), 'er');
    await waitFor(() => expect(fake?.running).toBe(0));
    expect(words().getAttribute('data-state')).toBe('typing');

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(fake?.running).toBe(1));
    unmount();
    await waitFor(() => expect(fake?.running).toBe(0));
  });

  it('closes when on-device AI stops being ready', async () => {
    render(<Harness />);
    await userEvent.type(field(), '?');
    act(() => useAiAssist.setState({ enabled: false }));
    expect(screen.queryByLabelText('Describe it')).toBeNull();
  });
});
