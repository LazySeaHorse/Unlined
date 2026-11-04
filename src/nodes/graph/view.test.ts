import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphView } from './view';

describe('useGraphView', () => {
  beforeEach(() => useGraphView.setState({ moved: {}, fits: {} }));

  it('unmove clears only the moved flag, so the plot fits again when it comes back', () => {
    const s = useGraphView.getState();
    s.markMoved('a');
    s.fit('b');
    s.unmove('a');
    expect(useGraphView.getState().moved).toEqual({});
    expect(useGraphView.getState().fits).toEqual({ b: 1 });
  });

  it('forget drops everything kept for a node', () => {
    const s = useGraphView.getState();
    s.markMoved('a');
    s.fit('a');
    s.markMoved('b');
    s.forget('a');
    expect(useGraphView.getState().moved).toEqual({ b: true });
    expect(useGraphView.getState().fits).toEqual({});
  });
});
