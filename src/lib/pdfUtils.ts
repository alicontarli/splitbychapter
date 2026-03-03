import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

// Helper to ensure pdfjs is loaded (client-side only)
async function ensurePdfjsLoaded() {
  if (typeof window === 'undefined') {
    throw new Error('PDF processing only works in browser');
  }
  
  const pdfjsLib = await import('pdfjs-dist');
  
  // Configure worker
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  }
  
  return pdfjsLib;
}

export interface ToCItem {
  id: string;
  title: string;
  level: number;
  pageNumber: number;
  children: ToCItem[];
  startPage?: number;
  endPage?: number;
  expanded?: boolean;
  checked?: boolean;
}

export interface PDFMetadata {
  title: string;
  author?: string;
  pages: number;
  toc: ToCItem[];
}

/**
 * Load a PDF file from ArrayBuffer or File
 */
export async function loadPDF(file: File | ArrayBuffer) {
  const pdfjs = await ensurePdfjsLoaded();
  const data = file instanceof File ? await file.arrayBuffer() : file;
  return pdfjs.getDocument({ data }).promise;
}

/**
 * Extract text from a PDF page
 */
export async function extractPageText(
  pdf: any,
  pageNumber: number
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  return textContent.items
    .map((item: any) => (typeof item.str !== 'undefined' ? item.str : ''))
    .join('');
}

/**
 * Extract Table of Contents from PDF outline/bookmarks
 * Supports up to 3 hierarchical levels
 */
export async function extractTableOfContents(
  pdf: any
): Promise<ToCItem[]> {
  try {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) {
      return [];
    }

    const toc: ToCItem[] = [];
    let itemCounter = 0;

    const resolveOutlinePageNumber = async (outlineItem: any): Promise<number> => {
      try {
        let destination = outlineItem?.dest;

        if (typeof destination === 'string') {
          destination = await pdf.getDestination(destination);
        }

        if (Array.isArray(destination) && destination.length > 0) {
          const pageRef = destination[0];

          if (typeof pageRef === 'number') {
            return Math.max(1, pageRef + 1);
          }

          if (pageRef && typeof pageRef === 'object') {
            const pageIndex = await pdf.getPageIndex(pageRef);
            return Math.max(1, pageIndex + 1);
          }
        }
      } catch {
        // Fallback below
      }

      return 1;
    };

    const processOutlineItems = async (
      items: any[],
      level: number = 1,
      parentId: string = ''
    ): Promise<ToCItem[]> => {
      if (level > 3) return []; // Limit to 3 levels

      const results: ToCItem[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        itemCounter++;
        const id = parentId ? `${parentId}-${index}` : `${index}`;

        const pageNumber = await resolveOutlinePageNumber(item);

        const tocItem: ToCItem = {
          id,
          title: item.title || `Item ${itemCounter}`,
          level,
          pageNumber: Math.max(1, pageNumber),
          children: [],
          startPage: Math.max(1, pageNumber),
          expanded: false,
          checked: true,
        };

        // Recursively process children if they exist
        if (item.items && item.items.length > 0 && level < 3) {
          tocItem.children = await processOutlineItems(item.items, level + 1, id);
        }

        results.push(tocItem);
      }

      return results;
    };

    return await processOutlineItems(outline);
  } catch (error) {
    console.error('Error extracting table of contents:', error);
    return [];
  }
}

/**
 * Calculate end page for each ToC item using sibling boundaries.
 * This keeps L1/L2/L3 ranges consistent and avoids cross-level truncation.
 */
export function calculatePageRanges(toc: ToCItem[], totalPages: number): ToCItem[] {
  const assignRanges = (items: ToCItem[], parentEnd: number) => {
    for (let index = 0; index < items.length; index++) {
      const current = items[index];
      const startPage = Math.max(1, current.startPage || current.pageNumber || 1);
      const nextSibling = items[index + 1];
      const nextSiblingStart = nextSibling
        ? Math.max(1, nextSibling.startPage || nextSibling.pageNumber || 1)
        : parentEnd + 1;

      const siblingBoundEnd = Math.min(parentEnd, nextSiblingStart - 1);
      current.startPage = startPage;
      current.endPage = Math.max(startPage, siblingBoundEnd);

      if (current.children && current.children.length > 0) {
        assignRanges(current.children, current.endPage);
      }
    }
  };

  assignRanges(toc, totalPages);
  return toc;
}

/**
 * Get PDF metadata including title, author, and page count
 */
export async function getPDFMetadata(pdf: any): Promise<Omit<PDFMetadata, 'toc'>> {
  const metadata = await pdf.getMetadata().catch(() => null);
  const pageCount = await pdf.numPages;

  return {
    title: metadata?.info?.Title || 'Untitled PDF',
    author: metadata?.info?.Author || undefined,
    pages: pageCount,
  };
}

/**
 * Complete PDF metadata extraction
 */
export async function extractPDFMetadata(file: File | ArrayBuffer): Promise<PDFMetadata> {
  const pdf = await loadPDF(file);
  const metadata = await getPDFMetadata(pdf);
  let toc = await extractTableOfContents(pdf);

  // Calculate end pages
  toc = calculatePageRanges(toc, metadata.pages);

  return {
    ...metadata,
    toc,
  };
}

/**
 * Get all selected items from the ToC tree (flattened)
 */
export function getSelectedItems(toc: ToCItem[]): ToCItem[] {
  const selected: ToCItem[] = [];

  const traverse = (items: ToCItem[]) => {
    items.forEach((item) => {
      if (item.checked) {
        selected.push(item);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    });
  };

  traverse(toc);
  return selected;
}

/**
 * Toggle expand/collapse state for a ToC item
 */
export function toggleExpanded(toc: ToCItem[], itemId: string): ToCItem[] {
  const toggle = (items: ToCItem[]): ToCItem[] => {
    return items.map((item) => {
      if (item.id === itemId) {
        return { ...item, expanded: !item.expanded };
      }
      if (item.children && item.children.length > 0) {
        return { ...item, children: toggle(item.children) };
      }
      return item;
    });
  };

  return toggle(toc);
}

/**
 * Update checked state for a ToC item
 */
export function updateCheckedState(
  toc: ToCItem[],
  itemId: string,
  checked: boolean,
  cascadeChildren: boolean = true
): ToCItem[] {
  const update = (items: ToCItem[]): ToCItem[] => {
    return items.map((item) => {
      if (item.id === itemId) {
        const updated = { ...item, checked };
        if (cascadeChildren && item.children && item.children.length > 0) {
          updated.children = cascadeCheckState(item.children, checked);
        }
        return updated;
      }
      if (item.children && item.children.length > 0) {
        return { ...item, children: update(item.children) };
      }
      return item;
    });
  };

  return update(toc);
}

/**
 * Cascade check state to all children
 */
function cascadeCheckState(items: ToCItem[], checked: boolean): ToCItem[] {
  return items.map((item) => ({
    ...item,
    checked,
    children: item.children ? cascadeCheckState(item.children, checked) : [],
  }));
}

interface ExportPageRange {
  start: number;
  end: number;
}

function buildExportRanges(
  selectedItems: ToCItem[],
  totalPages: number,
  duplicateBoundaryPages: boolean
): ExportPageRange[] {
  const ranges = selectedItems
    .map((item) => ({
      start: Math.max(1, item.startPage || item.pageNumber || 1),
      end: Math.min(totalPages, Math.max(item.startPage || 1, item.endPage || totalPages)),
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (!duplicateBoundaryPages) {
    if (ranges.length === 0) return [];

    const merged: ExportPageRange[] = [];
    let current = { ...ranges[0] };

    for (let index = 1; index < ranges.length; index++) {
      const next = ranges[index];
      if (next.start <= current.end + 1) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  const withBoundaryOverlap = ranges.map((range) => ({ ...range }));
  for (let index = 0; index < withBoundaryOverlap.length - 1; index++) {
    const current = withBoundaryOverlap[index];
    const next = withBoundaryOverlap[index + 1];

    if (next.start === current.end + 1) {
      current.end = Math.min(totalPages, current.end + 1);
    }
  }

  return withBoundaryOverlap;
}

export async function createSplitPdf(params: {
  sourceFile: File | ArrayBuffer;
  selectedItems: ToCItem[];
  duplicateBoundaryPages?: boolean;
}): Promise<Uint8Array> {
  const { sourceFile, selectedItems, duplicateBoundaryPages = true } = params;

  if (!selectedItems.length) {
    throw new Error('No chapters selected for export.');
  }

  const sourceBytes = sourceFile instanceof File ? await sourceFile.arrayBuffer() : sourceFile;
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const outputPdf = await PDFDocument.create();
  const totalPages = sourcePdf.getPageCount();

  const ranges = buildExportRanges(selectedItems, totalPages, duplicateBoundaryPages);
  if (!ranges.length) {
    throw new Error('Selected chapters do not map to valid page ranges. Please re-parse the PDF and try again.');
  }

  for (const range of ranges) {
    const pageIndexes: number[] = [];
    for (let page = range.start; page <= range.end; page++) {
      pageIndexes.push(page - 1);
    }

    if (pageIndexes.length === 0) continue;
    const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);
    copiedPages.forEach((page) => outputPdf.addPage(page));
  }

  return outputPdf.save();
}

function sanitizeFilenamePart(input: string) {
  return input
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'chapter';
}

export async function createSplitZip(params: {
  sourceFile: File | ArrayBuffer;
  selectedItems: ToCItem[];
  duplicateBoundaryPages?: boolean;
  onProgress?: (progress: number, current: number, total: number) => void;
}): Promise<Uint8Array> {
  const { sourceFile, selectedItems, duplicateBoundaryPages = true, onProgress } = params;

  if (!selectedItems.length) {
    throw new Error('No chapters selected for export.');
  }

  const sourceBytes = sourceFile instanceof File ? await sourceFile.arrayBuffer() : sourceFile;
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const totalPages = sourcePdf.getPageCount();

  const hasCheckedDescendant = (item: ToCItem): boolean => {
    if (!item.children || item.children.length === 0) return false;
    return item.children.some((child) => !!child.checked || hasCheckedDescendant(child));
  };

  const effectiveSelectedItems = selectedItems.filter((item) => !hasCheckedDescendant(item));
  const exportItems = effectiveSelectedItems.length > 0 ? effectiveSelectedItems : selectedItems;

  const sortedItems = [...exportItems].sort((a, b) => {
    const aStart = a.startPage || a.pageNumber || 1;
    const bStart = b.startPage || b.pageNumber || 1;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = a.endPage || totalPages;
    const bEnd = b.endPage || totalPages;
    return aEnd - bEnd;
  });

  const dedupedByRange = sortedItems.filter((item, index, array) => {
    const start = item.startPage || item.pageNumber || 1;
    const end = item.endPage || totalPages;
    const prev = index > 0 ? array[index - 1] : null;
    if (!prev) return true;

    const prevStart = prev.startPage || prev.pageNumber || 1;
    const prevEnd = prev.endPage || totalPages;
    return !(start === prevStart && end === prevEnd);
  });

  const zip = new JSZip();
  const totalItems = dedupedByRange.length;

  for (let index = 0; index < dedupedByRange.length; index++) {
    const item = dedupedByRange[index];
    
    if (onProgress) {
      const progress = Math.round(((index + 1) / totalItems) * 100);
      onProgress(progress, index + 1, totalItems);
    }
    const start = Math.max(1, item.startPage || item.pageNumber || 1);
    let end = Math.min(totalPages, Math.max(start, item.endPage || totalPages));

    if (duplicateBoundaryPages && index < dedupedByRange.length - 1) {
      const next = dedupedByRange[index + 1];
      const nextStart = Math.max(1, next.startPage || next.pageNumber || 1);
      if (nextStart === end + 1) {
        end = Math.min(totalPages, end + 1);
      }
    }

    const outputPdf = await PDFDocument.create();
    const pageIndexes: number[] = [];
    for (let page = start; page <= end; page++) {
      pageIndexes.push(page - 1);
    }

    if (!pageIndexes.length) continue;
    const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);
    copiedPages.forEach((page) => outputPdf.addPage(page));

    const partBytes = await outputPdf.save();
    const indexLabel = String(index + 1).padStart(3, '0');
    const title = sanitizeFilenamePart(item.title || `chapter-${index + 1}`);
    const filename = `${indexLabel}-${title}-p${start}-${end}.pdf`;

    zip.file(filename, partBytes);
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
  });
}

export function downloadBinaryFile(bytes: Uint8Array, filename: string, mimeType: string) {
  const copiedBytes = Uint8Array.from(bytes);
  const arrayBuffer = copiedBytes.buffer as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
