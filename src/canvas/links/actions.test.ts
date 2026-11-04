import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { editLink } from './actions';

describe('the colour new links get', () => {
  beforeEach(() => useUiStore.setState({ linkColor: 'blue' }));

  it('starts as blue', () => {
    expect(useUiStore.getState().linkColor).toBe('blue');
  });

  it('is the colour a link was last given, or automatic once that was chosen', () => {
    const state = () => useCanvasStore.getState();
    state().load({ nodes: [], edges: [], groups: [] } as never);
    editLink('missing', { color: 'purple' });
    expect(useUiStore.getState().linkColor).toBe('purple');
    editLink('missing', { color: undefined });
    expect(useUiStore.getState().linkColor).toBeNull();
    editLink('missing', { dashed: true });
    expect(useUiStore.getState().linkColor).toBeNull();
  });
});
