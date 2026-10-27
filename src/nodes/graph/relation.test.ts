import { ComputeEngine, compile } from '@cortex-js/compute-engine';
import { describe, expect, it } from 'vitest';
import { classifyRelation, type Relation } from './relation';

const engine = { ce: new ComputeEngine(), compile };
const read = (latex: string) => classifyRelation(engine, latex);
const must = (latex: string): Relation => {
  const relation = read(latex);
  if (!relation) throw new Error(`${latex} did not classify`);
  return relation;
};

describe('classifyRelation: curves of x', () => {
  it('reads a bare expression as y of x', () => {
    const r = must('x^2+1');
    expect(r.kind).toBe('y');
    expect(r.fn(3)).toBe(10);
    expect(must('\\sin(x)').fn(0)).toBe(0);
  });

  it('reads y= and f(x)= alike, whichever side y is on', () => {
    for (const latex of ['y=2x', 'f(x)=2x', 'g(x) = 2x', '2x=y']) {
      const r = must(latex);
      expect(r.kind).toBe('y');
      expect(r.fn(4)).toBe(8);
    }
    expect(must('y = \\frac{1}{x}').fn(4)).toBe(0.25);
  });

  it('plots a constant as a horizontal line', () => {
    expect(must('y=2')).toMatchObject({ kind: 'y' });
    expect(must('y=2').fn(99)).toBe(2);
    expect(must('3').fn(-1)).toBe(3);
  });
});

describe('classifyRelation: curves of y', () => {
  it('reads x= as x of y, so x=3 is a vertical line', () => {
    const r = must('x=3');
    expect(r.kind).toBe('x');
    expect(r.fn(0)).toBe(3);
    expect(r.fn(100)).toBe(3);
  });

  it('reads x=g(y)', () => {
    const r = must('x=y^2');
    expect(r.kind).toBe('x');
    expect(r.fn(3)).toBe(9);
  });
});

describe('classifyRelation: regions', () => {
  it('reads each inequality against the axis it is solved for', () => {
    expect(must('y>x')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(must('y\\le 2x+1')).toMatchObject({ kind: 'region', axis: 'y', op: '<=' });
    expect(must('x<3')).toMatchObject({ kind: 'region', axis: 'x', op: '<' });
    expect(must('x\\ge y^2')).toMatchObject({ kind: 'region', axis: 'x', op: '>=' });
  });

  it('flips the comparison when the variable is on the right', () => {
    expect(must('2x+1<y')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(must('3\\ge x')).toMatchObject({ kind: 'region', axis: 'x', op: '<=' });
    expect(must('2x+1<y').fn(1)).toBe(3);
  });
});

describe('classifyRelation: what it cannot draw', () => {
  it('gives null for empty, invalid and unsupported rows', () => {
    expect(read('')).toBeNull();
    expect(read('  ')).toBeNull();
    expect(read('x^2+')).toBeNull();
    expect(read('y')).toBeNull();
    expect(read('y=a x')).toBeNull();
    expect(read('t^2')).toBeNull();
  });
});
