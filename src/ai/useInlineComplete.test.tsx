import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { createNode } from '@/nodes/factory';
import { useCanvasStore } from '@/store/canvasStore';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { CompleteSlot } from './CompleteSlot';
import type { CompleteSpec } from './inlineAsk';
import { releaseSessions } from './languageModel';
import { useAiAssist } from './store';
import { useInlineComplete } from './useInlineComplete';

// "bad" never fits.
const spec: CompleteSpec<string> = {
  feature: 'test-complete',
  system: 'Continue.',
  examples: [{ context: '', before: 'Hello', answer: ' world' }],
  input: (context, before) => `${context}|${before}`,
  check: (text) => !text.includes('bad'),
};

const node = createNode('text', { x: 0, y: 0 }, { markdown: '' });
const markdown = () => (useCanvasStore.getState().nodes[0].data as { markdown: string }).markdown;
const set = (value: string) => useCanvasStore.getState().updateNodeData<'text'>(node.id, { markdown: value });
const pastSteps = () => useCanvasStore.temporal.getState().pastStates.length;

function Harness() {
  const text = useCanvasStore((s) => (s.nodes[0].data as { markdown: string }).markdown);
  const complete = useInlineComplete(spec, { data: text, context: () => 'ctx' });
  return (
    <>
      <span data-testid="phase">{complete.state.phase}</span>
      <CompleteSlot complete={complete} at={0}>
        <textarea aria-label="field" value={text} onChange={(e) => set(e.target.value)} />
      </CompleteSlot>
    </>
  );
}

let fake: FakeModel | undefined;
const field = () => screen.getByLabelText('field') as HTMLTextAreaElement;
const phase = () => screen.getByTestId('phase').textContent;
const ghost = () => document.querySelector('.complete-copy');

/** The field holding `text`, focused, with the caret at `caret` (its end by default). */
const start = (text: string, caret = text.length) => {
  set(text);
  render(<Harness />);
  field().focus();
  field().setSelectionRange(caret, caret);
};

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

describe('useInlineComplete', () => {
  it('shows the model the text up to the caret only, and puts the line in at the caret on Tab', async () => {
    fake = installFakeLanguageModel([' there\nmore']);
    start('Hi, said Sam', 3);
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(phase()).toBe('ghost'));
    expect(fake.prompts.at(-1)).toBe('ctx|Hi,');
    expect(ghost()?.textContent).toBe('Hi, there said Sam');
    expect(field().style.color).toBe('transparent');
    const steps = pastSteps();
    await userEvent.keyboard('{Tab}');
    expect(markdown()).toBe('Hi, there said Sam');
    expect(field().style.color).toBe('');
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(9);
    expect(pastSteps()).toBe(steps + 1);
    expect(phase()).toBe('closed');
  });

  it('drops the line on any other key, which types as usual', async () => {
    fake = installFakeLanguageModel([' world']);
    start('Hello');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(phase()).toBe('ghost'));
    await userEvent.keyboard('!');
    expect(phase()).toBe('closed');
    expect(markdown()).toBe('Hello!');
  });

  it('drops the line on Escape, and Escape does nothing else', async () => {
    fake = installFakeLanguageModel([' world']);
    start('Hello');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(phase()).toBe('ghost'));
    let escaped = false;
    document.addEventListener('keydown', () => (escaped = true), { once: true });
    await userEvent.keyboard('{Escape}');
    expect(phase()).toBe('closed');
    expect(escaped).toBe(false);
    expect(markdown()).toBe('Hello');
  });

  it('drops the line when the node changes', async () => {
    fake = installFakeLanguageModel([' world']);
    start('Hello');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(phase()).toBe('ghost'));
    act(() => set('Bye'));
    expect(phase()).toBe('closed');
  });

  it('shows nothing for a line that does not fit, or none at all', async () => {
    fake = installFakeLanguageModel([' bad', '\nnext line']);
    start('Hello');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(fake?.prompts).toHaveLength(1));
    await waitFor(() => expect(phase()).toBe('closed'));
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(fake?.prompts).toHaveLength(2));
    await waitFor(() => expect(phase()).toBe('closed'));
    expect(ghost()).toBeNull();
    expect(markdown()).toBe('Hello');
  });

  it('shimmers the field while the line is worked out', async () => {
    fake = installFakeLanguageModel([' world'], 'available', 50);
    start('Hello');
    await userEvent.keyboard('{Tab}');
    expect(field().dataset.completing).toBe('');
    await waitFor(() => expect(phase()).toBe('ghost'));
    expect(field().dataset.completing).toBeUndefined();
  });

  it('does not type a space twice', async () => {
    fake = installFakeLanguageModel([' world']);
    start('Hello ');
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(phase()).toBe('ghost'));
    await userEvent.keyboard('{Tab}');
    expect(markdown()).toBe('Hello world');
  });

  it('leaves Tab alone in an empty field, and while on-device AI is not ready', async () => {
    fake = installFakeLanguageModel([' world']);
    start('');
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(field());
    expect(fake.prompts).toHaveLength(0);

    act(() => useAiAssist.setState({ availability: 'downloadable' }));
    act(() => set('Hello'));
    field().focus();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(field());
    expect(fake.prompts).toHaveLength(0);
  });
});
