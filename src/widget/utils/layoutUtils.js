import { COLUMN_WIDTH, COLUMNS, MARGIN, ROW_HEIGHT } from './measure';

export const getGridSizeFromDimensions = (width, height) => {
    // Determine closest span based on width/height
    // Thresholds can be simple
    const colSpan = width > COLUMN_WIDTH + 20 ? 2 : 1;
    const rowSpan = height > ROW_HEIGHT + 20 ? 2 : 1;
    return { colSpan, rowSpan };
}

export const getDimensionsFromGridSize = (colSpan, rowSpan) => {
    return {
        width: colSpan * COLUMN_WIDTH + (colSpan - 1) * MARGIN,
        height: rowSpan * ROW_HEIGHT + (rowSpan - 1) * MARGIN
    };
}

/**
 * Calculates the layout for a list of widgets, respecting their Grid Spans.
 * It flows them left-to-right, top-to-bottom, filling gaps where possible.
 */
export const recalculateLayout = (widgets) => {
    // 1. Grid State: Track occupied slots
    // We can use a simple 2D array or just a list of occupied cells
    // Since rows are infinite, a Map<rowIndex, boolean[]> might be easier
    // key: rowIndex, value: [col0_occupied, col1_occupied]
    const grid = {};

    const isOccupied = (row, col, colSpan, rowSpan) => {
        for (let r = row; r < row + rowSpan; r++) {
            for (let c = col; c < col + colSpan; c++) {
                if (grid[r] && grid[r][c]) return true;
                if (c >= COLUMNS) return true; // Out of bounds
            }
        }
        return false;
    };

    const markOccupied = (row, col, colSpan, rowSpan) => {
        for (let r = row; r < row + rowSpan; r++) {
            if (!grid[r]) grid[r] = [false, false]; // Init row
            for (let c = col; c < col + colSpan; c++) {
                grid[r][c] = true;
            }
        }
    };

    // 2. Place each widget
    return widgets.map(widget => {
        const { width, height } = widget;
        const { colSpan, rowSpan } = getGridSizeFromDimensions(width, height);

        // Find first available position
        let row = 0;
        let col = 0;
        let placed = false;

        while (!placed) {
            // Check columns in this row
            for (let c = 0; c < COLUMNS; c++) {
                // Optimization: Can we fit here?
                if (c + colSpan <= COLUMNS && !isOccupied(row, c, colSpan, rowSpan)) {
                    // Found spot
                    col = c;
                    placed = true;
                    break;
                }
            }
            if (!placed) row++;
        }

        // Mark spot
        markOccupied(row, col, colSpan, rowSpan);

        // Calculate absolute position
        const dim = getDimensionsFromGridSize(colSpan, rowSpan);

        return {
            ...widget,
            x: MARGIN + col * (COLUMN_WIDTH + MARGIN),
            y: row * (ROW_HEIGHT + MARGIN),
            width: dim.width,
            height: dim.height
        };
    });
};

export const reorderWidgets = (
    widgets,
    widgetId,
    newX,
    newY
) => {
    const widgetIndex = widgets.findIndex(w => w.id === widgetId);
    if (widgetIndex === -1) return widgets;

    const widget = widgets[widgetIndex];

    // Determine Target Index mostly by Y position, then X
    // Simple heuristic: Layout is mostly linear flow
    // Sort all widgets by Position for current index determination is tricky because of variable sizes
    // Instead, let's just infer index based on center-point distance to other widgets?
    // OR simpler: Calculate 'virtual index' = row * 2 + col

    // Let's use the simple swap approach: 
    // Find the widget currently closest to the drop point
    let closestIndex = -1;
    let minDist = Infinity;

    widgets.forEach((w, idx) => {
        if (w.id === widgetId) return; // Skip self
        const dist = Math.sqrt(Math.pow(w.x - newX, 2) + Math.pow(w.y - newY, 2));
        if (dist < minDist) {
            minDist = dist;
            closestIndex = idx;
        }
    });

    // If newY is way below the last widget, append
    // This part is heuristic-heavy. Let's rely on list order.
    // Ideally we project grid position -> index. 
    // For variable size grid, index isn't 1:1 with position, but it determines ORDER of placement.

    const newWidgets = [...widgets];
    newWidgets.splice(widgetIndex, 1);

    if (closestIndex !== -1) {
        // Determine if we insert before or after closest
        // If we are "above" or "left" of closest, insert before.
        const target = widgets[closestIndex];
        if (newY < target.y || (newY < target.y + target.height && newX < target.x)) {
            // Insert before
            // Adjust index because we removed one
            let insertAt = closestIndex;
            if (widgetIndex < closestIndex) insertAt--; // Shifted
            newWidgets.splice(Math.max(0, insertAt), 0, widget);
        } else {
            // Insert after
            let insertAt = closestIndex + 1;
            if (widgetIndex < closestIndex) insertAt--;
            newWidgets.splice(insertAt, 0, widget);
        }
    } else {
        // Append
        newWidgets.push(widget);
    }

    return recalculateLayout(newWidgets);
};

export const appendWidget = (widgets, widget) => recalculateLayout([...widgets, widget]);

export const resizeWidgetInList = (widgets, widgetId, newWidth, newHeight) => recalculateLayout(widgets.map(w => {
    if (w.id === widgetId) {
        // Apply new raw dimensions, recalculateLayout will snap them
        return { ...w, width: newWidth, height: newHeight };
    }
    return w;
}));

export const calculateTotalContentHeight = (widgets) => {
    let maxY = 0;
    widgets.forEach(w => {
        const bottom = w.y + w.height;
        if (bottom > maxY) maxY = bottom;
    });
    return maxY + MARGIN + 100; // Extra padding
};
