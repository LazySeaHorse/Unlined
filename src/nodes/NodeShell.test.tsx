import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAiAssist } from '@/ai/store';
import { discardTitles, useTitleSuggestions } from '@/ai/titles';
import { ReadOnlyContext } from '@/canvas/readOnly';
import { DEFAULT_VIEWPORT } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { createNode } from './factory';
import { NodeTitle } from './NodeShell';

const node = createNode('text', { x: 0, y: 0 }, { markdown: 'hello' });
const title = () => (useCanvasStore.getState().nodes[0].data as { title?: string }).title;

beforeEach(() => {
  useCanvasStore.getState().load({ nodes: [node], viewport: DEFAULT_VIEWPORT });
  useAiAssist.setState({ enabled: true, availability: 'available' });
  useTitleSuggestions.setState({ ghosts: { [node.id]: 'Greeting' } });
});
afterEach(() => {
  discardTitles();
  useAiAssist.setState({ enabled: false, availability: 'unsupported' });
});

describe('NodeTitle suggestions', () => {
  it('shows a suggested title, which a click takes', async () => {
    render(<NodeTitle id={node.id} fallback="Text" />);
    await userEvent.click(screen.getByText('Greeting'));
    expect(title()).toBe('Greeting');
  });

  it('shows none on a read-only canvas, and a click takes none', async () => {
    render(
      <ReadOnlyContext value>
        <NodeTitle id={node.id} fallback="Text" />
      </ReadOnlyContext>,
    );
    expect(screen.queryByText('Greeting')).toBeNull();
    await userEvent.click(screen.getByText('Text'));
    expect(title()).toBeUndefined();
  });

  it('shows none while on-device AI is off', () => {
    useAiAssist.setState({ enabled: false });
    render(<NodeTitle id={node.id} fallback="Text" />);
    expect(screen.queryByText('Greeting')).toBeNull();
  });
});
