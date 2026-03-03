'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import ToCTreeView from '@/components/ToCTreeView';
import {
  createSplitZip,
  downloadBinaryFile,
  extractPDFMetadata,
  PDFMetadata,
  ToCItem,
  toggleExpanded,
  updateCheckedState,
  getSelectedItems,
} from '@/lib/pdfUtils';

export default function Home() {
  const [pdfMetadata, setPdfMetadata] = useState<PDFMetadata | null>(null);
  const [toc, setToc] = useState<ToCItem[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setSourceFile(file);
    try {
      const metadata = await extractPDFMetadata(file);
      setPdfMetadata(metadata);
      setToc(metadata.toc);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process PDF';
      setError(errorMessage);
      console.error('Error processing PDF:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleExpand = (itemId: string) => {
    setToc((prevToc) => toggleExpanded(prevToc, itemId));
  };

  const handleToggleCheck = (itemId: string, checked: boolean) => {
    setToc((prevToc) => updateCheckedState(prevToc, itemId, checked, true));
  };

  const handleSelectAll = () => {
    const selectAll = (items: ToCItem[]): ToCItem[] => {
      return items.map((item) => ({
        ...item,
        checked: true,
        children: item.children ? selectAll(item.children) : [],
      }));
    };
    setToc(selectAll(toc));
  };

  const handleDeselectAll = () => {
    const deselectAll = (items: ToCItem[]): ToCItem[] => {
      return items.map((item) => ({
        ...item,
        checked: false,
        children: item.children ? deselectAll(item.children) : [],
      }));
    };
    setToc(deselectAll(toc));
  };

  const setCheckedByIds = (items: ToCItem[], selectedIds: Set<string>): ToCItem[] => {
    return items.map((item) => ({
      ...item,
      checked: selectedIds.has(item.id),
      children: item.children ? setCheckedByIds(item.children, selectedIds) : [],
    }));
  };

  const collectPresetIds = (items: ToCItem[], level: number): Set<string> => {
    const ids = new Set<string>();

    const collectForL1 = (node: ToCItem) => {
      ids.add(node.id);
    };

    const collectForL2 = (node: ToCItem) => {
      const level2Children = (node.children || []).filter((child) => child.level === 2);
      if (level2Children.length === 0) {
        ids.add(node.id);
        return;
      }
      level2Children.forEach((child) => ids.add(child.id));
    };

    const collectForL3 = (node: ToCItem) => {
      const level2Children = (node.children || []).filter((child) => child.level === 2);
      if (level2Children.length === 0) {
        ids.add(node.id);
        return;
      }

      level2Children.forEach((level2Child) => {
        const level3Children = (level2Child.children || []).filter((child) => child.level === 3);
        if (level3Children.length === 0) {
          ids.add(level2Child.id);
          return;
        }
        level3Children.forEach((child) => ids.add(child.id));
      });
    };

    items.forEach((node) => {
      if (level === 1) {
        collectForL1(node);
      } else if (level === 2) {
        collectForL2(node);
      } else {
        collectForL3(node);
      }
    });

    return ids;
  };

  const handleSelectByLevel = (level: number) => {
    const selectedIds = collectPresetIds(toc, level);
    setToc((prevToc) => setCheckedByIds(prevToc, selectedIds));
  };

  const getUniqueSelectedPageCount = (items: ToCItem[]) => {
    const ranges = items
      .map((item) => ({
        start: item.startPage || 0,
        end: item.endPage || 0,
      }))
      .filter((range) => range.start > 0 && range.end >= range.start)
      .sort((a, b) => a.start - b.start);

    if (ranges.length === 0) return 0;

    let mergedStart = ranges[0].start;
    let mergedEnd = ranges[0].end;
    let total = 0;

    for (let index = 1; index < ranges.length; index++) {
      const current = ranges[index];
      if (current.start <= mergedEnd + 1) {
        mergedEnd = Math.max(mergedEnd, current.end);
      } else {
        total += mergedEnd - mergedStart + 1;
        mergedStart = current.start;
        mergedEnd = current.end;
      }
    }

    total += mergedEnd - mergedStart + 1;
    return total;
  };

  const getBoundaryOverlapPageCount = (items: ToCItem[], totalPages: number) => {
    const ranges = items
      .map((item) => ({
        start: item.startPage || 0,
        end: item.endPage || 0,
      }))
      .filter((range) => range.start > 0 && range.end >= range.start)
      .sort((a, b) => a.start - b.start);

    if (ranges.length === 0) return 0;

    let total = 0;
    for (let index = 0; index < ranges.length; index++) {
      const current = ranges[index];
      const next = ranges[index + 1];

      const hasAdjacentBoundary = !!next && next.start === current.end + 1;
      const safeEnd = hasAdjacentBoundary
        ? Math.min(totalPages, current.end + 1)
        : current.end;

      total += safeEnd - current.start + 1;
    }

    return total;
  };

  const handleGenerateAndDownload = async () => {
    if (!sourceFile || selectedItems.length === 0) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing export...');
    setError(null);

    try {
      const bytes = await createSplitZip({
        sourceFile,
        selectedItems,
        duplicateBoundaryPages: true,
        onProgress: (progress, current, total) => {
          setExportProgress(progress);
          setExportStatus(`Processing chapter ${current} of ${total}...`);
        },
      });
      
      setExportStatus('Creating ZIP file...');
      setExportProgress(100);

      const fileBaseName = sourceFile.name.replace(/\.pdf$/i, '');
      downloadBinaryFile(bytes, `${fileBaseName}-split-parts.zip`, 'application/zip');
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : 'Failed to generate PDF.';
      setError(message);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }
  };

  // Get selected items for summary
  const selectedItems = pdfMetadata ? getSelectedItems(toc) : [];
  const totalSelectedPages = getUniqueSelectedPageCount(selectedItems);
  const totalPagesWithOverlap = pdfMetadata
    ? getBoundaryOverlapPageCount(selectedItems, pdfMetadata.pages)
    : 0;
  const isFullCoverage = pdfMetadata
    ? totalSelectedPages >= pdfMetadata.pages
    : false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            SplitByChapter
          </h1>
          <p className="text-lg text-gray-600">
            Upload a PDF and extract specific chapters or sections
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            Step 1: Upload Your PDF
          </h2>
          
          <FileUpload 
            onFileSelected={handleFileSelected} 
            isLoading={isLoading}
            error={error}
          />
        </div>

        {/* Metadata Display */}
        {pdfMetadata && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Step 2: PDF Information
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <p className="text-sm font-medium text-gray-600">Title</p>
                <p className="text-lg text-gray-900">{pdfMetadata.title}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pages</p>
                <p className="text-lg text-gray-900">{pdfMetadata.pages}</p>
              </div>
              {pdfMetadata.author && (
                <div>
                  <p className="text-sm font-medium text-gray-600">Author</p>
                  <p className="text-lg text-gray-900">{pdfMetadata.author}</p>
                </div>
              )}
            </div>

            {/* Table of Contents */}
            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">
                Table of Contents ({toc.length} chapters)
              </h3>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                {/* Level Selection Buttons - Primary */}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    Split Preset (Full PDF Coverage):
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectByLevel(1)}
                      className="flex-1 px-5 py-3 text-base font-bold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      <span className="block text-sm font-normal opacity-90">Major Chapters</span>
                      <span className="block text-xl">L1</span>
                    </button>
                    <button
                      onClick={() => handleSelectByLevel(2)}
                      className="flex-1 px-5 py-3 text-base font-bold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      <span className="block text-sm font-normal opacity-90">L2 + no-child L1</span>
                      <span className="block text-xl">L2</span>
                    </button>
                    <button
                      onClick={() => handleSelectByLevel(3)}
                      className="flex-1 px-5 py-3 text-base font-bold bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                    >
                      <span className="block text-sm font-normal opacity-90">L3 + L2/L1 fallback</span>
                      <span className="block text-xl">L3</span>
                    </button>
                  </div>
                </div>
                
                {/* Select All/None - Secondary */}
                <div className="flex sm:flex-col gap-2 border-t sm:border-t-0 sm:border-l border-gray-300 pt-3 sm:pt-0 sm:pl-4">
                  <button
                    onClick={handleSelectAll}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    ✓ All
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    ✗ None
                  </button>
                </div>
              </div>
              
              {toc.length > 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                  <ToCTreeView
                    items={toc}
                    onToggleExpand={handleToggleExpand}
                    onToggleCheck={handleToggleCheck}
                  />
                </div>
              ) : (
                <p className="text-gray-600 italic">
                  No table of contents found in this PDF
                </p>
              )}
            </div>

            {/* Selection Summary */}
            {selectedItems.length > 0 && (
              <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-lg font-semibold text-green-900 mb-3">
                  ✓ Selection Summary
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-green-700">Selected Chapters</p>
                    <p className="text-2xl font-bold text-green-900">{selectedItems.length}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700">Covered Pages</p>
                    <p className="text-2xl font-bold text-green-900">{totalSelectedPages}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700">Original PDF</p>
                    <p className="text-2xl font-bold text-green-900">{pdfMetadata.pages} pages</p>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white rounded p-3 border border-green-200">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Coverage Check</p>
                    <p className="text-sm font-medium text-gray-800 mt-1">
                      {isFullCoverage ? '✓ Full PDF covered (no missing pages)' : '⚠ Coverage is incomplete'}
                    </p>
                  </div>
                  <div className="bg-white rounded p-3 border border-green-200">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Safe Overlap Mode</p>
                    <p className="text-sm font-medium text-gray-800 mt-1">
                      {totalPagesWithOverlap} pages (boundary pages duplicated)
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-800">Selected items:</p>
                  <div className="bg-white rounded p-3 max-h-32 overflow-y-auto">
                    <ul className="text-sm text-gray-700 space-y-1">
                      {selectedItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-gray-500 text-xs">
                            (pp. {item.startPage}-{item.endPage})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {isExporting && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      <svg className="w-5 h-5 text-blue-600 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-blue-900 mb-1">{exportStatus}</p>
                        <p className="text-xs text-blue-700 mb-2">
                          Large PDFs may take several minutes to process. This is normal.
                        </p>
                        <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                            style={{ width: `${exportProgress}%` }}
                          >
                            <span className="text-xs font-bold text-white">{exportProgress}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <button
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  onClick={handleGenerateAndDownload}
                  disabled={isExporting || selectedItems.length === 0 || !sourceFile}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {isExporting ? 'Processing...' : 'Generate & Download ZIP'}
                </button>
              </div>
            )}

            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                ✓ PDF parsed successfully! Select chapters above to extract them.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
