'use client';

import React from 'react';
import { ToCItem } from '@/lib/pdfUtils';

interface ToCTreeViewProps {
  items: ToCItem[];
  onToggleExpand: (itemId: string) => void;
  onToggleCheck: (itemId: string, checked: boolean) => void;
  level?: number;
}

export default function ToCTreeView({
  items,
  onToggleExpand,
  onToggleCheck,
  level = 1,
}: ToCTreeViewProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <ToCTreeItem
          key={item.id}
          item={item}
          onToggleExpand={onToggleExpand}
          onToggleCheck={onToggleCheck}
          level={level}
        />
      ))}
    </div>
  );
}

interface ToCTreeItemProps {
  item: ToCItem;
  onToggleExpand: (itemId: string) => void;
  onToggleCheck: (itemId: string, checked: boolean) => void;
  level: number;
}

function ToCTreeItem({
  item,
  onToggleExpand,
  onToggleCheck,
  level,
}: ToCTreeItemProps) {
  const hasChildren = item.children && item.children.length > 0;
  const indentClass = `ml-${level * 4}`;

  // Color coding by level
  const levelColors = {
    1: 'bg-blue-50 border-blue-200',
    2: 'bg-green-50 border-green-200',
    3: 'bg-purple-50 border-purple-200',
  };

  const textSizes = {
    1: 'text-base font-semibold',
    2: 'text-sm font-medium',
    3: 'text-sm',
  };

  return (
    <div className="w-full">
      {/* Main item row */}
      <div
        className={`flex items-start gap-2 p-3 rounded-lg border transition-all hover:shadow-md ${
          levelColors[level as keyof typeof levelColors] || 'bg-gray-50 border-gray-200'
        } ${item.checked ? 'ring-2 ring-blue-400' : ''}`}
        style={{ marginLeft: `${(level - 1) * 20}px` }}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <button
            onClick={() => onToggleExpand(item.id)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-white/50 transition-colors"
            aria-label={item.expanded ? 'Collapse' : 'Expand'}
          >
            {item.expanded ? (
              // Chevron Down
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            ) : (
              // Chevron Right
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        ) : (
          <div className="w-6" /> // Spacer for alignment
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={item.checked || false}
          onChange={(e) => onToggleCheck(item.id, e.target.checked)}
          className="flex-shrink-0 w-5 h-5 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`${textSizes[level as keyof typeof textSizes] || 'text-sm'} text-gray-900`}>
              {item.title}
            </span>
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
              {item.startPage === item.endPage
                ? `p. ${item.startPage}`
                : `pp. ${item.startPage}-${item.endPage}`}
            </span>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>
              {item.endPage && item.startPage
                ? `${item.endPage - item.startPage + 1} pages`
                : ''}
            </span>
            {hasChildren && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                {item.children.length} sub-item{item.children.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Level badge */}
        <div className="flex-shrink-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              level === 1
                ? 'bg-blue-100 text-blue-800'
                : level === 2
                ? 'bg-green-100 text-green-800'
                : 'bg-purple-100 text-purple-800'
            }`}
          >
            L{level}
          </span>
        </div>
      </div>

      {/* Children (recursive) */}
      {hasChildren && item.expanded && (
        <div className="mt-1">
          <ToCTreeView
            items={item.children}
            onToggleExpand={onToggleExpand}
            onToggleCheck={onToggleCheck}
            level={level + 1}
          />
        </div>
      )}
    </div>
  );
}
