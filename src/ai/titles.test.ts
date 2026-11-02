import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '@/store/canvasStore';
import { installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { useAiAssist } from './store';
import {
  acceptTitles,
  cleanTitle,
  discardTitles,
  suggestTitles,
  titleBatches,
  useTitleSuggestions,
} from './titles';

describe('cleanTitle', () => {
  it('strips quotes and full stops, and rejects long or empty ones', () => {
    expect(cleanTitle('"Shopping list."')).toBe('Shopping list');
    expect(cleanTitle('  ')).toBeUndefined();
    expect(cleanTitle('one two three four five six')).toBeUndefined();
    expect(cleanTitle('x'.repeat(41))).toBeUndefined();
  });
});

describe('titleBatches', () => {
  it('groups linked nodes up to four and keeps the rest alone', () => {
    const link = (source: string, target: string) => ({ source, target });
    expect(titleBatches(['a', 'b', 'c'], [link('a', 'b'), link('b', 'x')])).toEqual([['a', 'b'], ['c']]);
    const ids = ['1', '2', '3', '4', '5'];
    expect(
      titleBatches(ids, [link('1', '2'), link('2', '3'), link('3', '4'), link('4', '5')]).map(
        (b) => b.length,
      ),
    ).toEqual([4, 1]);
  });
});

describe('suggestTitles', () => {
  let fake: ReturnType<typeof installFakeLanguageModel>;
  beforeEach(() => {
    useAiAssist.setState({ enabled: true, availability: 'available' });
  });
  afterEach(() => {
    discardTitles();
    fake?.uninstall();
  });

  it('shows ghosts, then accepts them all as one undo step', async () => {
    fake = installFakeLanguageModel(['```\nFirst note.\n```', '```\n"Second"\n```']);
    const { nodes } = useCanvasStore.getState();
    expect(nodes).toBeDefined();
    useCanvasStore.setState({
      nodes: [
        { id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { markdown: 'hello' } },
        { id: 'b', type: 'text', position: { x: 0, y: 0 }, data: { markdown: 'world' } },
      ] as never,
      edges: [],
    });
    suggestTitles(['a', 'b']);
    expect(Object.keys(useTitleSuggestions.getState().pending)).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(useTitleSuggestions.getState().ghosts).toEqual({ a: 'First note', b: 'Second' });
    acceptTitles();
    const titles = useCanvasStore.getState().nodes.map((n) => (n.data as { title?: string }).title);
    expect(titles).toEqual(['First note', 'Second']);
    expect(useTitleSuggestions.getState().ghosts).toEqual({});
  });
});
