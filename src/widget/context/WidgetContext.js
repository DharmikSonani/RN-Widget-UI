import React, { createContext, useReducer, useContext, useCallback, useMemo, useEffect } from 'react';
import { appendWidget, reorderWidgets, resizeWidgetInList, recalculateLayout } from '../utils/layoutUtils';
import { COLUMN_WIDTH, ROW_HEIGHT } from '../utils/measure';

const DATA = [
    `https://wallpapers.com/images/featured/4k-tech-ulcajgzzc25jlrgi.jpg`,
    `https://images.unsplash.com/photo-1724391114112-c83ad59f1d5f?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Ym13JTIwd2FsbHBhcGVyfGVufDB8fDB8fHww`,
    `https://www.hdcarwallpapers.com/walls/bugatti_chiron_super_sport_golden_era_4k-HD.jpg`,
    `https://cloudinary-marketing-res.cloudinary.com/image/upload/w_1300/q_auto/f_auto/hiking_dog_mountain`,
    `https://cdn.pixabay.com/photo/2018/01/14/23/12/nature-3082832_1280.jpg`,
    `https://images.pexels.com/photos/19727174/pexels-photo-19727174.jpeg?cs=srgb&dl=pexels-ryank-19727174.jpg&fm=jpg`,
    `https://cdn.wallpapersafari.com/93/66/hvpRyg.jpg`,
    `https://images5.alphacoders.com/139/thumb-1920-1395234.jpg`,
    `https://4kwallpapers.com/images/wallpapers/assassins-creed-3840x2160-16786.jpeg`,
    `https://images.hdqwalls.com/wallpapers/assassins-creed-game-4k-h8.jpg`,
]

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
            // Only update the widget that needs z-index change
            return {
                ...state,
                widgets: state.widgets.map(w =>
                    w.id === action.payload ? { ...w, zIndex: 999 } : w
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

        case 'SET_WIDGET':
            return {
                ...state,
                widgets: recalculateLayout(action.payload)
            };

        default:
            return state;
    }
};

const WidgetContext = createContext(undefined);

export const WidgetProvider = ({ children }) => {
    const [state, dispatch] = useReducer(widgetReducer, initialState);

    const addWidget = useCallback((data) => {
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
    }, []);

    useEffect(() => {
        const widgets = Array.from({ length: 100 }).map((_, i) => {
            const offset = Math.random() * 20;
            return {
                id: i,
                data: DATA[i % DATA.length],
                x: 20 + offset,
                y: 300 + offset,
                width: COLUMN_WIDTH,
                height: ROW_HEIGHT,
                zIndex: 100
            };
        })
        dispatch({ type: 'SET_WIDGET', payload: widgets });
    }, [])

    const contextValue = useMemo(() => ({ state, dispatch, addWidget }), [state, addWidget]);

    return (
        <WidgetContext.Provider value={contextValue}>
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
