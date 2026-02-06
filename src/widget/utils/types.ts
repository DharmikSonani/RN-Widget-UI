export interface Widget {
  id: string | number;
  data: string; // Image URI
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface FocusedWidget {
  id: string | number;
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Include other widget props if needed for rendering the ghost/overlay
  data?: string;
  zIndex?: number;
}

export interface WidgetState {
  widgets: Widget[];
  isEditMode: boolean;
  focusedWidget: FocusedWidget | null;
}

export type WidgetAction =
  | { type: 'ADD_WIDGET'; payload: Widget }
  | { type: 'REMOVE_WIDGET'; payload: string | number }
  | {
      type: 'UPDATE_WIDGET';
      payload: Partial<Widget> & { id: string | number };
    }
  | {
      type: 'REORDER_WIDGET';
      payload: { id: string | number; x: number; y: number };
    }
  | {
      type: 'RESIZE_WIDGET';
      payload: { id: string | number; width: number; height: number };
    }
  | { type: 'BRING_TO_FRONT'; payload: string | number }
  | { type: 'TOGGLE_EDIT_MODE'; payload: boolean }
  | { type: 'SET_FOCUSED_WIDGET'; payload: FocusedWidget | null }
  | { type: 'SET_WIDGET'; payload: Widget[] };

export interface WidgetContextType {
  state: WidgetState;
  dispatch: React.Dispatch<WidgetAction>;
  addWidget: (data: string) => void;
}
