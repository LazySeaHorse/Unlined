import { expect, it } from 'vitest';
import type { CompleteSpec } from '@/ai/inlineAsk';

/** Holds every example of a completion spec to its own check, with the answer put in at the caret. */
export function itTeachesOnlyLinesThatFit<Context>(spec: CompleteSpec<Context>) {
  it.each(spec.examples)(
    'teaches only lines that fit: $before',
    async ({ context, before, after, answer }) => {
      expect(answer).not.toContain('\n');
      expect(
        await spec.check(before + answer + (after ?? ''), context, {
          before,
          line: answer,
          after: after ?? '',
        }),
      ).toBe(true);
    },
  );
}
