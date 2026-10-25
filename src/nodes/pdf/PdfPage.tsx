import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { loadPdfjs } from './pdfjs';

/** Rendering is capped so a zoomed-in canvas or a big page never asks for a huge bitmap. */
const MAX_PIXEL_RATIO = 3;
const MAX_BITMAP_SIDE = 3000;
/** Resizing re-renders only once it settles; until then the last bitmap is stretched. */
const RENDER_DELAY_MS = 120;

export interface PdfPageProps {
  doc: PDFDocumentProxy;
  /** 1-based. */
  page: number;
  /** The page is scaled to this width or height in CSS pixels; the other side follows its shape. */
  fit: { width: number } | { height: number };
  /** Device pixels per CSS pixel to render at: the screen's density times the canvas zoom. */
  pixelRatio?: number;
  /** Lays selectable text over the page. */
  text?: boolean;
  className?: string;
}

/** One PDF page drawn on a canvas. */
export function PdfPage({
  doc,
  page: pageNumber,
  fit,
  pixelRatio = window.devicePixelRatio,
  text,
  className,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<PDFPageProxy>();
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setDrawn(false);
    doc
      .getPage(pageNumber)
      .then((loaded) => live && setPage(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [doc, pageNumber]);

  const natural = page?.getViewport({ scale: 1 });
  const width = 'width' in fit ? fit.width : natural ? (fit.height * natural.width) / natural.height : 0;
  const height = 'height' in fit ? fit.height : natural ? (fit.width * natural.height) / natural.width : 0;
  const cssScale = natural && natural.width > 0 ? width / natural.width : 0;
  // Rounded so a one-pixel resize does not count as a change.
  const bitmapScale = Math.ceil(cssScale * Math.min(MAX_PIXEL_RATIO, pixelRatio) * 8) / 8;

  useEffect(() => {
    const target = canvasRef.current;
    if (!page || !target || bitmapScale <= 0) return;
    let live = true;
    let task: ReturnType<PDFPageProxy['render']> | undefined;
    const timer = setTimeout(async () => {
      let viewport = page.getViewport({ scale: bitmapScale });
      const longest = Math.max(viewport.width, viewport.height);
      if (longest > MAX_BITMAP_SIDE)
        viewport = page.getViewport({ scale: (bitmapScale * MAX_BITMAP_SIDE) / longest });
      // Drawn off screen and copied over, so the visible page never blanks while it re-renders.
      const buffer = document.createElement('canvas');
      buffer.width = Math.ceil(viewport.width);
      buffer.height = Math.ceil(viewport.height);
      task = page.render({ canvas: buffer, viewport });
      try {
        await task.promise;
      } catch {
        if (live) setFailed(true);
        return;
      }
      if (!live) return;
      target.width = buffer.width;
      target.height = buffer.height;
      target.getContext('2d')?.drawImage(buffer, 0, 0);
      setDrawn(true);
    }, RENDER_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [page, bitmapScale]);

  useEffect(() => {
    const container = textRef.current;
    if (!text || !page || !container || cssScale <= 0) return;
    let layer: { cancel: () => void } | undefined;
    let live = true;
    const timer = setTimeout(async () => {
      const { TextLayer } = await loadPdfjs();
      if (!live) return;
      container.replaceChildren();
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale: cssScale }),
      });
      layer = textLayer;
      textLayer.render().catch(() => {});
    }, RENDER_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      layer?.cancel();
    };
  }, [text, page, cssScale]);

  if (failed)
    return (
      <div
        className={cn('flex items-center justify-center bg-surface-2 text-xs text-muted', className)}
        style={{ width: width || 120, height: height || 160 }}
      >
        Page {pageNumber} failed to load
      </div>
    );

  return (
    <div
      className={cn('relative shrink-0 bg-white', drawn ? 'page-drawn' : 'animate-pulse', className)}
      style={{ width: width || 120, height: height || 160 }}
    >
      <canvas
        ref={canvasRef}
        className={cn('size-full', !drawn && 'invisible')}
        role="img"
        aria-label={`Page ${pageNumber}`}
      />
      {text && (
        <div
          ref={textRef}
          className="pdf-text-layer"
          style={{ '--total-scale-factor': cssScale, width, height } as CSSProperties}
        />
      )}
    </div>
  );
}
