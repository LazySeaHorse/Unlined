import { z } from 'zod';
import { edgeSchema, stripEdge } from '@/lib/links';
import type { AppNode, CanvasContent, CanvasEdge } from '@/model/types';
import { nodeKinds, nodeSpecs } from '@/nodes/catalog';
import { stripTransient } from '@/nodes/factory';

/**
 * JSON import/export format. Bump `version` (and add a migration) if the shape ever changes.
 * Version 2 added links, version 3 stacks; a file is written with the lowest version that holds it, so older
 * builds can open what they understand.
 */
const APP_TAG = 'unlined';
const VERSION = 1;
const LINKS_VERSION = 2;
const STACKS_VERSION = 3;

const versionFor = (nodes: AppNode[], edges: unknown[] | undefined) =>
  nodes.some((n) => n.type === 'stack') ? STACKS_VERSION : edges?.length ? LINKS_VERSION : VERSION;

const point = z.object({ x: z.number(), y: z.number() });
const viewportSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() });
const groupSchema = z.object({ id: z.string(), nodeIds: z.array(z.string()) });

const nodeSchema = z.discriminatedUnion(
  'type',
  nodeKinds.map((kind) =>
    z.object({
      id: z.string(),
      type: z.literal(kind),
      position: point,
      data: nodeSpecs[kind].schema,
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    }),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]],
) as unknown as z.ZodType<AppNode>;

const header = {
  app: z.literal(APP_TAG),
  version: z.union([z.literal(VERSION), z.literal(LINKS_VERSION), z.literal(STACKS_VERSION)]),
};

const exportFileSchema = z.discriminatedUnion('kind', [
  z.object({
    ...header,
    kind: z.literal('canvases'),
    canvases: z.array(
      z.object({
        name: z.string(),
        nodes: z.array(nodeSchema),
        viewport: viewportSchema,
        groups: z.array(groupSchema).optional(),
        edges: z.array(edgeSchema).optional(),
        fronts: z.record(z.string(), z.string()).optional(),
      }),
    ),
  }),
  z.object({
    ...header,
    kind: z.literal('nodes'),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema).optional(),
  }),
]);

export type ExportFile = z.infer<typeof exportFileSchema>;
export type CanvasesFile = Extract<ExportFile, { kind: 'canvases' }>;
export type NodesFile = Extract<ExportFile, { kind: 'nodes' }>;
export type NamedCanvas = { name: string } & CanvasContent;

export const exportCanvases = (canvases: NamedCanvas[]): CanvasesFile => ({
  app: APP_TAG,
  version: Math.max(VERSION, ...canvases.map((c) => versionFor(c.nodes, c.edges))) as 1 | 2 | 3,
  kind: 'canvases',
  canvases: canvases.map((c) => ({
    name: c.name,
    nodes: c.nodes.map(stripTransient),
    viewport: c.viewport,
    ...(c.groups ? { groups: c.groups } : {}),
    ...(c.edges?.length ? { edges: c.edges.map(stripEdge) } : {}),
    ...(c.fronts ? { fronts: c.fronts } : {}),
  })),
});

export const exportNodes = (nodes: AppNode[], edges: CanvasEdge[] = []): NodesFile => ({
  app: APP_TAG,
  version: versionFor(nodes, edges),
  kind: 'nodes',
  nodes: nodes.map(stripTransient),
  ...(edges.length > 0 ? { edges: edges.map(stripEdge) } : {}),
});

export class ImportError extends Error {}

export function parseExportFile(text: string): ExportFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('File is not valid JSON.');
  }
  const result = exportFileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ImportError(`Not an Unlined export (${issue.path.join('.') || 'root'}: ${issue.message}).`);
  }
  return result.data;
}
