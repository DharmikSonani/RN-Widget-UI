import { Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const MARGIN = 15;
export const COLUMNS = 2;
export const COLUMN_WIDTH = (SCREEN_WIDTH - (MARGIN * (COLUMNS + 1))) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;