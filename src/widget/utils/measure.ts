import { Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const MARGIN = 15;
export const COLUMNS = 2;
export const COLUMN_WIDTH = (SCREEN_WIDTH - MARGIN * (COLUMNS + 1)) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;

// Pre-calculated grid step values for performance optimization
// These are used in hot paths (layout, reordering) to avoid repeated arithmetic
export const GRID_STEP_X = COLUMN_WIDTH + MARGIN;
export const GRID_STEP_Y = ROW_HEIGHT + MARGIN;
