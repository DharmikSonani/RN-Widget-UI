import React, { createContext, useReducer, useContext } from 'react';
import { appendWidget, reorderWidgets, resizeWidgetInList, recalculateLayout, COLUMN_WIDTH, ROW_HEIGHT } from '../utils/layoutUtils';

const initialState = {
    widgets: [],
    isEditMode: false,
    focusedWidget: null,
};

const widgetReducer = (state, action) => {
    switch (action.type) {
        case 'ADD_WIDGET':
            // Use appendWidget to place it in the next available slot
            return {
                ...state,
                widgets: appendWidget(state.widgets, action.payload)
            };

        case 'REMOVE_WIDGET':
            const remaining = state.widgets.filter((w) => w.id !== action.payload);
            // Recalculate layout for remaining
            return {
                ...state,
                // If the removed widget was focused, clear focus
                focusedWidget: state.focusedWidget?.id === action.payload ? null : state.focusedWidget,
                widgets: recalculateLayout(remaining)
            };

        case 'UPDATE_WIDGET':
            return {
                ...state,
                widgets: state.widgets.map((w) =>
                    w.id === action.payload.id ? { ...w, ...action.payload } : w
                ),
            };

        case 'REORDER_WIDGET':
            // Payload: { id: string, x: number, y: number } - Drag End Coords
            return {
                ...state,
                widgets: reorderWidgets(state.widgets, action.payload.id, action.payload.x, action.payload.y)
            };

        case 'RESIZE_WIDGET':
            return {
                ...state,
                widgets: resizeWidgetInList(state.widgets, action.payload.id, action.payload.width, action.payload.height)
            };

        case 'BRING_TO_FRONT':
            // In a grid layout, Z-Index is less relevant for layout but good for drag
            // We keep the list order for layout, but maybe zIndex for visual
            return {
                ...state,
                widgets: state.widgets.map(w =>
                    w.id === action.payload ? { ...w, zIndex: 999 } : { ...w, zIndex: 1 }
                )
            };

        case 'TOGGLE_EDIT_MODE':
            return {
                ...state,
                isEditMode: action.payload,
                // Clear focus when entering edit mode? Maybe yes.
                focusedWidget: null
            };

        case 'SET_FOCUSED_WIDGET':
            return { ...state, focusedWidget: action.payload };

        default:
            return state;
    }
};

const WidgetContext = createContext(undefined);

export const WidgetProvider = ({ children }) => {
    const [state, dispatch] = useReducer(widgetReducer, initialState);

    const addWidget = (data) => {
        const id = Date.now().toString();
        // Randomize position slightly to avoid perfect overlap if multiple added
        const offset = Math.random() * 20;

        const newWidget = {
            id,
            data,
            x: 20 + offset,
            y: 300 + offset, // Default sort of center
            width: COLUMN_WIDTH,
            height: ROW_HEIGHT,
            zIndex: 100
        };

        dispatch({ type: 'ADD_WIDGET', payload: newWidget });
    };

    return (
        <WidgetContext.Provider value={{ state, dispatch, addWidget }}>
            {children}
        </WidgetContext.Provider>
    );
};

export const useWidgetContext = () => {
    const context = useContext(WidgetContext);
    if (!context) {
        throw new Error('useWidgetContext must be used within a WidgetProvider');
    }
    return context;
};
