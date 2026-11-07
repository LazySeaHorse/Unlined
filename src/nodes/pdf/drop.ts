const isPdfType = (type: string) => type === 'application/pdf';
const isPdfName = (name: string) => name.toLowerCase().endsWith('.pdf');

/**
 * True while a drag carries files. What kind they are is not reliably known until the drop (some browsers hide the
 * type, and all hide the name), so every file drag is accepted and sorted when it lands.
 */
export function dragHasFiles(data: Pick<DataTransfer, 'items'>): boolean {
  return Array.from(data.items).some((item) => item.kind === 'file');
}

/** The image files in a drop. Must be called during the drop event. */
export const imageFilesFromDrop = (data: Pick<DataTransfer, 'files'>): File[] =>
  Array.from(data.files).filter((file) => file.type.startsWith('image/'));

/** Whether a drop holds a PDF file, which only some browsers can link. Must be called during the drop event. */
export const dropHasPdf = (data: Pick<DataTransfer, 'files'>): boolean =>
  Array.from(data.files).some((file) => isPdfType(file.type) || isPdfName(file.name));

/**
 * The links to the PDF files dropped. Must be called during the drop event: browsers empty the items
 * straight after it. Needs `getAsFileSystemHandle` (Chromium); other browsers get none.
 */
export async function pdfHandlesFromDrop(data: Pick<DataTransfer, 'items'>): Promise<FileSystemFileHandle[]> {
  const pending = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.getAsFileSystemHandle)
    .map((item) => item.getAsFileSystemHandle?.());
  const handles = await Promise.all(pending);
  return handles.filter(
    (handle): handle is FileSystemFileHandle =>
      handle?.kind === 'file' &&
      (isPdfName(handle.name) || isPdfType((handle as { type?: string }).type ?? '')),
  );
}
