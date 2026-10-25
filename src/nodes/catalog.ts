import type { NodeKind } from '@/model/types';
import { codeSpec } from './code/spec';
import { graphSpec } from './graph/spec';
import { imageSpec } from './image/spec';
import { mathSpec } from './math/spec';
import { mathPlusSpec } from './mathPlus/spec';
import { pdfSpec } from './pdf/spec';
import { sectionSpec } from './section/spec';
import { sheetSpec } from './sheet/spec';
import type { NodeSpec } from './spec';
import { stackSpec } from './stack/spec';
import { tableSpec } from './table/spec';
import { textSpec } from './text/spec';
import { videoSpec } from './video/spec';
import { webSpec } from './web/spec';

/** Registry of node kinds, in toolbar order. */
export const nodeSpecs: { [K in NodeKind]: NodeSpec<K> } = {
  text: textSpec,
  math: mathSpec,
  mathPlus: mathPlusSpec,
  graph: graphSpec,
  table: tableSpec,
  sheet: sheetSpec,
  code: codeSpec,
  image: imageSpec,
  video: videoSpec,
  web: webSpec,
  pdf: pdfSpec,
  section: sectionSpec,
  stack: stackSpec,
};

export const nodeKinds = Object.keys(nodeSpecs) as NodeKind[];

/** Kinds with a toolbar button, in toolbar order. Wrap kinds and unavailable kinds have none. */
export function toolbarKinds(): NodeKind[] {
  return nodeKinds.filter((kind) => {
    const spec = nodeSpecs[kind];
    return spec.placement !== 'wrap' && spec.available?.() !== false;
  });
}

/** The kind that the number key (1-9, then 0) picks as a tool, or undefined. Only place-by-click kinds are tools. */
export function kindForNumberKey(key: string): NodeKind | undefined {
  if (!/^[0-9]$/.test(key)) return undefined;
  const kind = toolbarKinds().slice(0, 10)[(Number(key) + 9) % 10];
  return kind && nodeSpecs[kind].placement === 'place' ? kind : undefined;
}

/** The number key label for a kind's toolbar button, or undefined past the tenth. */
export function numberKeyFor(kind: NodeKind): string | undefined {
  const index = toolbarKinds().indexOf(kind);
  return index >= 0 && index < 10 ? String((index + 1) % 10) : undefined;
}
