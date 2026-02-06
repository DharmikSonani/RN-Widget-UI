import {
  COLUMN_WIDTH,
  COLUMNS,
  MARGIN,
  ROW_HEIGHT,
  GRID_STEP_X,
  GRID_STEP_Y,
} from './measure';
import { Widget } from './types';

export const getGridSizeFromDimensions = (width: number, height: number) => {
  const colSpan = width > COLUMN_WIDTH + 20 ? 2 : 1;
  const rowSpan = height > ROW_HEIGHT + 20 ? 2 : 1;
  return { colSpan, rowSpan };
};

export const getDimensionsFromGridSize = (colSpan: number, rowSpan: number) => {
  return {
    width: colSpan * COLUMN_WIDTH + (colSpan - 1) * MARGIN,
    height: rowSpan * ROW_HEIGHT + (rowSpan - 1) * MARGIN,
  };
};

/**
 * Optimized layout calculation using Skyline / Horizon algorithm.
 * Time Complexity: O(N * C) where C is number of columns (constant).
 *
 * Performance optimizations:
 * - Uses Uint16Array for horizon (faster than regular array)
 * - Cached grid step calculations
 * - Reduced object creation
 * - Early exit conditions
 */
export const recalculateLayout = (widgets: Widget[]): Widget[] => {
  // Early exit for empty widgets
  if (widgets.length === 0) return [];

  // Horizon: Tracks the lowest available Y index (row index) for each column.
  // Using typed array for better performance
  const horizon = new Uint16Array(COLUMNS);

  const layoutWidgets = widgets.map(widget => {
    const { width, height } = widget;
    const { colSpan, rowSpan } = getGridSizeFromDimensions(width, height);

    let bestRow = Infinity;
    let bestCol = 0;

    // Find the "skyline" segment that minimizes Y (and then X aka col)
    // We need 'colSpan' contiguous columns.
    for (let c = 0; c <= COLUMNS - colSpan; c++) {
      // Find the maximum height in this span [c, c + colSpan)
      let maxH = 0;
      for (let span = 0; span < colSpan; span++) {
        maxH = Math.max(maxH, horizon[c + span]);
      }

      // If this position (maxH) is better (lower) than current best, pick it.
      if (maxH < bestRow) {
        bestRow = maxH;
        bestCol = c;
      }
    }

    // Commit placement - update horizon for the covered columns
    for (let span = 0; span < colSpan; span++) {
      horizon[bestCol + span] = bestRow + rowSpan;
    }

    // Use cached grid step values for position calculation
    const dim = getDimensionsFromGridSize(colSpan, rowSpan);
    const newX = MARGIN + bestCol * GRID_STEP_X;
    const newY = bestRow * GRID_STEP_Y;
    const newW = dim.width;
    const newH = dim.height;

    // OPTIMIZATION: Object Identity Preservation
    // If the calculated layout matches the existing one, return the original object.
    // This prevents React.memo from invalidating the component.
    // @ts-ignore - gridRow/gridCol might not be on Widget type yet but used internally
    if (
      widget.x === newX &&
      widget.y === newY &&
      widget.width === newW &&
      widget.height === newH &&
      // @ts-ignore
      widget.gridRow === bestRow &&
      // @ts-ignore
      widget.gridCol === bestCol
    ) {
      return widget;
    }

    return {
      ...widget,
      x: newX,
      y: newY,
      width: newW,
      height: newH,
      // Store grid position for easier sorting/debugging
      gridRow: bestRow,
      gridCol: bestCol,
    } as Widget;
  });

  // Sort by Y position for virtualization efficiency
  // Use stable sort to maintain relative order
  layoutWidgets.sort((a, b) => {
    if (a.y === b.y) return a.x - b.x;
    return a.y - b.y;
  });

  return layoutWidgets;
};

/**
 * Optimized reordering with direction-aware insertion.
 * Uses Binary Search to find insertion index based on sorts produced by layout.
 */
export const reorderWidgets = (
  widgets: Widget[],
  widgetId: string | number,
  newX: number,
  newY: number,
): Widget[] => {
  const widgetIndex = widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return widgets;

  const widget = widgets[widgetIndex];

  // Calculate target position using cached grid steps
  const activeCol = Math.round((newX - MARGIN) / GRID_STEP_X);
  const activeRow = Math.round(newY / GRID_STEP_Y);
  const targetSortKey =
    activeRow * COLUMNS + Math.max(0, Math.min(activeCol, COLUMNS - 1));

  // Calculate original position for direction detection
  // @ts-ignore
  const originalRow = widget.gridRow ?? Math.round(widget.y / GRID_STEP_Y);
  // @ts-ignore
  const originalCol =
    widget?.gridCol ?? Math.round((widget.x - MARGIN) / GRID_STEP_X);
  const originalSortKey = originalRow * COLUMNS + originalCol;

  // Early exit: If dragging to same position, preserve previous state completely
  if (targetSortKey === originalSortKey) {
    return widgets; // Return original array reference
  }

  // 1. Remove widget from the list
  const remainingWidgets = [...widgets];
  remainingWidgets.splice(widgetIndex, 1);

  // 2. Find insertion index using Binary Search with direction awareness
  let low = 0;
  let high = remainingWidgets.length;

  // Determine drag direction
  const isDraggingDown = targetSortKey > originalSortKey;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const w = remainingWidgets[mid];

    // Calculate SortKey for w using cached grid steps
    // @ts-ignore
    const wRow = w.gridRow ?? Math.round(w.y / GRID_STEP_Y);
    // @ts-ignore
    const wCol = w.gridCol ?? Math.round((w.x - MARGIN) / GRID_STEP_X);
    const wSortKey = wRow * COLUMNS + wCol;

    if (isDraggingDown) {
      // Upper bound: find first element > target
      if (wSortKey <= targetSortKey) {
        low = mid + 1;
      } else {
        high = mid;
      }
    } else {
      // Lower bound: find first element >= target
      if (wSortKey < targetSortKey) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
  }

  // Insert at calculated position
  remainingWidgets.splice(low, 0, widget);

  return recalculateLayout(remainingWidgets);
};

export const appendWidget = (widgets: Widget[], widget: Widget): Widget[] =>
  recalculateLayout([...widgets, widget]);

export const resizeWidgetInList = (
  widgets: Widget[],
  widgetId: string | number,
  newWidth: number,
  newHeight: number,
): Widget[] => {
  // Map over widgets to update size, then recalc layout
  return recalculateLayout(
    widgets.map(w => {
      if (w.id === widgetId) {
        return { ...w, width: newWidth, height: newHeight };
      }
      return w;
    }),
  );
};

export const calculateTotalContentHeight = (widgets: Widget[]): number => {
  // Early exit for empty widgets
  if (widgets.length === 0) return 0;

  let maxY = 0;
  // Scan last few widgets, as the array is sorted by Y.
  const scanCount = Math.min(widgets.length, COLUMNS + 2);
  for (let i = 0; i < scanCount; i++) {
    const w = widgets[widgets.length - 1 - i];
    if (w.y + w.height > maxY) maxY = w.y + w.height;
  }

  return maxY + MARGIN + 100;
};
