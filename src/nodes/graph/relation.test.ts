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
/** A row that plots one variable against the other, so its function takes one number. */
const curve = (latex: string) => {
  const relation = must(latex);
  if (relation.kind === 'implicit' || relation.kind === 'shade')
    throw new Error(`${latex} is ${relation.kind}`);
  return relation;
};

describe('classifyRelation: curves of x', () => {
  it('reads a bare expression as y of x', () => {
    const r = curve('x^2+1');
    expect(r.kind).toBe('y');
    expect(r.fn(3)).toBe(10);
    expect(curve('\\sin(x)').fn(0)).toBe(0);
  });

  it('reads y= and f(x)= alike, whichever side y is on', () => {
    for (const latex of ['y=2x', 'f(x)=2x', 'g(x) = 2x', '2x=y']) {
      const r = curve(latex);
      expect(r.kind).toBe('y');
      expect(r.fn(4)).toBe(8);
    }
    expect(curve('y = \\frac{1}{x}').fn(4)).toBe(0.25);
  });

  it('plots a constant as a horizontal line', () => {
    expect(curve('y=2')).toMatchObject({ kind: 'y' });
    expect(curve('y=2').fn(99)).toBe(2);
    expect(curve('3').fn(-1)).toBe(3);
  });
});

describe('classifyRelation: curves of y', () => {
  it('reads x= as x of y, so x=3 is a vertical line', () => {
    const r = curve('x=3');
    expect(r.kind).toBe('x');
    expect(r.fn(0)).toBe(3);
    expect(r.fn(100)).toBe(3);
  });

  it('reads x=g(y)', () => {
    const r = curve('x=y^2');
    expect(r.kind).toBe('x');
    expect(r.fn(3)).toBe(9);
  });
});

describe('classifyRelation: regions', () => {
  it('reads each inequality against the axis it is solved for', () => {
    expect(curve('y>x')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(curve('y\\le 2x+1')).toMatchObject({ kind: 'region', axis: 'y', op: '<=' });
    expect(curve('x<3')).toMatchObject({ kind: 'region', axis: 'x', op: '<' });
    expect(curve('x\\ge y^2')).toMatchObject({ kind: 'region', axis: 'x', op: '>=' });
  });

  it('flips the comparison when the variable is on the right', () => {
    expect(curve('2x+1<y')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(curve('3\\ge x')).toMatchObject({ kind: 'region', axis: 'x', op: '<=' });
    expect(curve('2x+1<y').fn(1)).toBe(3);
  });
});

describe('classifyRelation: implicit curves', () => {
  it('reads an equation in both x and y as the curve where its sides agree', () => {
    const circle = must('x^2+y^2=1');
    expect(circle.kind).toBe('implicit');
    if (circle.kind !== 'implicit') return;
    expect(circle.fn(1, 0)).toBe(0);
    expect(circle.fn(0, 2)).toBe(3);
    expect(must('xy=1')).toMatchObject({ kind: 'implicit' });
  });
});

describe('classifyRelation: shaded areas', () => {
  const shade = (latex: string) => {
    const relation = must(latex);
    if (relation.kind !== 'shade') throw new Error(`${latex} is ${relation.kind}`);
    return relation;
  };

  it('shades where every comparison of a chain holds', () => {
    const band = shade('1\\le\\left|x\\right|\\le2');
    expect(band.strict).toBe(false);
    expect(band.fn(1.5, 0)).toBeCloseTo(0.5);
    expect(band.fn(-1.5, 7)).toBeCloseTo(0.5);
    expect(band.fn(0, 0)).toBeLessThan(0);
    expect(band.fn(3, 0)).toBeLessThan(0);
    expect(shade('0\\le y\\le x^2').fn(2, 1)).toBeGreaterThan(0);
    expect(shade('0\\le y\\le x^2').fn(2, 5)).toBeLessThan(0);
  });

  it('reads chains written downwards, and strict ones', () => {
    expect(shade('2>x>1').fn(1.5, 0)).toBeGreaterThan(0);
    expect(shade('2>x>1').strict).toBe(true);
  });

  it('shades inequalities that cannot be solved for x or for y', () => {
    expect(shade('|x|<2').fn(1, 0)).toBeGreaterThan(0);
    expect(shade('|x|<2').fn(3, 0)).toBeLessThan(0);
    expect(shade('x^2+y^2<4').fn(0, 0)).toBe(4);
    expect(shade('x^2+y^2\\ge4').fn(3, 0)).toBe(5);
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
    expect(read('t<2')).toBeNull();
    expect(read('1<2')).toBeNull();
    expect(read('1=1')).toBeNull();
  });
});
