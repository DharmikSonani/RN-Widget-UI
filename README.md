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

- **Add** widgets dynamically.
- **Drag and Drop** to reorder items with auto-sorting.
- **Resize** widgets with a handle.
- **Focus** on widgets to view them in an overlay.
- **Remove** widgets via a context menu.

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
│   └── measure.js               # Grid constants (columns, margins)
└── WidgetView.js                # Public Entry Point
```

---

## Core Components

### 1. Entry Point

#### **File:** [`src/widget/WidgetView.js`](./WidgetView.js)

The main container that initializes the environment. Wraps the entire system in the Context Provider so all children can access state.

```javascript
import { StyleSheet } from 'react-native';
import React, { memo } from 'react';
import { WidgetProvider } from './context/WidgetContext';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import WidgetCanvas from './components/WidgetCanvas';

const WidgetView = () => {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <WidgetProvider>
          <SafeAreaView
            style={styles.container}
            edges={['top', 'left', 'right']}
          >
            <WidgetCanvas />
          </SafeAreaView>
        </WidgetProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default memo(WidgetView);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
```

### 2. The Canvas

#### **File:** [`src/widget/components/WidgetCanvas.js`](./components/WidgetCanvas.js)

The scrollable "desktop" where widgets live. Subscribes to `WidgetContext` to map `state.widgets` to components.

```javascript
import React, {
  memo,
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, View, Text, Image, Dimensions } from 'react-native';
import { useWidgetContext } from '../context/WidgetContext';
import { calculateTotalContentHeight } from '../utils/layoutUtils';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedRef,
  useAnimatedReaction,
  scrollTo,
} from 'react-native-reanimated';
import EditControls from '../demo/EditControls';
import AddWidgetSheet from '../demo/AddWidgetSheet';
import DraggableWidget from './DraggableWidget';
import SelectedWidgetModal from './SelectedWidgetModal';
import { MARGIN } from '../utils/measure';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// Configurable buffer: 1.0 means 1 screen height above and 1 screen height below.
// Total rendered height = Buffer + Screen + Buffer = 1 + 1 + 1 = 3x Screen Height.
const VISIBILITY_BUFFER = SCREEN_HEIGHT * 1.0;

const WidgetCanvas = () => {
  const { state, dispatch } = useWidgetContext();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Virtualization State
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const [draggingId, setDraggingId] = useState(null);
  const scrollY = useSharedValue(0);

  const contentHeight = calculateTotalContentHeight(state.widgets);

  // Use SharedValue for widgets array to safely access from worklets
  const widgetsShared = useSharedValue(state.widgets);
  useEffect(() => {
    widgetsShared.value = state.widgets;
  }, [state.widgets]);

  const scrollRef = useAnimatedRef();

  // Track previous visible range on UI thread to avoid redundant JS calls
  const prevStartIndex = useSharedValue(0);
  const prevEndIndex = useSharedValue(50);
  const prevLength = useSharedValue(0);

  // Virtualization on UI Thread - Only call JS when range actually changes
  // Optimized with threshold to reduce updates
  const RANGE_CHANGE_THRESHOLD = 5; // Only update if range changes by this many items

  useAnimatedReaction(
    () => {
      const y = scrollY.value;
      const widgets = widgetsShared.value;
      const len = widgets.length;
      const minY = y - VISIBILITY_BUFFER - SCREEN_HEIGHT;
      const maxY = y + SCREEN_HEIGHT + VISIBILITY_BUFFER;

      // Binary search for start index (optimized)
      let start = 0;
      let end = len - 1;
      let startIndex = 0;

      while (start <= end) {
        const mid = (start + end) >>> 1;
        const w = widgets[mid];

        if (w.y + w.height >= minY) {
          startIndex = mid;
          end = mid - 1;
        } else {
          start = mid + 1;
        }
      }

      // Linear scan for end index
      let endIndex = len;
      for (let i = startIndex; i < len; i++) {
        if (widgets[i].y > maxY) {
          endIndex = i;
          break;
        }
      }

      return { start: startIndex, end: endIndex, length: len };
    },
    (current, previous) => {
      // Only update JS state if the range changed significantly
      // This reduces React re-renders during scrolling
      const startDiff = Math.abs(current.start - prevStartIndex.value);
      const endDiff = Math.abs(current.end - prevEndIndex.value);
      const lengthChanged = current.length !== prevLength.value;

      if (
        lengthChanged ||
        startDiff > RANGE_CHANGE_THRESHOLD ||
        endDiff > RANGE_CHANGE_THRESHOLD
      ) {
        prevStartIndex.value = current.start;
        prevEndIndex.value = current.end;
        prevLength.value = current.length;
        runOnJS(setVisibleRange)({ start: current.start, end: current.end });
      }
    },
  );

  // Memoize handlers to prevent re-renders of children
  const handleDragStart = useCallback(id => setDraggingId(id), []);
  const handleDragEnd = useCallback(() => setDraggingId(null), []);

  // Auto-Scroll Shared Values
  const isDragging = useSharedValue(0); // 0 or 1
  const dragY = useSharedValue(0); // Absolute Y position of touch

  // Global Drag Shared Values (Screen Coordinates)
  const globalOriginX = useSharedValue(0);
  const globalOriginY = useSharedValue(0);
  const globalTranslationX = useSharedValue(0);
  const globalTranslationY = useSharedValue(0);
  const globalWidth = useSharedValue(0);
  const globalHeight = useSharedValue(0);

  const scrollToPosition = y => {
    'worklet';
    scrollTo(scrollRef, 0, y, false);
  };

  // Auto-Scroll Logic - Continuous scrolling at edges during drag
  useAnimatedReaction(
    () => {
      return {
        isDragging: isDragging.value,
        y: dragY.value,
        scrollY: scrollY.value,
      };
    },
    current => {
      // Only auto-scroll when actively dragging
      if (current.isDragging !== 1) return;

      const SCROLL_THRESHOLD = 100;
      const SCROLL_SPEED = 20; // Increased for smoother continuous scroll

      // Check if near bottom edge
      if (current.y > SCREEN_HEIGHT - SCROLL_THRESHOLD) {
        // Scroll Down continuously
        scrollToPosition(current.scrollY + SCROLL_SPEED);
      }
      // Check if near top edge
      else if (current.y < SCROLL_THRESHOLD && current.scrollY > 0) {
        // Scroll Up continuously
        scrollToPosition(current.scrollY - SCROLL_SPEED);
      }
    },
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const visibleWidgets = useMemo(() => {
    // Standard Window
    const windowed = state.widgets.slice(visibleRange.start, visibleRange.end);

    // If we are dragging, ensure the dragged widget is in the list
    if (draggingId) {
      const isInside = windowed.find(w => w.id === draggingId);
      if (!isInside) {
        const draggedWidget = state.widgets.find(w => w.id === draggingId);
        if (draggedWidget) {
          return [...windowed, draggedWidget];
        }
      }
    }
    return windowed;
  }, [state.widgets, visibleRange, draggingId]);

  const longPressEmpty = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(dispatch)({ type: 'TOGGLE_EDIT_MODE', payload: true });
    });

  const handleAddPress = useCallback(() => {
    setIsSheetOpen(true);
  }, []);

  const handleSheetClose = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  return (
    <View style={styles.container}>
      {/* Widget Canvas */}
      {state.widgets.length === 0 ? (
        <GestureDetector gesture={longPressEmpty}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyPlacholder} numberOfLines={1}>
              {`Long press to add widgets`}
            </Text>
          </View>
        </GestureDetector>
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.contentContainer]}
          onScroll={scrollHandler}
          scrollEventThrottle={16} // Throttle to ~60fps for logic check, UI thread is still 60fps
          removeClippedSubviews={false} // We handle it manually
          scrollEnabled={!draggingId} // Disable scroll during drag to prevent conflicts
        >
          {/* Widget Layer */}
          <View style={[styles.canvasContainer, { height: contentHeight }]}>
            {/* Render regular widgets */}
            {visibleWidgets.map(widget => (
              <DraggableWidget
                key={widget.id}
                data={widget}
                dispatch={dispatch}
                isEditMode={state.isEditMode}
                isFocused={state.focusedWidget?.id === widget.id}
                dragY={dragY}
                isDraggingGlobal={isDragging}
                scrollY={scrollY}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                globalOriginX={globalOriginX}
                globalOriginY={globalOriginY}
                globalTranslationX={globalTranslationX}
                globalTranslationY={globalTranslationY}
                globalWidth={globalWidth}
                globalHeight={globalHeight}
              >
                {/* Replace with Your Component */}
                <Image
                  source={{ uri: widget?.data }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </DraggableWidget>
            ))}
          </View>
        </Animated.ScrollView>
      )}

      <SelectedWidgetModal />

      {/* Edit Mode Controls */}
      <EditControls onAddPress={handleAddPress} />

      {/* Bottom Sheet */}
      {isSheetOpen && <AddWidgetSheet onClose={handleSheetClose} />}
    </View>
  );
};

export default memo(WidgetCanvas);

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
});
```

### 3. The Widget

#### **File:** [`src/widget/components/DraggableWidget.js`](./components/DraggableWidget.js)

The complex heart of the system. Wraps content with Reanimated gestures for Dragging, Focusing, and Resizing.

```javascript
import React, { memo, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { Svg, Path, Line } from 'react-native-svg';

const DraggableWidget = ({
  data,
  dispatch,
  isEditMode = false,
  isFocused = false,
  isOverlay = false,
  dragY,
  isDraggingGlobal,
  scrollY: parentScrollY,
  onDragStart,
  onDragEnd,
  globalOriginX,
  globalOriginY,
  globalTranslationX,
  globalTranslationY,
  globalWidth,
  globalHeight,
  children,
}) => {
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

  // Drag Logic Shared Values
  const isDraggingLocal = useSharedValue(false);
  const isResizingLocal = useSharedValue(false);
  const isPendingUpdate = useSharedValue(false); // Prevents snap-back to stale data
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const resizeStartWidth = useSharedValue(0);
  const resizeStartHeight = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);

  // Target Values (Single Source of Truth for Animation)
  const targetX = useSharedValue(data.x);
  const targetY = useSharedValue(data.y);
  const targetW = useSharedValue(data.width);
  const targetH = useSharedValue(data.height);
  const targetZ = useSharedValue(data.zIndex);

  // 1. Data Sync Effect: Updates Targets & Clears Pending State
  useEffect(() => {
    // Always update targets when data changes
    targetX.value = data.x;
    targetY.value = data.y;
    targetW.value = data.width;
    targetH.value = data.height;
    targetZ.value = data.zIndex;

    // Verify Staleness to clear Pending State
    if (isPendingUpdate.value) {
      const isStalePos =
        Math.abs(data.x - dragStartX.value) < 1 &&
        Math.abs(data.y - dragStartY.value) < 1;
      const isStaleSize =
        Math.abs(data.width - resizeStartWidth.value) < 1 &&
        Math.abs(data.height - resizeStartHeight.value) < 1;

      // If data is NOT stale (it changed), we can clear pending immediately.
      // If it IS stale, we wait for timeout (handled by JS callback).
      if (!isStalePos || !isStaleSize) {
        isPendingUpdate.value = false;
      }
    }
  }, [
    data,
    targetX,
    targetY,
    targetW,
    targetH,
    targetZ,
    isPendingUpdate,
    dragStartX,
    dragStartY,
    resizeStartWidth,
    resizeStartHeight,
  ]);

  // 2. Position Controller: Drives Animation based on State & Targets
  useAnimatedReaction(
    () => {
      return {
        isDragging: isDraggingLocal.value,
        isPending: isPendingUpdate.value,
        tX: targetX.value,
        tY: targetY.value,
        tW: targetW.value,
        tH: targetH.value,
        tZ: targetZ.value,
      };
    },
    (current, previous) => {
      // If dragging, user controls position (do nothing here)
      if (current.isDragging) return;

      // If pending update, hold current position (wait for data or timeout)
      if (current.isPending) return;

      // Otherwise, animate to target
      x.value = withTiming(current.tX);
      y.value = withTiming(current.tY);
      width.value = withTiming(current.tW);
      height.value = withTiming(current.tH);
      zIndex.value = current.tZ;
    },
  );

  // Reaction to update Y position based on Scroll Delta
  useAnimatedReaction(
    () => {
      return {
        isDragging: isDraggingLocal.value,
        // Safely access parentScrollY.value, default to 0 if prop is undefined/null
        scrollYValue: parentScrollY ? parentScrollY.value : 0,
        transX: translationX.value,
        transY: translationY.value,
      };
    },
    (current, previous) => {
      if (current.isDragging) {
        // Calculate delta using captured values
        // current.scrollYValue is the current scroll position
        // dragStartScrollY.value is the snapshot at drag start
        const scrollDelta = current.scrollYValue - dragStartScrollY.value;

        // Update Value
        x.value = dragStartX.value + current.transX;
        // Add scrollDelta to Y to keep it "fixed" on screen (counter-act scroll)
        y.value = dragStartY.value + current.transY + scrollDelta;
      }
    },
  );

  useEffect(() => {
    if (isEditMode) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-1.5, { duration: 150 }),
          withTiming(1.5, { duration: 150 }),
        ),
        -1,
        true, // reverse
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

  // Safe callback for drag end logic (timeout + dispatch) on JS thread
  const handleDragEndAction = useCallback(
    (id, xVal, yVal) => {
      // Safety timeout to reset pending state
      // Reduced to 150ms for "immediate" feel on invalid drops, while allowing minimal time for prop updates
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);

      dispatch({
        type: 'REORDER_WIDGET',
        payload: {
          id: id,
          x: xVal,
          y: yVal,
        },
      });
    },
    [dispatch, isPendingUpdate],
  );

  const handleResizeEndAction = useCallback(
    (id, wVal, hVal) => {
      // Safety timeout to reset pending state
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);

      dispatch({
        type: 'RESIZE_WIDGET',
        payload: {
          id: id,
          width: wVal,
          height: hVal,
        },
      });
    },
    [dispatch, isPendingUpdate],
  );

  const handleLongPress = e => {
    if (isEditMode || isOverlay) return;

    // Calculate Absolute Position
    // e.absoluteX is global screen coord
    // e.x is relative to view
    // pageX = e.absoluteX - e.x
    // Actually, for LongPress onStart, we get absolute coordinates?
    // Let's use `measure` if possible, but we don't have ref easily here.
    // Gesture handler provides absoluteX/Y.

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
          height: data.height,
        },
      },
    });
  };

  // --- Gestures ---

  // Memoize gestures to prevent cancellation on re-render
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(500)
        .enabled(!isEditMode && !isOverlay)
        .onStart(e => {
          runOnJS(handleLongPress)(e);
        }),
    [isEditMode, isOverlay, handleLongPress],
  );

  const overlayGesture = useMemo(
    () => Gesture.Tap().enabled(isOverlay),
    [isOverlay],
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .activateAfterLongPress(20) // Prevent accidental drags when scrolling
        .onStart(e => {
          runOnJS(bringToFront)();
          if (onDragStart) runOnJS(onDragStart)(data.id);
          if (isDraggingGlobal) isDraggingGlobal.value = 1;

          isDraggingLocal.value = true;
          isPendingUpdate.value = false; // Reset pending state
          dragStartX.value = x.value;
          dragStartY.value = y.value;
          // Capture size snapshot largely for consistency logic
          resizeStartWidth.value = width.value;
          resizeStartHeight.value = height.value;
          dragStartScrollY.value = parentScrollY ? parentScrollY.value : 0;
          translationX.value = 0;
          translationY.value = 0;

          // Global Overlay Sync
          if (globalOriginX) globalOriginX.value = e.absoluteX - e.x;
          if (globalOriginY) globalOriginY.value = e.absoluteY - e.y;
          if (globalTranslationX) globalTranslationX.value = 0;
          if (globalTranslationY) globalTranslationY.value = 0;
          if (globalWidth) globalWidth.value = data.width;
          if (globalHeight) globalHeight.value = data.height;
        })
        .onUpdate(e => {
          translationX.value = e.translationX;
          translationY.value = e.translationY;

          // Global Overlay Sync
          if (globalTranslationX) globalTranslationX.value = e.translationX;
          if (globalTranslationY) globalTranslationY.value = e.translationY;

          if (dragY && isDraggingGlobal) {
            // e.absoluteY is the absolute Y on screen
            dragY.value = e.absoluteY;
          }
        })
        .onFinalize(() => {
          // Ensure global flag is reset immediately on UI thread
          if (isDraggingGlobal) isDraggingGlobal.value = 0;

          // Only dispatch reorder if widget has actually moved significantly
          // This preserves previous state when there's no meaningful movement
          const deltaX = Math.abs(x.value - data.x);
          const deltaY = Math.abs(y.value - data.y);
          const hasMovedSignificantly = deltaX > 5 || deltaY > 5;

          if (hasMovedSignificantly) {
            // Set pending update FIRST to prevent snap-back to old props
            // when isDraggingLocal becomes false below.
            isPendingUpdate.value = true;

            // Call JS callback safely
            runOnJS(handleDragEndAction)(data.id, x.value, y.value);
          }

          // Clear dragging state LAST
          isDraggingLocal.value = false;
          if (onDragEnd) runOnJS(onDragEnd)();
        }),
    [
      isEditMode,
      isDraggingGlobal,
      data.id,
      data.x,
      data.y,
      x,
      y,
      dragY,
      parentScrollY,
      onDragStart,
      onDragEnd,
      dispatch,
      bringToFront,
      globalOriginX,
      globalOriginY,
      globalTranslationX,
      globalTranslationY,
      handleDragEndAction,
    ],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .onStart(() => {
          runOnJS(bringToFront)();
          // Set resizing state to elevate z-index during resize
          isResizingLocal.value = true;

          // Capture Start Values for Staleness Check
          dragStartX.value = x.value;
          dragStartY.value = y.value;
          resizeStartWidth.value = width.value;
          resizeStartHeight.value = height.value;
        })
        .onUpdate(e => {
          const newW = Math.max(10, data.width + e.translationX);
          const newH = Math.max(10, data.height + e.translationY);
          width.value = newW;
          height.value = newH;
        })
        .onEnd(() => {
          // Reset resizing state
          isResizingLocal.value = false;

          // Pending Update for Resize
          isPendingUpdate.value = true;

          runOnJS(handleResizeEndAction)(data.id, width.value, height.value);
        }),
    [
      isEditMode,
      data.id,
      data.width,
      data.height,
      width,
      height,
      dispatch,
      bringToFront,
      dragStartX,
      dragStartY,
      resizeStartWidth,
      resizeStartHeight,
      x,
      y,
      handleResizeEndAction,
    ],
  );

  const composedGesture = useMemo(
    () =>
      isOverlay
        ? overlayGesture
        : Gesture.Exclusive(dragGesture, longPressGesture),
    [isOverlay, overlayGesture, dragGesture, longPressGesture],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive =
      isDraggingLocal.value ||
      isResizingLocal.value ||
      isOverlay ||
      isPendingUpdate.value;
    return {
      transform: [
        { translateX: isOverlay ? 0 : x.value },
        { translateY: isOverlay ? 0 : y.value },
        { scale: scale.value },
        { rotateZ: `${rotation.value}deg` },
      ],
      // If overlay, use absolute position from data
      left: isOverlay ? data.x : undefined,
      top: isOverlay ? data.y : undefined,

      width: width.value,
      height: height.value,
      // Force high z-index locally when dragging/pending to prevent flicker/clipping
      zIndex: isActive ? 9999 : zIndex.value,
      opacity: shouldHide ? 0 : 1, // Hide original

      // Dynamic elevation with smooth transition
      elevation: withTiming(isActive ? 10 : 4, { duration: 200 }),
    };
  });

  return (
    <Animated.View style={[styles.widgetContainer, animatedStyle]}>
      <GestureDetector gesture={composedGesture}>
        {/* Visual Jiggle in Edit Mode is handled by rotation */}
        <View style={styles.innerContent}>{children}</View>
      </GestureDetector>

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
              <Text
                style={[styles.menuText, { color: '#FF4D4D' }]}
              >{`Remove Widget`}</Text>
              <Svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FF4D4D"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M3 6h18" />
                <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </Svg>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.menuItemContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                dispatch({ type: 'TOGGLE_EDIT_MODE', payload: true });
                // Focus clears automatically via reducer or effect
              }}
            >
              <Text style={styles.menuText}>{`Edit Page`}</Text>
              <Svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#333"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        </GestureDetector>
      )}
    </Animated.View>
  );
};

export default memo(DraggableWidget);

const styles = StyleSheet.create({
  widgetContainer: {
    position: 'absolute',
    // Shadow for the widget itself (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, // Reduced from 0.15 + high radius
    shadowRadius: 5, // Reduced from 12

    // Android Elevation requires backgroundColor on the same view
    elevation: 4, // Reduced from 8
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
  },
});
```

### 4. Focus Overlay

#### **File:** [`src/widget/components/SelectedWidgetModal.js`](./components/SelectedWidgetModal.js)

A modal that appears when an item is Long Pressed.

```javascript
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import React, { memo, useCallback } from 'react';
import LinearGradient from 'react-native-linear-gradient';
import { useWidgetContext } from '../context/WidgetContext';
import DraggableWidget from './DraggableWidget';
import { BlurView } from '@react-native-community/blur';

const SelectedWidgetModal = () => {
  const { state, dispatch } = useWidgetContext();

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_WIDGET', payload: null });
  }, []);

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
                dispatch={dispatch}
                scrollY={null}
              >
                {/* Replace with Your Component */}
                <Image
                  source={{ uri: original?.data }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </DraggableWidget>
            );
          })()}
      </View>
    </Modal>
  );
};

export default memo(SelectedWidgetModal);
```

---

## State Management

#### **File:** [`src/widget/context/WidgetContext.js`](./context/WidgetContext.js)

Uses `useReducer` to manage the single source of truth for the layout.

```javascript
import React, {
  createContext,
  useReducer,
  useContext,
  useCallback,
  useMemo,
} from 'react';
import {
  appendWidget,
  reorderWidgets,
  resizeWidgetInList,
  recalculateLayout,
} from '../utils/layoutUtils';
import { COLUMN_WIDTH, ROW_HEIGHT } from '../utils/measure';

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
        widgets: appendWidget(state.widgets, action.payload),
      };

    case 'REMOVE_WIDGET':
      const remaining = state.widgets.filter(w => w.id !== action.payload);
      // Recalculate layout for remaining
      return {
        ...state,
        // If the removed widget was focused, clear focus
        focusedWidget:
          state.focusedWidget?.id === action.payload
            ? null
            : state.focusedWidget,
        widgets: recalculateLayout(remaining),
      };

    case 'UPDATE_WIDGET':
      return {
        ...state,
        widgets: state.widgets.map(w =>
          w.id === action.payload.id ? { ...w, ...action.payload } : w,
        ),
      };

    case 'REORDER_WIDGET':
      // Payload: { id: string, x: number, y: number } - Drag End Coords
      return {
        ...state,
        widgets: reorderWidgets(
          state.widgets,
          action.payload.id,
          action.payload.x,
          action.payload.y,
        ),
      };

    case 'RESIZE_WIDGET':
      return {
        ...state,
        widgets: resizeWidgetInList(
          state.widgets,
          action.payload.id,
          action.payload.width,
          action.payload.height,
        ),
      };

    case 'BRING_TO_FRONT':
      // Only update the widget that needs z-index change
      return {
        ...state,
        widgets: state.widgets.map(w =>
          w.id === action.payload ? { ...w, zIndex: 999 } : w,
        ),
      };

    case 'TOGGLE_EDIT_MODE':
      return {
        ...state,
        isEditMode: action.payload,
        // Clear focus when entering edit mode? Maybe yes.
        focusedWidget: null,
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

  const addWidget = useCallback(data => {
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
      zIndex: 100,
    };

    dispatch({ type: 'ADD_WIDGET', payload: newWidget });
  }, []);

  const contextValue = useMemo(
    () => ({ state, dispatch, addWidget }),
    [state, addWidget],
  );

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
export const COLUMN_WIDTH = (SCREEN_WIDTH - MARGIN * (COLUMNS + 1)) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;

// Pre-calculated grid step values for performance optimization
// These are used in hot paths (layout, reordering) to avoid repeated arithmetic
export const GRID_STEP_X = COLUMN_WIDTH + MARGIN;
export const GRID_STEP_Y = ROW_HEIGHT + MARGIN;
```

### 2. Auto-Layout Algorithm

#### **File:** [`src/widget/utils/layoutUtils.js`](./utils/layoutUtils.js)

This file contains the logic that makes the widgets "snap" to a grid.

```javascript
import {
  COLUMN_WIDTH,
  COLUMNS,
  MARGIN,
  ROW_HEIGHT,
  GRID_STEP_X,
  GRID_STEP_Y,
} from './measure';

export const getGridSizeFromDimensions = (width, height) => {
  const colSpan = width > COLUMN_WIDTH + 20 ? 2 : 1;
  const rowSpan = height > ROW_HEIGHT + 20 ? 2 : 1;
  return { colSpan, rowSpan };
};

export const getDimensionsFromGridSize = (colSpan, rowSpan) => {
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
export const recalculateLayout = widgets => {
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
    if (
      widget.x === newX &&
      widget.y === newY &&
      widget.width === newW &&
      widget.height === newH &&
      widget.gridRow === bestRow &&
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
    };
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
 *
 * Key Fix: When dragging DOWN, uses upper bound (insert after target).
 *          When dragging UP, uses lower bound (insert before target).
 * This ensures widgets stay exactly at the visual drop position.
 *
 * Performance optimizations:
 * - Early exit for no-op reorders
 * - Cached grid step calculations
 * - Single array operation
 */
export const reorderWidgets = (widgets, widgetId, newX, newY) => {
  const widgetIndex = widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return widgets;

  const widget = widgets[widgetIndex];

  // Calculate target position using cached grid steps
  const activeCol = Math.round((newX - MARGIN) / GRID_STEP_X);
  const activeRow = Math.round(newY / GRID_STEP_Y);
  const targetSortKey =
    activeRow * COLUMNS + Math.max(0, Math.min(activeCol, COLUMNS - 1));

  // Calculate original position for direction detection
  const originalRow = widget.gridRow ?? Math.round(widget.y / GRID_STEP_Y);
  const originalCol =
    widget.gridCol ?? Math.round((widget.x - MARGIN) / GRID_STEP_X);
  const originalSortKey = originalRow * COLUMNS + originalCol;

  // Early exit: If dragging to same position, preserve previous state completely
  // This ensures widgets maintain their exact previous position without recalculation
  if (targetSortKey === originalSortKey) {
    return widgets; // Return original array reference to prevent unnecessary updates
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
    const wRow = w.gridRow ?? Math.round(w.y / GRID_STEP_Y);
    const wCol = w.gridCol ?? Math.round((w.x - MARGIN) / GRID_STEP_X);
    const wSortKey = wRow * COLUMNS + wCol;

    if (isDraggingDown) {
      // Upper bound: find first element > target
      // This places the widget AFTER elements at the target position
      if (wSortKey <= targetSortKey) {
        low = mid + 1;
      } else {
        high = mid;
      }
    } else {
      // Lower bound: find first element >= target
      // This places the widget BEFORE elements at the target position
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

export const appendWidget = (widgets, widget) =>
  recalculateLayout([...widgets, widget]);

export const resizeWidgetInList = (widgets, widgetId, newWidth, newHeight) => {
  // Map over widgets to update size, then recalc layout
  // We do NOT optimize this to single-item update because resizing one item
  // can push *everything* below it down.
  return recalculateLayout(
    widgets.map(w => {
      if (w.id === widgetId) {
        return { ...w, width: newWidth, height: newHeight };
      }
      return w;
    }),
  );
};

export const calculateTotalContentHeight = widgets => {
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
```

---

## Demo Sheets & Controls

### 1. Add Widget Sheet

#### **File:** [`src/widget/demo/AddWidgetSheet.js`](./demo/AddWidgetSheet.js)

```javascript
import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
} from 'react-native';
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
];

const AddWidgetSheet = ({ visible, onClose = () => {} }) => {
  const { addWidget } = useWidgetContext();

  const handleAddPress = useCallback(type => {
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
          <TouchableOpacity
            style={styles.overlay}
            onPress={onClose}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Add Widget</Text>

            <ScrollView
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {DATA.map((uri, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.gridItem}
                  onPress={() => handleAddPress(uri)}
                >
                  <Image
                    source={{ uri: uri }}
                    style={styles.full}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
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

### 2. Edit Controls

#### **File:** [`src/widget/demo/EditControls.js`](./demo/EditControls.js)

```javascript
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Line, Polyline } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

const EditControls = ({ onAddPress = () => {} }) => {
  const { state, dispatch } = useWidgetContext();
  const { isEditMode } = useMemo(() => state, [state]);

  const handleDone = useCallback(() => {
    dispatch({ type: 'TOGGLE_EDIT_MODE', payload: false });
  }, []);

  if (!isEditMode) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, styles.addBtn]}
        onPress={onAddPress}
      >
        <Svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000"
          strokeWidth="3"
        >
          <Line x1="12" y1="5" x2="12" y2="19" />
          <Line x1="5" y1="12" x2="19" y2="12" />
        </Svg>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.doneBtn]}
        onPress={handleDone}
      >
        <Svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFF"
          strokeWidth="3"
        >
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
  },
});
```

---

## Interaction Flow

### 1. Adding a Widget

1.  **User Action**: Taps "Add" button in `EditControls.js` or Long Presses empty space in `WidgetCanvas.js`.
2.  **UI Response**: `AddWidgetSheet.js` modal opens.
3.  **Selection**: User taps an image in the sheet.
4.  **Logic**: `handleAddPress` calls `context.addWidget(uri)`.
5.  **State Update**:
    - `addWidget` in `WidgetContext.js` creates a new widget object with random offset.
    - Dispatches `ADD_WIDGET` action.
6.  **Layout Calculation**:
    - Reducer calls `appendWidget` from `layoutUtils.js`.
    - `recalculateLayout` runs the **Skyline Algorithm** to find the first available slot `(row, col)`.
7.  **Render**: Context updates `state.widgets`, triggering a re-render of `WidgetCanvas`, which maps the new list to `DraggableWidget` components.

### 2. Move / Reorder

1.  **Enter Edit Mode**: Triggered by `TOGGLE_EDIT_MODE` (via UI button or Long Press).
2.  **Drag Start**: User drags a `DraggableWidget`. `PanGesture` activates.
    - `bringToFront` is called (z-index bump).
    - `isDraggingLocal` shared value set to `true`.
3.  **Dragging (UI Thread)**:
    - `onUpdate` modifies `translationX/Y` shared values.
    - `useAnimatedStyle` updates view transform directly (60fps, no JS bridge).
4.  **Drag End**:
    - `onFinalize` checks if movement was significant.
    - Calls `runOnJS(handleDragEndAction)`.
    - Sets `isPendingUpdate` to `true` to prevent visual snap-back before state sync.
5.  **State Update**:
    - `handleDragEndAction` dispatches `REORDER_WIDGET` with final coords `(x, y)`.
6.  **Layout Calculation**:
    - Reducer calls `reorderWidgets` in `layoutUtils.js`.
    - Calculates target grid position `(row, col)`.
    - Performs **Binary Search** to find the new index in the widget array.
    - Moves widget to new index and calls `recalculateLayout` to snap all widgets to grid.

### 3. Resizing

1.  **Resize Start**: User drags the "handle" (bottom-right) in Edit Mode.
2.  **Resizing (UI Thread)**:
    - `onUpdate` modifies `width/height` shared values.
    - Math.max guarantees minimum size (10px).
3.  **Resize End**:
    - `onEnd` calls `runOnJS(handleResizeEndAction)`.
    - Sets `isPendingUpdate` to `true`.
4.  **State Update**:
    - `handleResizeEndAction` dispatches `RESIZE_WIDGET` with new dimensions.
5.  **Layout Calculation**:
    - Reducer calls `resizeWidgetInList` in `layoutUtils.js`.
    - Updates the specific widget's dimensions.
    - Calls `recalculateLayout` to reflow the **entire grid** (Skyline) because changing one widget's size can affect the position of every subsequent widget.
