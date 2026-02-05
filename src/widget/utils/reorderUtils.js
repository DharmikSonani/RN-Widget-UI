/**
 * Returns the layout position (x, y) for an item at a given index
 */
export const getPosition = (
    index,
    itemWidth,
    itemHeight, // Assuming fixed height for grid slots or handled via row?
    // Use a fixed slot height for grid alignment. 
    // If widgets have variable heights, this reordering becomes a masonry problem which is much harder.
    // For iOS style, items are usually uniform or multiples. 
    // Let's assume uniform height slots for the "Sortable Grid" base logic first.
    // If variable, we need an array of heights.
    // For this widget demo, let's assume auto-flow with row wrapping.
    columns,
    gap,
    // We might need to pass partial sums if heights vary, but let's stick to standard grid math for now
    // assuming uniform grid cells or standard Masonry?
    // The current app has cards of varying heights?
    // Let's look at `DraggableWidget`. It has dynamic width/height.
    // iOS widgets are 2x2, 2x1, 4x2.
    // For a reliable "iOS home screen" feel, we essentially treating the screen as a matrix of slots.
    // Let's implement the standard specialized logic:
    // Convert index -> row/col -> x/y
) => {
    'worklet';
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
        x: gap + col * (itemWidth + gap),
        y: gap + row * (itemHeight + gap) // This assumes fixed row height
    };
};

/**
 * Returns the index in the order array corresponding to a visual position (x, y)
 */
export const getOrderIndex = (
    x,
    y,
    itemWidth,
    itemHeight,
    columns,
    gap,
    totalItems
) => {
    'worklet';
    // column = round((x - gap) / (width + gap))
    const col = Math.round((x - gap) / (itemWidth + gap));
    const row = Math.round((y - gap) / (itemHeight + gap));

    const index = row * columns + col;

    // Clamp
    return Math.max(0, Math.min(index, totalItems - 1));
};

/**
 * Checks if two rectangles overlap significantly
 */
export const isOverlapping = (
    r1,
    r2
) => {
    'worklet';
    return (
        r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y
    );
};
