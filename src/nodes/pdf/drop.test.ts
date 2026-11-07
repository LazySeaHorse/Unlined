import { describe, expect, it } from 'vitest';
import { dragHasFiles, dropHasPdf, imageFilesFromDrop, pdfHandlesFromDrop } from './drop';

const item = (kind: string, type: string, handle?: unknown) =>
  ({
    kind,
    type,
    getAsFileSystemHandle: handle === undefined ? undefined : async () => handle,
  }) as unknown as DataTransferItem;
const drop = (...items: DataTransferItem[]) => ({ items }) as unknown as Pick<DataTransfer, 'items'>;
const file = (name: string) => ({ kind: 'file', name }) as FileSystemHandle;

const files = (...list: Partial<File>[]) => ({ files: list }) as unknown as Pick<DataTransfer, 'files'>;

describe('dragHasFiles', () => {
  it('accepts a drag of files whatever their type, which browsers may hide until the drop', () => {
    expect(dragHasFiles(drop(item('file', '')))).toBe(true);
    expect(dragHasFiles(drop(item('string', 'text/plain'), item('file', 'image/png')))).toBe(true);
  });

  it('ignores a drag of text', () => {
    expect(dragHasFiles(drop(item('string', 'text/plain'), item('string', 'text/uri-list')))).toBe(false);
  });
});

describe('imageFilesFromDrop', () => {
  it('keeps the images', () => {
    const png = { name: 'a.png', type: 'image/png' };
    expect(imageFilesFromDrop(files(png, { name: 'b.pdf', type: 'application/pdf' }))).toEqual([png]);
  });
});

describe('dropHasPdf', () => {
  it('knows a PDF by its type or its name', () => {
    expect(dropHasPdf(files({ name: 'a', type: 'application/pdf' }))).toBe(true);
    expect(dropHasPdf(files({ name: 'Paper.PDF', type: '' }))).toBe(true);
    expect(dropHasPdf(files({ name: 'a.png', type: 'image/png' }))).toBe(false);
  });
});

describe('pdfHandlesFromDrop', () => {
  it('keeps the PDF files', async () => {
    const pdf = file('paper.PDF');
    const handles = await pdfHandlesFromDrop(
      drop(item('file', 'application/pdf', pdf), item('file', 'image/png', file('a.png'))),
    );
    expect(handles).toEqual([pdf]);
  });

  it('skips folders and items without a handle', async () => {
    const folder = { kind: 'directory', name: 'x.pdf' };
    expect(
      await pdfHandlesFromDrop(
        drop(item('file', 'application/pdf', folder), item('file', 'application/pdf')),
      ),
    ).toEqual([]);
  });
});
