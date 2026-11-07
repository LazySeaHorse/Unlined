import { useReactFlow, type XYPosition } from '@xyflow/react';
import { toast } from 'sonner';
import { downloadJson, imageSize, pickFile, readAsDataUrl, slugify } from '@/lib/files';
import type { NodeKind } from '@/model/types';
import { nodeSpecs } from '@/nodes/catalog';
import { createNode } from '@/nodes/factory';
import { imageBox } from '@/nodes/image/spec';
import { addPdfNode, pickPdfHandle } from '@/nodes/pdf/actions';
import { dropHasPdf, imageFilesFromDrop, pdfHandlesFromDrop } from '@/nodes/pdf/drop';
import { toEmbedUrl } from '@/nodes/video/embedUrl';
import { normaliseWebUrl } from '@/nodes/web/url';
import { ImportError, parseExportFile } from '@/persistence/io';
import { useCanvasStore } from '@/store/canvasStore';
import * as workspace from '@/store/workspace';
import { askText } from '@/ui/dialogs';
import { celebrate } from '@/ui/toast';

/** Space between files dropped together. */
const DROP_GAP = 20;

/** User-facing canvas actions that need the viewport (where to put things) and UI feedback. */
export function useCanvasActions() {
  const { screenToFlowPosition } = useReactFlow();

  /** Flow position that puts a box of `size` in the middle of the screen. */
  const centered = (size = { width: 0, height: 0 }): XYPosition => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: center.x - size.width / 2, y: center.y - size.height / 2 };
  };

  const addNode = (kind: NodeKind, position: XYPosition) =>
    useCanvasStore.getState().addNodes([createNode(kind, position)]);

  const readImage = async (file: File) => {
    const src = await readAsDataUrl(file);
    return { src, size: imageBox(await imageSize(src)) };
  };

  const insertImage = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    const { src, size } = await readImage(file);
    useCanvasStore.getState().addNodes([createNode('image', centered(size), { src }, size)]);
  };

  const insertVideo = async () => {
    const url = await askText({
      title: 'Embed video',
      label: 'YouTube, Vimeo or embed URL',
      placeholder: 'https://',
    });
    if (!url) return;
    if (!toEmbedUrl(url)) {
      toast.error('That does not look like a video URL');
      return;
    }
    const node = createNode('video', { x: 0, y: 0 }, { url });
    useCanvasStore
      .getState()
      .addNodes([{ ...node, position: centered({ width: node.width ?? 0, height: node.height ?? 0 }) }]);
  };

  const insertWeb = async () => {
    const text = await askText({
      title: 'Open a website',
      label: 'Web address',
      placeholder: 'https://gemini.google.com/app',
    });
    if (!text) return;
    const url = normaliseWebUrl(text);
    if (!url) {
      toast.error('That does not look like a web address');
      return;
    }
    const node = createNode('web', { x: 0, y: 0 }, { url });
    useCanvasStore
      .getState()
      .addNodes([{ ...node, position: centered({ width: node.width ?? 0, height: node.height ?? 0 }) }]);
  };

  const insertPdf = async () => {
    try {
      const handle = await pickPdfHandle();
      if (handle) await addPdfNode(handle, centered(nodeSpecs.pdf.size));
    } catch {
      toast.error('Could not open that PDF');
    }
  };

  /**
   * Adds the images and links the PDF files in a drop, side by side from `at` (the middle of the first). The
   * browser empties the drop once its event ends, so everything is taken from it before anything is awaited.
   */
  const dropFiles = async (data: DataTransfer, at: XYPosition) => {
    const images = imageFilesFromDrop(data);
    const canLinkPdfs = nodeSpecs.pdf.available?.() !== false;
    const pdfDropped = dropHasPdf(data);
    const pdfs = canLinkPdfs ? pdfHandlesFromDrop(data) : Promise.resolve([]);

    const pdfSize = nodeSpecs.pdf.size ?? { width: 0, height: 0 };
    let left: number | undefined;
    const place = ({ width, height }: { width: number; height: number }): XYPosition => {
      const x = left ?? at.x - width / 2;
      left = x + width + DROP_GAP;
      return { x, y: at.y - height / 2 };
    };

    try {
      const [loaded, handles] = await Promise.all([Promise.all(images.map(readImage)), pdfs]);
      if (loaded.length > 0)
        useCanvasStore
          .getState()
          .addNodes(loaded.map(({ src, size }) => createNode('image', place(size), { src }, size)));
      for (const handle of handles) await addPdfNode(handle, place(pdfSize));
      if (loaded.length + handles.length > 0) return;
      toast.error(
        pdfDropped && !canLinkPdfs
          ? 'PDFs can only be linked in Chrome or Edge'
          : 'Only images and PDFs can be dropped here',
      );
    } catch {
      toast.error('Could not open that file');
    }
  };

  const importJson = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      celebrate(await workspace.importFile(parseExportFile(await file.text()), centered()));
    } catch (error) {
      toast.error(error instanceof ImportError ? error.message : 'Import failed');
    }
  };

  const exportJson = async (scope: 'selection' | 'canvas' | 'all') => {
    const date = new Date().toISOString().slice(0, 10);
    if (scope === 'selection') {
      downloadJson(`nodes-${date}.json`, workspace.exportSelectedNodes());
    } else if (scope === 'canvas') {
      const file = await workspace.exportCurrentCanvas();
      const name = file.kind === 'canvases' ? (file.canvases[0]?.name ?? 'canvas') : 'canvas';
      downloadJson(`${slugify(name)}-${date}.json`, file);
    } else {
      downloadJson(`unlined-${date}.json`, await workspace.exportAllCanvases());
    }
  };

  return { addNode, insertImage, insertVideo, insertWeb, insertPdf, dropFiles, importJson, exportJson };
}
