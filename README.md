# Widget System (React Native)

This section explains the architecture, file responsibilities, and logic flow of the drag-and-drop widget system located in `src/widget`.

## Required Dependencies

Ensure the following packages are installed in your project:

1.  [`@react-native-community/blur`](https://www.npmjs.com/package/@react-native-community/blur) - For glassmorphism effects.
2.  [`react-native-gesture-handler`](https://www.npmjs.com/package/react-native-gesture-handler) - For drag, drop, and resize interactions.
3.  [`react-native-linear-gradient`](https://www.npmjs.com/package/react-native-linear-gradient) - For UI gradients.
4.  [`react-native-safe-area-context`](https://www.npmjs.com/package/react-native-safe-area-context) - For handling safe areas.
5.  [`react-native-svg`](https://www.npmjs.com/package/react-native-svg) - For icons and graphics.
6.  [`react-native-reanimated`](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started) - For high-performance animations.

---

## Overview

The Widget System is a grid-based, interactive layout engine that allows users to:
*   **Add** widgets dynamically.
*   **Drag and Drop** to reorder items with auto-sorting.
*   **Resize** widgets with a handle.
*   **Focus** on widgets to view them in an overlay.
*   **Remove** widgets via a context menu.

## Folder Structure

```text
src/widget/
├── components/
│   ├── DraggableWidget.js       # Individual widget wrapper with gestures
│   ├── SelectedWidgetModal.js   # Full-screen overlay for focused widget
│   └── WidgetCanvas.js          # Main scrollable area rendering the grid
├── context/
│   └── WidgetContext.js         # Global state management (Redux-like)
├── demo/
│   ├── AddWidgetSheet.js        # Bottom sheet for picking new widgets
│   └── EditControls.js          # UI buttons for "Add" and "Done"
├── utils/
│   ├── layoutUtils.js           # Core auto-layout algorithm
│   ├── measure.js               # Grid constants (columns, margins)
│   └── reorderUtils.js          # Helper math for collision/sorting
└── WidgetView.js                # Public Entry Point
```

---

## Core Components

### 1. Entry Point
#### **File:** [`src/widget/WidgetView.js`](./WidgetView.js)
The main container that initializes the environment. Wraps the entire system in the Context Provider so all children can access state.

```javascript
import { StyleSheet } from 'react-native'
import React, { memo } from 'react'
import { WidgetProvider } from './context/WidgetContext'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import WidgetCanvas from './components/WidgetCanvas'

const WidgetView = () => {
    return (
        <GestureHandlerRootView style={styles.container}>
            <SafeAreaProvider>
                <WidgetProvider>
                    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                        <WidgetCanvas />
                    </SafeAreaView>
                </WidgetProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>

    )
}

export default memo(WidgetView)

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
})
```

### 2. The Canvas
#### **File:** [`src/widget/components/WidgetCanvas.js`](./components/WidgetCanvas.js)
The scrollable "desktop" where widgets live. Subscribes to `WidgetContext` to map `state.widgets` to components.

```javascript
import React, { memo, useCallback, useState } from 'react'
import {
    StyleSheet,
    View,
    ScrollView,
    Text,
    Image,
} from 'react-native';
import { useWidgetContext } from '../context/WidgetContext';
import { calculateTotalContentHeight } from '../utils/layoutUtils';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import EditControls from '../demo/EditControls';
import AddWidgetSheet from '../demo/AddWidgetSheet';
import DraggableWidget from './DraggableWidget';
import SelectedWidgetModal from './SelectedWidgetModal';
import { MARGIN } from '../utils/measure';

const WidgetCanvas = () => {
    const { state, dispatch } = useWidgetContext();
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const contentHeight = calculateTotalContentHeight(state.widgets);

    const longPressEmpty = Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
            runOnJS(dispatch)({ type: 'TOGGLE_EDIT_MODE', payload: true });
        });

    const handleAddPress = useCallback(() => { setIsSheetOpen(true) }, [])

    const handleSheetClose = useCallback(() => { setIsSheetOpen(false) }, [])

    return (
        <View style={styles.container}>
            {/* Widget Canvas */}
            {
                state.widgets.length === 0 ?
                    <GestureDetector gesture={longPressEmpty}>
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyPlacholder} numberOfLines={1}>
                                {`Long press to add widgets`}
                            </Text>
                        </View>
                    </GestureDetector>
                    :
                    <ScrollView contentContainerStyle={[styles.contentContainer]}>
                        {/* Widget Layer */}
                        <View style={[styles.canvasContainer, { height: contentHeight }]}>
                            {/* Render regular widgets */}
                            {state?.widgets?.map(widget => (
                                <DraggableWidget key={widget.id} data={widget}>
                                    {/* Replace with Your Component */}
                                    <Image
                                        source={{ uri: widget?.data }}
                                        style={{ width: '100%', height: '100%', }}
                                        resizeMode='cover'
                                    />
                                </DraggableWidget>
                            ))}
                        </View>
                    </ScrollView>
            }

            <SelectedWidgetModal />

            {/* Edit Mode Controls */}
            <EditControls onAddPress={handleAddPress} />

            {/* Bottom Sheet */}
            {isSheetOpen && <AddWidgetSheet onClose={handleSheetClose} />}
        </View>
    )
}

export default memo(WidgetCanvas)

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 60,
    },
    emptyPlacholder: {
        fontSize: 12,
        color: 'rgba(200, 200, 200, 1)',
    },

    contentContainer: {
        width: '100%',
        paddingTop: MARGIN,
    },
    canvasContainer: {
        width: '100%',
    },
})
```

### 3. The Widget
#### **File:** [`src/widget/components/DraggableWidget.js`](./components/DraggableWidget.js)
The complex heart of the system. Wraps content with Reanimated gestures for Dragging, Focusing, and Resizing.

```javascript
import React, { memo, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    runOnJS,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
} from 'react-native-reanimated';
import { Svg, Path, Line } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

const DraggableWidget = ({ data, isOverlay = false, children }) => {
    const { state, dispatch } = useWidgetContext();
    const { isEditMode, focusedWidget } = state;
    const isFocused = focusedWidget?.id === data.id;

    // If I am the original widget and I am focused, I should be hidden (ghosted)
    // because the Overlay version is showing on top.
    // If I am the overlay version, I am visible.
    const shouldHide = isFocused && !isOverlay;

    // Shared values
    const x = useSharedValue(data.x);
    const y = useSharedValue(data.y);
    const width = useSharedValue(data.width);
    const height = useSharedValue(data.height);
    const zIndex = useSharedValue(data.zIndex);
    const scale = useSharedValue(1);
    const rotation = useSharedValue(0);

    useEffect(() => {
        x.value = withTiming(data.x);
        y.value = withTiming(data.y);
        width.value = withTiming(data.width);
        height.value = withTiming(data.height);
        zIndex.value = data.zIndex;
    }, [data, x, y, width, height, zIndex]);

    useEffect(() => {
        if (isEditMode) {
            rotation.value = withRepeat(
                withSequence(
                    withTiming(-1.5, { duration: 150 }),
                    withTiming(1.5, { duration: 150 })
                ),
                -1,
                true // reverse
            );
            scale.value = withTiming(1);
        } else {
            rotation.value = withTiming(0);

            // Focus Scale Animation (Only for Overlay)
            if (isOverlay) {
                scale.value = withSpring(1.025); // Scale Up
                zIndex.value = 999;
            } else {
                scale.value = withTiming(1);
                zIndex.value = data.zIndex;
            }
        }
    }, [isEditMode, isOverlay, data.zIndex]);

    const bringToFront = () => {
        dispatch({ type: 'BRING_TO_FRONT', payload: data.id });
    };

    // Remove logic
    const handleRemove = () => {
        dispatch({ type: 'REMOVE_WIDGET', payload: data.id });
    };

    const handleLongPress = (e) => {
        if (isEditMode || isOverlay) return;

        // Calculate Absolute Position
        const absoluteX = e.absoluteX - e.x;
        const absoluteY = e.absoluteY - e.y;

        dispatch({
            type: 'SET_FOCUSED_WIDGET',
            payload: {
                id: data.id,
                layout: {
                    x: absoluteX,
                    y: absoluteY,
                    width: data.width,
                    height: data.height
                }
            }
        });
    };

    // --- Gestures ---

    // 1. Long Press to Focus
    const longPressGesture = Gesture.LongPress()
        .minDuration(500)
        .enabled(!isEditMode && !isOverlay)
        .onStart((e) => {
            runOnJS(handleLongPress)(e);
        });

    // Overlay Gesture? None needed, tap outside handled by Modal bg.
    // Maybe intercept touches on widget to prevent pass-through?
    const overlayGesture = Gesture.Tap().enabled(isOverlay);

    // 2. Drag: Only works in Edit Mode
    const dragGesture = Gesture.Pan()
        .enabled(isEditMode)
        .onStart(() => {
            runOnJS(bringToFront)();
        })
        .onUpdate((e) => {
            x.value = data.x + e.translationX;
            y.value = data.y + e.translationY;
        })
        .onEnd(() => {
            runOnJS(dispatch)({
                type: 'REORDER_WIDGET',
                payload: {
                    id: data.id,
                    x: x.value, // Current drag X
                    y: y.value  // Current drag Y
                }
            });
        });

    // 3. Resize: Only works in Edit Mode (using handle)
    const resizeGesture = Gesture.Pan()
        .enabled(isEditMode)
        .onUpdate((e) => {
            // Constrain min size to avoid negative or tiny widgets
            width.value = Math.max(10, data.width + e.translationX);
            height.value = Math.max(10, data.height + e.translationY);
        })
        .onEnd(() => {
            runOnJS(dispatch)({
                type: 'RESIZE_WIDGET',
                payload: {
                    id: data.id,
                    width: width.value,
                    height: height.value
                }
            });
        });

    // Composition
    const composedGesture = isOverlay ? overlayGesture : Gesture.Exclusive(dragGesture, longPressGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: isOverlay ? 0 : x.value }, 
            { translateY: isOverlay ? 0 : y.value },
            { scale: scale.value },
            { rotateZ: `${rotation.value}deg` }
        ],
        // If overlay, use absolute position from data
        left: isOverlay ? data.x : undefined,
        top: isOverlay ? data.y : undefined,

        width: width.value,
        height: height.value,
        zIndex: zIndex.value,
        opacity: shouldHide ? 0 : 1, // Hide original
        elevation: isOverlay ? 8 : 4,
    }));

    return (
        <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.widgetContainer, animatedStyle]}>
                {/* Visual Jiggle in Edit Mode is handled by rotation */}
                <View style={styles.innerContent}>
                    {children}
                </View>

                {/* Edit Mode: Remove Button Badge */}
                {isEditMode && (
                    <TouchableOpacity style={styles.removeBadge} onPress={handleRemove}>
                        <Svg width="12" height="2" viewBox="0 0 12 2" fill="none">
                            <Line x1="0" y1="1" x2="12" y2="1" stroke="black" strokeWidth="2" />
                        </Svg>
                    </TouchableOpacity>
                )}

                {/* Context Menu (Only for Overlay) */}
                {isOverlay && (
                    <View style={styles.contextMenu}>
                        <View style={styles.menuItemContainer}>
                            <TouchableOpacity style={styles.menuItem} onPress={handleRemove}>
                                <Text style={[styles.menuText, { color: '#FF4D4D' }]}>{`Remove Widget`}</Text>
                                <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4D4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <Path d="M3 6h18" />
                                    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </Svg>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.menuItemContainer}>
                            <TouchableOpacity style={styles.menuItem} onPress={() => {
                                dispatch({ type: 'TOGGLE_EDIT_MODE', payload: true });
                                // Focus clears automatically via reducer or effect
                            }}>
                                <Text style={styles.menuText}>{`Edit Page`}</Text>
                                <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </Svg>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Edit Mode: Resize Handle (iOS Style) */}
                {isEditMode && (
                    <GestureDetector gesture={resizeGesture}>
                        <View style={styles.resizeHandle}>
                            <Svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                                {/* Visible Handle Arc */}
                                <Path
                                    d="M22 34 A14 14 0 0 0 34 22"
                                    stroke="rgba(127.5,127.5,127.5,1)"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                />
                            </Svg>
                        </View>
                    </GestureDetector>
                )}
            </Animated.View>
        </GestureDetector>
    );
};

export default memo(DraggableWidget);

const styles = StyleSheet.create({
    widgetContainer: {
        position: 'absolute',
        // Shadow for the widget itself (iOS)
        shadowColor: 'rgba(100, 100, 100, 1)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,

        // Android Elevation requires backgroundColor on the same view
        elevation: 8,
        backgroundColor: '#FFF',
        borderRadius: 16, // Match innerContent radius to prevent square corners on shadow
    },
    resizeHandle: {
        position: 'absolute',
        bottom: -10,
        right: -10,
        width: 50,
        height: 50,
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        zIndex: 1000,
        // No shadow/bg on the container itself to allow SVG to dictate shape
    },
    innerContent: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
    },
    shaking: {
        // Placeholder for shake animation style if needed
        opacity: 0.9,
    },
    removeBadge: {
        position: 'absolute',
        top: -8,
        left: -8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#EAEAEA',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FFF',
        zIndex: 999,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    contextMenu: {
        position: 'absolute',
        top: -60, // Above widget
        alignSelf: 'center',
        width: 180,
        backgroundColor: '#FFF',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 100,
        paddingVertical: 4,
    },
    menuItemContainer: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    menuText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    divider: {
        height: 1,
        backgroundColor: '#F0F0F0',
    }
});
```

### 4. Focus Overlay
#### **File:** [`src/widget/components/SelectedWidgetModal.js`](./components/SelectedWidgetModal.js)
A modal that appears when an item is Long Pressed.

```javascript
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native'
import React, { memo, useCallback } from 'react'
import LinearGradient from 'react-native-linear-gradient';
import { useWidgetContext } from '../context/WidgetContext';
import DraggableWidget from './DraggableWidget';
import { BlurView } from '@react-native-community/blur';

const SelectedWidgetModal = () => {
    const { state, dispatch } = useWidgetContext();

    const handleDismiss = useCallback(() => {
        dispatch({ type: 'SET_FOCUSED_WIDGET', payload: null })
    }, [])

    return (
        <Modal
            visible={!!state.focusedWidget}
            transparent={true}
            animationType="fade"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            <View style={StyleSheet.absoluteFill}>
                {/* Glassmorphism Background: Blur + Gradient Tint */}
                <BlurView
                    style={StyleSheet.absoluteFill}
                    blurType="light"
                    blurAmount={25}
                    reducedTransparencyFallbackColor="white"
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.2)']}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />
                </BlurView>

                {/* Tap Background to Close */}
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={handleDismiss}
                />

                {state.focusedWidget &&
                    (() => {
                        const original = state.widgets.find(
                            w => w.id === state.focusedWidget.id,
                        );
                        if (!original) return null;

                        // Create overlay data with absolute position
                        const overlayData = {
                            ...original,
                            x: state.focusedWidget.layout.x,
                            y: state.focusedWidget.layout.y,
                            width: state.focusedWidget.layout.width,
                            height: state.focusedWidget.layout.height,
                        };

                        return (
                            <DraggableWidget
                                key={`${original.id}_overlay`}
                                data={overlayData}
                                isOverlay={true}
                            >
                                {/* Replace with Your Component */}
                                <Image
                                    source={{ uri: original?.data }}
                                    style={{ width: '100%', height: '100%', }}
                                    resizeMode='cover'
                                />
                            </DraggableWidget>
                        );
                    })()}
            </View>
        </Modal>
    )
}

export default memo(SelectedWidgetModal)
```

---

## State Management

#### **File:** [`src/widget/context/WidgetContext.js`](./context/WidgetContext.js)
Uses `useReducer` to manage the single source of truth for the layout.

```javascript
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
```

---

## Layout Logic (The Engine)

### 1. Grid Math
#### **File:** [`src/widget/utils/measure.js`](./utils/measure.js)
Defines the "Physical World" rules.

```javascript
import { Dimensions } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const MARGIN = 15;
export const COLUMNS = 2;
export const COLUMN_WIDTH = (SCREEN_WIDTH - (MARGIN * (COLUMNS + 1))) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;
```

### 2. Auto-Layout Algorithm
#### **File:** [`src/widget/utils/layoutUtils.js`](./utils/layoutUtils.js)
This file contains the logic that makes the widgets "snap" to a grid.

```javascript
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
```

### 3. Interaction Helpers
#### **File:** [`src/widget/utils/reorderUtils.js`](./utils/reorderUtils.js)
Contains pure math functions for collision detection and index calculations.

```javascript
/**
 * Returns the layout position (x, y) for an item at a given index
 */
export const getPosition = (
    index,
    itemWidth,
    itemHeight, // Assuming fixed height for grid slots or handled via row?
    columns,
    gap,
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
```

---

## Demo Sheets & Controls

### Add Widget Sheet
#### **File:** [`src/widget/demo/AddWidgetSheet.js`](./demo/AddWidgetSheet.js)

```javascript
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, ScrollView } from 'react-native';
import { useWidgetContext } from '../context/WidgetContext';

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

const AddWidgetSheet = ({ visible, onClose = () => { } }) => {
    const { addWidget } = useWidgetContext();

    const handleAddPress = useCallback((type) => {
        addWidget(type);
        onClose();
    }, []);

    return (
        <>
            <Modal
                visible={visible}
                transparent={true}
                animationType="slide"
                statusBarTranslucent
                onRequestClose={onClose}
            >
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
                    <View style={styles.sheet}>
                        <View style={styles.handle} />
                        <Text style={styles.title}>Add Widget</Text>

                        <ScrollView contentContainerStyle={styles.grid}>
                            {
                                DATA.map((uri, index) =>
                                    <TouchableOpacity key={index} style={styles.gridItem} onPress={() => handleAddPress(uri)}>
                                        <Image
                                            source={{ uri: uri }}
                                            style={styles.full}
                                            resizeMode='cover'
                                        />
                                    </TouchableOpacity>
                                )
                            }
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            <View style={styles.backdrop} />
        </>
    );
};

export default memo(AddWidgetSheet);

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
        top: -100,
        bottom: -100,
        left: -100,
        right: -100,
    },
    sheet: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 0,
        maxHeight: '60%',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#CCC',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 24,
        color: '#000',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingBottom: 9,
    },
    gridItem: {
        width: '48%',
        alignItems: 'center',
        backgroundColor: '#F7F7F7',
        color: '#333',
        height: 140,
        justifyContent: 'center',
        marginBottom: 15,
        borderRadius: 15,
        overflow: 'hidden',
    },
    full: {
        width: '100%',
        height: '100%',
    },
});
```

### Edit Controls
#### **File:** [`src/widget/demo/EditControls.js`](./demo/EditControls.js)

```javascript
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Line, Polyline } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

const EditControls = ({ onAddPress = () => { } }) => {
    const { state, dispatch } = useWidgetContext();
    const { isEditMode } = useMemo(() => state, [state]);

    const handleDone = useCallback(() => {
        dispatch({ type: 'TOGGLE_EDIT_MODE', payload: false });
    }, []);

    if (!isEditMode) return null;

    return (
        <View style={styles.container}>
            <TouchableOpacity style={[styles.btn, styles.addBtn]} onPress={onAddPress}>
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                    <Line x1="12" y1="5" x2="12" y2="19" />
                    <Line x1="5" y1="12" x2="19" y2="12" />
                </Svg>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.doneBtn]} onPress={handleDone}>
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3">
                    <Polyline points="20 6 9 17 4 12" />
                </Svg>
            </TouchableOpacity>
        </View>
    );
};

export default memo(EditControls);

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 40,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10,
        gap: 50,
        alignSelf: 'center',
        borderRadius: 16,
    },
    btn: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    addBtn: {
        backgroundColor: '#FCD535', // Yellow
    },
    doneBtn: {
        backgroundColor: '#000000', // Black
    }
});
```

---

## Interaction Flow

### 1. Adding a Widget
1.  User taps "Add" Button in `EditControls`.
2.  `AddWidgetSheet` opens.
3.  User selects an Image.
4.  `addWidget` (Context) is called.
5.  `appendWidget` (LayoutUtils) places it at the end.
6.  Reducer updates state -> Canvas re-renders.

### 2. Move / Reorder
1.  User enters Edit Mode (Long Press empty space or Button).
2.  User drags a widget (`DraggableWidget`).
3.  `onUpdate`: Local `SharedValue` X/Y update (visual only, no render).
4.  `onEnd`: Dispatch `REORDER_WIDGET` with final X/Y.
5.  `reorderWidgets`: Calculates new array order based on drop zone.
6.  `recalculateLayout`: Snaps everything to the grid.

### 3. Resizing
1.  User drags the handle in the bottom-right corner.
2.  `onUpdate`: Updates `width/height` shared values (visual).
3.  `onEnd`: Dispatch `RESIZE_WIDGET`.
4.  Reducer updates dimensions.
5.  Layout engine finds new holes or pushes neighbors down.
