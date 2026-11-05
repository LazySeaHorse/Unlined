import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../Markdown';
import { inkColor, inkDeclaration } from './ink';
import { Tex } from './Tex';

const styleOf = (css: string) => {
  const { style } = document.createElement('span');
  style.cssText = css;
  return style;
};

describe('inkColor', () => {
  it('maps the neutrals to theme tokens, whatever the spelling', () => {
    expect(inkColor('black')).toBe('var(--ink-black)');
    expect(inkColor('Gray')).toBe('var(--ink-grey)');
    expect(inkColor('dark-gray')).toBe('var(--ink-dark-grey)');
  });

  it('leaves real colours to the renderer', () => {
    expect(inkColor('red')).toBeUndefined();
    expect(inkColor('#000')).toBeUndefined();
  });
});

describe('inkDeclaration', () => {
  it('swaps neutral text and background colours', () => {
    const text = styleOf('margin-right: 0.07em; color: grey;');
    expect(inkDeclaration(text)).toBe(true);
    expect(text.color).toBe('var(--ink-grey)');
    expect(text.marginRight).toBe('0.07em');
    const background = styleOf('background-color: white;');
    inkDeclaration(background);
    expect(background.backgroundColor).toBe('var(--ink-bg-white)');
  });

  it('leaves other colours and look-alike names alone', () => {
    for (const css of ['color: red;', 'color: rgb(0, 0, 0);', 'color: whitesmoke;', 'border-color: black;']) {
      const style = styleOf(css);
      expect(inkDeclaration(style)).toBe(false);
      expect(style.cssText).toBe(css);
    }
  });
});

describe('neutral math colours follow the theme', () => {
  it('in KaTeX', () => {
    const { container } = render(<Tex latex={'\\textcolor{black}{x}+\\textcolor{red}{y}'} />);
    const colors = [...container.querySelectorAll<HTMLElement>('[style]')].map((e) => e.style.color);
    expect(colors).toContain('var(--ink-black)');
    expect(colors).toContain('red');
    expect(colors).not.toContain('black');
  });

  it('in markdown', () => {
    const { container } = render(<Markdown source={'$\\textcolor{black}{x}$'} />);
    const colors = [...container.querySelectorAll<HTMLElement>('.katex [style]')].map((e) => e.style.color);
    expect(colors).toContain('var(--ink-black)');
  });
});

describe('Tex', () => {
  it('draws the commands MathLive writes for e, i and d, which KaTeX lacks', () => {
    const { container } = render(<Tex latex="\exponentialE^{-1}+\imaginaryI\,\differentialD x" />);
    expect(container.querySelector('.katex-error')).toBeNull();
  });
});
