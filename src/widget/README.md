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
│   ├── DraggableWidget.tsx       # Individual widget wrapper with gestures
│   ├── SelectedWidgetModal.tsx   # Full-screen overlay for focused widget
│   └── WidgetCanvas.tsx          # Main scrollable area rendering the grid
├── context/
│   └── WidgetContext.tsx         # Global state management (Redux-like)
├── demo/
│   ├── AddWidgetSheet.tsx        # Bottom sheet for picking new widgets
│   └── EditControls.tsx          # UI buttons for "Add" and "Done"
├── utils/
│   ├── layoutUtils.ts           # Core auto-layout algorithm
│   ├── measure.ts               # Grid constants (columns, margins)
│   └── types.ts                 # TypeScript interfaces
└── WidgetView.tsx               # Public Entry Point
```

---

## Core Components

### 1. Entry Point

#### **File:** [`src/widget/WidgetView.tsx`](./WidgetView.tsx)

The main container that initializes the environment. Wraps the entire system in the Context Provider so all children can access state.

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { WidgetProvider } from './context/WidgetContext';
import WidgetCanvas from './components/WidgetCanvas';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const WidgetView = () => {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <WidgetProvider>
          <WidgetCanvas />
        </WidgetProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

export default WidgetView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
```

### 2. The Canvas

#### **File:** [`src/widget/components/WidgetCanvas.tsx`](./components/WidgetCanvas.tsx)

The scrollable "desktop" where widgets live. Subscribes to `WidgetContext` to map `state.widgets` to components. Includes virtualization and auto-scroll logic.

```tsx
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
  runOnUI,
} from 'react-native-reanimated';
import EditControls from '../demo/EditControls';
import AddWidgetSheet from '../demo/AddWidgetSheet';
import DraggableWidget from './DraggableWidget';
import SelectedWidgetModal from './SelectedWidgetModal';
import { MARGIN } from '../utils/measure';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const VISIBILITY_BUFFER = SCREEN_HEIGHT * 1.0;

const WidgetCanvas = () => {
  const { state, dispatch } = useWidgetContext();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const scrollY = useSharedValue(0);

  const contentHeight = calculateTotalContentHeight(state.widgets);
  const widgetsShared = useSharedValue(state.widgets);

  useEffect(() => {
    widgetsShared.value = state.widgets;
  }, [state.widgets]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const prevStartIndex = useSharedValue(0);
  const prevEndIndex = useSharedValue(50);
  const prevLength = useSharedValue(0);
  const RANGE_CHANGE_THRESHOLD = 5;

  useAnimatedReaction(
    () => {
      const y = scrollY.value;
      const widgets = widgetsShared.value;
      const len = widgets.length;
      const minY = y - VISIBILITY_BUFFER - SCREEN_HEIGHT;
      const maxY = y + SCREEN_HEIGHT + VISIBILITY_BUFFER;

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

  const isDragging = useSharedValue(0);
  const dragY = useSharedValue(0);
  const globalOriginX = useSharedValue(0);
  const globalOriginY = useSharedValue(0);
  const globalTranslationX = useSharedValue(0);
  const globalTranslationY = useSharedValue(0);
  const globalWidth = useSharedValue(0);
  const globalHeight = useSharedValue(0);

  const rafId = useRef<number | null>(null);
  const containerRef = useRef<View>(null);
  const containerLayout = useSharedValue({ top: 0, bottom: SCREEN_HEIGHT });

  const handleDragStart = useCallback(
    (id: string | number) => {
      setDraggingId(id);
      if (containerRef.current) {
        containerRef.current.measure((x, y, width, height, pageX, pageY) => {
          containerLayout.value = { top: pageY, bottom: pageY + height };
        });
      }
    },
    [containerLayout],
  );

  const scrollToPosition = (y: number) => {
    'worklet';
    scrollTo(scrollRef, 0, y, false);
  };

  const performAutoScroll = useCallback(() => {
    const SCROLL_THRESHOLD = 150;
    const BASE_SPEED = 5;
    const MAX_SPEED = 20;

    const currentDragY = dragY.value;
    const currentScrollY = scrollY.value;
    const currentIsDragging = isDragging.value;

    if (currentIsDragging !== 1) return;

    let speed = 0;
    const layout = containerLayout.value;
    const topEdge = layout.top || 0;
    const bottomEdge =
      layout.bottom && layout.bottom > 0 ? layout.bottom : SCREEN_HEIGHT;

    if (currentDragY > bottomEdge - SCROLL_THRESHOLD) {
      const ratio =
        (currentDragY - (bottomEdge - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      speed = BASE_SPEED + ratio * (MAX_SPEED - BASE_SPEED);
      runOnUI(scrollToPosition)(currentScrollY + speed);
    } else if (
      currentDragY < topEdge + SCROLL_THRESHOLD &&
      currentScrollY > 0
    ) {
      const ratio =
        (topEdge + SCROLL_THRESHOLD - currentDragY) / SCROLL_THRESHOLD;
      speed = BASE_SPEED + ratio * (MAX_SPEED - BASE_SPEED);
      runOnUI(scrollToPosition)(Math.max(0, currentScrollY - speed));
    }

    rafId.current = requestAnimationFrame(performAutoScroll);
  }, [SCREEN_HEIGHT]);

  const startAutoScroll = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    performAutoScroll();
  }, [performAutoScroll]);

  const stopAutoScroll = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  useAnimatedReaction(
    () => isDragging.value,
    (isDraggingValue, prevValue) => {
      if (isDraggingValue === 1 && prevValue !== 1) {
        runOnJS(startAutoScroll)();
      } else if (isDraggingValue !== 1 && prevValue === 1) {
        runOnJS(stopAutoScroll)();
      }
    },
    [startAutoScroll, stopAutoScroll],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const visibleWidgets = useMemo(() => {
    const windowed = state.widgets.slice(visibleRange.start, visibleRange.end);
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

  const handleDragEnd = useCallback(() => setDraggingId(null), []);
  const handleAddPress = useCallback(() => {
    setIsSheetOpen(true);
  }, []);
  const handleSheetClose = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  return (
    <View ref={containerRef} style={styles.container}>
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
          scrollEventThrottle={16}
          removeClippedSubviews={false}
        >
          <View style={[styles.canvasContainer, { height: contentHeight }]}>
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
      <EditControls onAddPress={handleAddPress} />
      {isSheetOpen && <AddWidgetSheet onClose={handleSheetClose} />}
    </View>
  );
};

export default memo(WidgetCanvas);

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyPlacholder: { fontSize: 12, color: 'rgba(200, 200, 200, 1)' },
  contentContainer: { width: '100%', paddingTop: MARGIN },
  canvasContainer: { width: '100%' },
});
```

### 3. The Widget

#### **File:** [`src/widget/components/DraggableWidget.tsx`](./components/DraggableWidget.tsx)

The complex heart of the system. Wraps content with Reanimated gestures for Dragging, Focusing, and Resizing. Uses shared values and animated styles for 60fps performance.

```tsx
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
  SharedValue,
} from 'react-native-reanimated';
import { Svg, Path, Line } from 'react-native-svg';
import { Widget, WidgetAction } from '../utils/types';

interface DraggableWidgetProps {
  data: Widget;
  dispatch: React.Dispatch<WidgetAction>;
  isEditMode?: boolean;
  isFocused?: boolean;
  isOverlay?: boolean;
  dragY?: SharedValue<number>;
  isDraggingGlobal?: SharedValue<number>;
  scrollY?: SharedValue<number>;
  onDragStart?: (id: string | number) => void;
  onDragEnd?: () => void;
  globalOriginX?: SharedValue<number>;
  globalOriginY?: SharedValue<number>;
  globalTranslationX?: SharedValue<number>;
  globalTranslationY?: SharedValue<number>;
  globalWidth?: SharedValue<number>;
  globalHeight?: SharedValue<number>;
  children?: React.ReactNode;
}

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
}: DraggableWidgetProps) => {
  const shouldHide = isFocused && !isOverlay;

  const x = useSharedValue(data.x);
  const y = useSharedValue(data.y);
  const width = useSharedValue(data.width);
  const height = useSharedValue(data.height);
  const zIndex = useSharedValue(data.zIndex);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  const isDraggingLocal = useSharedValue(false);
  const isResizingLocal = useSharedValue(false);
  const isPendingUpdate = useSharedValue(false);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const resizeStartWidth = useSharedValue(0);
  const resizeStartHeight = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);

  const targetX = useSharedValue(data.x);
  const targetY = useSharedValue(data.y);
  const targetW = useSharedValue(data.width);
  const targetH = useSharedValue(data.height);
  const targetZ = useSharedValue(data.zIndex);

  useEffect(() => {
    targetX.value = data.x;
    targetY.value = data.y;
    targetW.value = data.width;
    targetH.value = data.height;
    targetZ.value = data.zIndex;

    if (isPendingUpdate.value) {
      const isStalePos =
        Math.abs(data.x - dragStartX.value) < 1 &&
        Math.abs(data.y - dragStartY.value) < 1;
      const isStaleSize =
        Math.abs(data.width - resizeStartWidth.value) < 1 &&
        Math.abs(data.height - resizeStartHeight.value) < 1;

      if (!isStalePos || !isStaleSize) {
        isPendingUpdate.value = false;
      }
    }
  }, [data]);

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
      if (current.isDragging) return;
      if (current.isPending) return;
      x.value = withTiming(current.tX);
      y.value = withTiming(current.tY);
      width.value = withTiming(current.tW);
      height.value = withTiming(current.tH);
      zIndex.value = current.tZ;
    },
  );

  useAnimatedReaction(
    () => {
      return {
        isDragging: isDraggingLocal.value,
        scrollYValue: parentScrollY ? parentScrollY.value : 0,
        transX: translationX.value,
        transY: translationY.value,
      };
    },
    (current, previous) => {
      if (current.isDragging) {
        const scrollDelta = current.scrollYValue - dragStartScrollY.value;
        x.value = dragStartX.value + current.transX;
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
        true,
      );
      scale.value = withTiming(1);
    } else {
      rotation.value = withTiming(0);
      if (isOverlay) {
        scale.value = withSpring(1.025);
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
  const handleRemove = () => {
    dispatch({ type: 'REMOVE_WIDGET', payload: data.id });
  };

  const handleDragEndAction = useCallback(
    (id: string | number, xVal: number, yVal: number) => {
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);
      dispatch({ type: 'REORDER_WIDGET', payload: { id, x: xVal, y: yVal } });
    },
    [dispatch],
  );

  const handleResizeEndAction = useCallback(
    (id: string | number, wVal: number, hVal: number) => {
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);
      dispatch({
        type: 'RESIZE_WIDGET',
        payload: { id, width: wVal, height: hVal },
      });
    },
    [dispatch],
  );

  const handleLongPress = (e: any) => {
    if (isEditMode || isOverlay) return;
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
        data: data.data,
        zIndex: data.zIndex,
      },
    });
  };

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
        .activateAfterLongPress(20)
        .onStart(e => {
          runOnJS(bringToFront)();
          if (onDragStart) runOnJS(onDragStart)(data.id);
          if (isDraggingGlobal) isDraggingGlobal.value = 1;

          isDraggingLocal.value = true;
          isPendingUpdate.value = false;
          dragStartX.value = x.value;
          dragStartY.value = y.value;
          resizeStartWidth.value = width.value;
          resizeStartHeight.value = height.value;
          dragStartScrollY.value = parentScrollY ? parentScrollY.value : 0;
          translationX.value = 0;
          translationY.value = 0;

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
          if (globalTranslationX) globalTranslationX.value = e.translationX;
          if (globalTranslationY) globalTranslationY.value = e.translationY;
          if (dragY && isDraggingGlobal) {
            dragY.value = e.absoluteY;
          }
        })
        .onFinalize(() => {
          if (isDraggingGlobal) isDraggingGlobal.value = 0;
          const deltaX = Math.abs(x.value - data.x);
          const deltaY = Math.abs(y.value - data.y);
          const hasMovedSignificantly = deltaX > 5 || deltaY > 5;

          if (hasMovedSignificantly) {
            isPendingUpdate.value = true;
            runOnJS(handleDragEndAction)(data.id, x.value, y.value);
          }
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
    ],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .onStart(() => {
          runOnJS(bringToFront)();
          isResizingLocal.value = true;
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
          isResizingLocal.value = false;
          isPendingUpdate.value = true;
          runOnJS(handleResizeEndAction)(data.id, width.value, height.value);
        }),
    [isEditMode, data.id, data.width, data.height, width, height],
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
      left: isOverlay ? data.x : undefined,
      top: isOverlay ? data.y : undefined,
      width: width.value,
      height: height.value,
      zIndex: isActive ? 9999 : zIndex.value,
      opacity: shouldHide ? 0 : 1,
      elevation: withSpring(isActive ? 10 : 4, { stiffness: 300, damping: 30 }),
    };
  });

  return (
    <Animated.View style={[styles.widgetContainer, animatedStyle]}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.innerContent}>{children}</View>
      </GestureDetector>
      {isEditMode && (
        <TouchableOpacity style={styles.removeBadge} onPress={handleRemove}>
          <Svg width="12" height="2" viewBox="0 0 12 2" fill="none">
            <Line x1="0" y1="1" x2="12" y2="1" stroke="black" strokeWidth="2" />
          </Svg>
        </TouchableOpacity>
      )}
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
      {isEditMode && (
        <GestureDetector gesture={resizeGesture}>
          <View style={styles.resizeHandle}>
            <Svg width="40" height="40" viewBox="0 0 40 40" fill="none">
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    backgroundColor: '#FFF',
    borderRadius: 16,
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
  },
  innerContent: { flex: 1, borderRadius: 16, overflow: 'hidden' },
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
    top: -60,
    alignSelf: 'center',
    width: 160,
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
  menuItemContainer: { paddingVertical: 8, paddingHorizontal: 12 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuText: { fontSize: 14, fontWeight: '500', color: '#333' },
  divider: { height: 1, backgroundColor: '#F0F0F0' },
});
```

### 4. Selected Widget Overlay

#### **File:** [`src/widget/components/SelectedWidgetModal.tsx`](./components/SelectedWidgetModal.tsx)

```tsx
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import React, { memo, useCallback } from 'react';
import LinearGradient from 'react-native-linear-gradient';
import { useWidgetContext } from '../context/WidgetContext';
import DraggableWidget from './DraggableWidget';
import { BlurView } from '@react-native-community/blur';
import { Widget } from '../utils/types';

const SelectedWidgetModal = () => {
  const { state, dispatch } = useWidgetContext();

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_WIDGET', payload: null });
  }, [dispatch]);

  return (
    <Modal
      visible={!!state.focusedWidget}
      transparent={true}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={StyleSheet.absoluteFill}>
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
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        {state.focusedWidget &&
          (() => {
            const original = state.widgets.find(
              w => w.id === state.focusedWidget!.id,
            );
            if (!original) return null;
            const overlayData: Widget = {
              ...original,
              x: state.focusedWidget!.layout.x,
              y: state.focusedWidget!.layout.y,
              width: state.focusedWidget!.layout.width,
              height: state.focusedWidget!.layout.height,
            };
            return (
              <View
                key={`${original.id}_container`}
                style={StyleSheet.absoluteFill}
                pointerEvents="box-none"
              >
                <DraggableWidget
                  key={`${original.id}_overlay`}
                  data={overlayData}
                  dispatch={dispatch}
                  isOverlay={true}
                >
                  <Image
                    source={{ uri: original?.data }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </DraggableWidget>
              </View>
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

### 1. Widget Context

#### **File:** [`src/widget/context/WidgetContext.tsx`](./context/WidgetContext.tsx)

```tsx
import React, {
  createContext,
  useReducer,
  useContext,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  appendWidget,
  reorderWidgets,
  resizeWidgetInList,
  recalculateLayout,
} from '../utils/layoutUtils';
import { COLUMN_WIDTH, ROW_HEIGHT } from '../utils/measure';
import {
  Widget,
  WidgetState,
  WidgetAction,
  WidgetContextType,
} from '../utils/types';

const initialState: WidgetState = {
  widgets: [],
  isEditMode: false,
  focusedWidget: null,
};

const widgetReducer = (
  state: WidgetState,
  action: WidgetAction,
): WidgetState => {
  switch (action.type) {
    case 'ADD_WIDGET':
      return { ...state, widgets: appendWidget(state.widgets, action.payload) };
    case 'REMOVE_WIDGET':
      const remaining = state.widgets.filter(w => w.id !== action.payload);
      return {
        ...state,
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
      return {
        ...state,
        widgets: state.widgets.map(w =>
          w.id === action.payload ? { ...w, zIndex: 999 } : w,
        ),
      };
    case 'TOGGLE_EDIT_MODE':
      return { ...state, isEditMode: action.payload, focusedWidget: null };
    case 'SET_FOCUSED_WIDGET':
      return { ...state, focusedWidget: action.payload };
    case 'SET_WIDGET':
      return { ...state, widgets: action.payload };
    default:
      return state;
  }
};

const WidgetContext = createContext<WidgetContextType | undefined>(undefined);

export const WidgetProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(widgetReducer, initialState);
  const addWidget = useCallback((data: string) => {
    const id = Date.now().toString();
    const offset = Math.random() * 20;
    const newWidget: Widget = {
      id,
      data,
      x: 20 + offset,
      y: 300 + offset,
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
  if (!context)
    throw new Error('useWidgetContext must be used within a WidgetProvider');
  return context;
};
```

---

## Demo Sheets & Controls

### 1. Add Widget Sheet

#### **File:** [`src/widget/demo/AddWidgetSheet.tsx`](./demo/AddWidgetSheet.tsx)

```tsx
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

const AddWidgetSheet = ({
  visible,
  onClose = () => {},
}: {
  visible?: boolean;
  onClose?: () => void;
}) => {
  const { addWidget } = useWidgetContext();
  const handleAddPress = useCallback(
    (type: string) => {
      addWidget(type);
      onClose();
    },
    [addWidget, onClose],
  );
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
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
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
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 24, color: '#000' },
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
  full: { width: '100%', height: '100%' },
});
```

### 2. Edit Controls

#### **File:** [`src/widget/demo/EditControls.tsx`](./demo/EditControls.tsx)

```tsx
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Line, Polyline } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

const EditControls = ({
  onAddPress = () => {},
}: {
  onAddPress?: () => void;
}) => {
  const { state, dispatch } = useWidgetContext();
  const { isEditMode } = useMemo(() => state, [state]);
  const handleDone = useCallback(() => {
    dispatch({ type: 'TOGGLE_EDIT_MODE', payload: false });
  }, [dispatch]);
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
  addBtn: { backgroundColor: '#FCD535' },
  doneBtn: { backgroundColor: '#000000' },
});
```

---

## Core Engine (Utilities)

### 1. Layout Logic

#### **File:** [`src/widget/utils/layoutUtils.ts`](./utils/layoutUtils.ts)

Includes the Skyline/Horizon algorithm for grid placement and Binary Search for reordering.

```tsx
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

export const recalculateLayout = (widgets: Widget[]): Widget[] => {
  if (widgets.length === 0) return [];
  const horizon = new Uint16Array(COLUMNS);
  const layoutWidgets = widgets.map(widget => {
    const { width, height } = widget;
    const { colSpan, rowSpan } = getGridSizeFromDimensions(width, height);
    let bestRow = Infinity;
    let bestCol = 0;
    for (let c = 0; c <= COLUMNS - colSpan; c++) {
      let maxH = 0;
      for (let span = 0; span < colSpan; span++) {
        maxH = Math.max(maxH, horizon[c + span]);
      }
      if (maxH < bestRow) {
        bestRow = maxH;
        bestCol = c;
      }
    }
    for (let span = 0; span < colSpan; span++) {
      horizon[bestCol + span] = bestRow + rowSpan;
    }
    const dim = getDimensionsFromGridSize(colSpan, rowSpan);
    const newX = MARGIN + bestCol * GRID_STEP_X;
    const newY = bestRow * GRID_STEP_Y;
    if (
      widget.x === newX &&
      widget.y === newY &&
      widget.width === dim.width &&
      widget.height === dim.height &&
      (widget as any).gridRow === bestRow &&
      (widget as any).gridCol === bestCol
    )
      return widget;
    return {
      ...widget,
      x: newX,
      y: newY,
      width: dim.width,
      height: dim.height,
      gridRow: bestRow,
      gridCol: bestCol,
    } as Widget;
  });
  layoutWidgets.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  return layoutWidgets;
};

export const reorderWidgets = (
  widgets: Widget[],
  widgetId: string | number,
  newX: number,
  newY: number,
): Widget[] => {
  const widgetIndex = widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return widgets;
  const widget = widgets[widgetIndex];
  const activeCol = Math.round((newX - MARGIN) / GRID_STEP_X);
  const activeRow = Math.round(newY / GRID_STEP_Y);
  const targetSortKey =
    activeRow * COLUMNS + Math.max(0, Math.min(activeCol, COLUMNS - 1));
  const originalRow =
    (widget as any).gridRow ?? Math.round(widget.y / GRID_STEP_Y);
  const originalCol =
    (widget as any).gridCol ?? Math.round((widget.x - MARGIN) / GRID_STEP_X);
  const originalSortKey = originalRow * COLUMNS + originalCol;
  if (targetSortKey === originalSortKey) return widgets;
  const remainingWidgets = [...widgets];
  remainingWidgets.splice(widgetIndex, 1);
  let low = 0,
    high = remainingWidgets.length;
  const isDraggingDown = targetSortKey > originalSortKey;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const w = remainingWidgets[mid];
    const wRow = (w as any).gridRow ?? Math.round(w.y / GRID_STEP_Y);
    const wCol = (w as any).gridCol ?? Math.round((w.x - MARGIN) / GRID_STEP_X);
    const wSortKey = wRow * COLUMNS + wCol;
    if (isDraggingDown) {
      if (wSortKey <= targetSortKey) low = mid + 1;
      else high = mid;
    } else {
      if (wSortKey < targetSortKey) low = mid + 1;
      else high = mid;
    }
  }
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
  return recalculateLayout(
    widgets.map(w =>
      w.id === widgetId ? { ...w, width: newWidth, height: newHeight } : w,
    ),
  );
};

export const calculateTotalContentHeight = (widgets: Widget[]): number => {
  if (widgets.length === 0) return 0;
  let maxY = 0;
  const scanCount = Math.min(widgets.length, COLUMNS + 2);
  for (let i = 0; i < scanCount; i++) {
    const w = widgets[widgets.length - 1 - i];
    if (w.y + w.height > maxY) maxY = w.y + w.height;
  }
  return maxY + MARGIN + 100;
};
```

### 2. Measurements

#### **File:** [`src/widget/utils/measure.ts`](./utils/measure.ts)

```tsx
import { Dimensions } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
export const MARGIN = 15;
export const COLUMNS = 2;
export const COLUMN_WIDTH = (SCREEN_WIDTH - MARGIN * (COLUMNS + 1)) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;
export const GRID_STEP_X = COLUMN_WIDTH + MARGIN;
export const GRID_STEP_Y = ROW_HEIGHT + MARGIN;
```

### 3. Types

#### **File:** [`src/widget/utils/types.ts`](./utils/types.ts)

```tsx
export interface Widget {
  id: string | number;
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}
export interface FocusedWidget {
  id: string | number;
  layout: { x: number; y: number; width: number; height: number };
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
```

---

## Interaction Flow

### 1. Adding a Widget

1.  **User Action**: Taps "Add" button in `EditControls.tsx` or Long Presses empty space in `WidgetCanvas.tsx`.
2.  **UI Response**: `AddWidgetSheet.tsx` modal opens.
3.  **Selection**: User taps an image in the sheet.
4.  **Logic**: `handleAddPress` calls `context.addWidget(uri)`.
5.  **State Update**:
    - `addWidget` in `WidgetContext.tsx` creates a new widget object with random offset.
    - Dispatches `ADD_WIDGET` action.
6.  **Layout Calculation**:
    - Reducer calls `appendWidget` from `layoutUtils.ts`.
    - `recalculateLayout` runs the **Skyline Algorithm** to find the first available slot `(row, col)`.
7.  **Render**: Context updates `state.widgets`, triggering a re-render of `WidgetCanvas`.

### 2. Move / Reorder

1.  **Enter Edit Mode**: Triggered by `TOGGLE_EDIT_MODE`.
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
5.  **State Update**: Dispatches `REORDER_WIDGET` with final coords `(x, y)`.
6.  **Layout Calculation**:
    - Reducer calls `reorderWidgets` in `layoutUtils.ts`.
    - Perks **Binary Search** to find the new index and calls `recalculateLayout` to snap all widgets to grid.

### 3. Resizing

1.  **Resize Start**: User drags the "handle" in Edit Mode.
2.  **Resizing (UI Thread)**: Modifies `width/height` shared values.
3.  **Resize End**: `onEnd` calls `runOnJS(handleResizeEndAction)`.
4.  **State Update**: Dispatches `RESIZE_WIDGET`.
5.  **Layout Calculation**: Calls `recalculateLayout` to reflow the **entire grid**.

### 4. The Draggable Widget

#### **File:** [`src/widget/components/DraggableWidget.tsx`](./components/DraggableWidget.tsx)

```tsx
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
  SharedValue,
} from 'react-native-reanimated';
import { Svg, Path, Line } from 'react-native-svg';
import { Widget, WidgetAction } from '../utils/types';

interface DraggableWidgetProps {
  data: Widget;
  dispatch: React.Dispatch<WidgetAction>;
  isEditMode?: boolean;
  isFocused?: boolean;
  isOverlay?: boolean;
  dragY?: SharedValue<number>;
  isDraggingGlobal?: SharedValue<number>;
  scrollY?: SharedValue<number>;
  onDragStart?: (id: string | number) => void;
  onDragEnd?: () => void;
  globalOriginX?: SharedValue<number>;
  globalOriginY?: SharedValue<number>;
  globalTranslationX?: SharedValue<number>;
  globalTranslationY?: SharedValue<number>;
  globalWidth?: SharedValue<number>;
  globalHeight?: SharedValue<number>;
  children?: React.ReactNode;
}

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
}: DraggableWidgetProps) => {
  const shouldHide = isFocused && !isOverlay;

  const x = useSharedValue(data.x);
  const y = useSharedValue(data.y);
  const width = useSharedValue(data.width);
  const height = useSharedValue(data.height);
  const zIndex = useSharedValue(data.zIndex);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  const isDraggingLocal = useSharedValue(false);
  const isResizingLocal = useSharedValue(false);
  const isPendingUpdate = useSharedValue(false);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const resizeStartWidth = useSharedValue(0);
  const resizeStartHeight = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);

  const targetX = useSharedValue(data.x);
  const targetY = useSharedValue(data.y);
  const targetW = useSharedValue(data.width);
  const targetH = useSharedValue(data.height);
  const targetZ = useSharedValue(data.zIndex);

  useEffect(() => {
    targetX.value = data.x;
    targetY.value = data.y;
    targetW.value = data.width;
    targetH.value = data.height;
    targetZ.value = data.zIndex;

    if (isPendingUpdate.value) {
      const isStalePos =
        Math.abs(data.x - dragStartX.value) < 1 &&
        Math.abs(data.y - dragStartY.value) < 1;
      const isStaleSize =
        Math.abs(data.width - resizeStartWidth.value) < 1 &&
        Math.abs(data.height - resizeStartHeight.value) < 1;

      if (!isStalePos || !isStaleSize) {
        isPendingUpdate.value = false;
      }
    }
  }, [data]);

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
      if (current.isDragging) return;
      if (current.isPending) return;
      x.value = withTiming(current.tX);
      y.value = withTiming(current.tY);
      width.value = withTiming(current.tW);
      height.value = withTiming(current.tH);
      zIndex.value = current.tZ;
    },
  );

  useAnimatedReaction(
    () => {
      return {
        isDragging: isDraggingLocal.value,
        scrollYValue: parentScrollY ? parentScrollY.value : 0,
        transX: translationX.value,
        transY: translationY.value,
      };
    },
    (current, previous) => {
      if (current.isDragging) {
        const scrollDelta = current.scrollYValue - dragStartScrollY.value;
        x.value = dragStartX.value + current.transX;
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
        true,
      );
      scale.value = withTiming(1);
    } else {
      rotation.value = withTiming(0);
      if (isOverlay) {
        scale.value = withSpring(1.025);
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
  const handleRemove = () => {
    dispatch({ type: 'REMOVE_WIDGET', payload: data.id });
  };

  const handleDragEndAction = useCallback(
    (id: string | number, xVal: number, yVal: number) => {
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);
      dispatch({ type: 'REORDER_WIDGET', payload: { id, x: xVal, y: yVal } });
    },
    [dispatch],
  );

  const handleResizeEndAction = useCallback(
    (id: string | number, wVal: number, hVal: number) => {
      setTimeout(() => {
        isPendingUpdate.value = false;
      }, 150);
      dispatch({
        type: 'RESIZE_WIDGET',
        payload: { id, width: wVal, height: hVal },
      });
    },
    [dispatch],
  );

  const handleLongPress = (e: any) => {
    if (isEditMode || isOverlay) return;
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
        data: data.data,
        zIndex: data.zIndex,
      },
    });
  };

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
        .activateAfterLongPress(20)
        .onStart(e => {
          runOnJS(bringToFront)();
          if (onDragStart) runOnJS(onDragStart)(data.id);
          if (isDraggingGlobal) isDraggingGlobal.value = 1;

          isDraggingLocal.value = true;
          isPendingUpdate.value = false;
          dragStartX.value = x.value;
          dragStartY.value = y.value;
          resizeStartWidth.value = width.value;
          resizeStartHeight.value = height.value;
          dragStartScrollY.value = parentScrollY ? parentScrollY.value : 0;
          translationX.value = 0;
          translationY.value = 0;

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
          if (globalTranslationX) globalTranslationX.value = e.translationX;
          if (globalTranslationY) globalTranslationY.value = e.translationY;
          if (dragY && isDraggingGlobal) {
            dragY.value = e.absoluteY;
          }
        })
        .onFinalize(() => {
          if (isDraggingGlobal) isDraggingGlobal.value = 0;
          const deltaX = Math.abs(x.value - data.x);
          const deltaY = Math.abs(y.value - data.y);
          const hasMovedSignificantly = deltaX > 5 || deltaY > 5;

          if (hasMovedSignificantly) {
            isPendingUpdate.value = true;
            runOnJS(handleDragEndAction)(data.id, x.value, y.value);
          }
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
    ],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .onStart(() => {
          runOnJS(bringToFront)();
          isResizingLocal.value = true;
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
          isResizingLocal.value = false;
          isPendingUpdate.value = true;
          runOnJS(handleResizeEndAction)(data.id, width.value, height.value);
        }),
    [isEditMode, data.id, data.width, data.height, width, height],
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
      left: isOverlay ? data.x : undefined,
      top: isOverlay ? data.y : undefined,
      width: width.value,
      height: height.value,
      zIndex: isActive ? 9999 : zIndex.value,
      opacity: shouldHide ? 0 : 1,
      elevation: withSpring(isActive ? 10 : 4, { stiffness: 300, damping: 30 }),
    };
  });

  return (
    <Animated.View style={[styles.widgetContainer, animatedStyle]}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.innerContent}>{children}</View>
      </GestureDetector>
      {isEditMode && (
        <TouchableOpacity style={styles.removeBadge} onPress={handleRemove}>
          <Svg width="12" height="2" viewBox="0 0 12 2" fill="none">
            <Line x1="0" y1="1" x2="12" y2="1" stroke="black" strokeWidth="2" />
          </Svg>
        </TouchableOpacity>
      )}
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
      {isEditMode && (
        <GestureDetector gesture={resizeGesture}>
          <View style={styles.resizeHandle}>
            <Svg width="40" height="40" viewBox="0 0 40 40" fill="none">
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
    backgroundColor: '#FFF',
    borderRadius: 16,
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
  },
  innerContent: { flex: 1, borderRadius: 16, overflow: 'hidden' },
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
    top: -60,
    alignSelf: 'center',
    width: 160,
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
  menuItemContainer: { paddingVertical: 8, paddingHorizontal: 12 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuText: { fontSize: 14, fontWeight: '500', color: '#333' },
  divider: { height: 1, backgroundColor: '#F0F0F0' },
});
```

### 5. Focus Overlay

#### **File:** [`src/widget/components/SelectedWidgetModal.tsx`](./components/SelectedWidgetModal.tsx)

```tsx
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import React, { memo, useCallback } from 'react';
import LinearGradient from 'react-native-linear-gradient';
import { useWidgetContext } from '../context/WidgetContext';
import DraggableWidget from './DraggableWidget';
import { BlurView } from '@react-native-community/blur';
import { Widget } from '../utils/types';

const SelectedWidgetModal = () => {
  const { state, dispatch } = useWidgetContext();

  const handleDismiss = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_WIDGET', payload: null });
  }, [dispatch]);

  return (
    <Modal
      visible={!!state.focusedWidget}
      transparent={true}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={StyleSheet.absoluteFill}>
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
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        {state.focusedWidget &&
          (() => {
            const original = state.widgets.find(
              w => w.id === state.focusedWidget!.id,
            );
            if (!original) return null;
            const overlayData: Widget = {
              ...original,
              x: state.focusedWidget!.layout.x,
              y: state.focusedWidget!.layout.y,
              width: state.focusedWidget!.layout.width,
              height: state.focusedWidget!.layout.height,
            };
            return (
              <View
                key={`${original.id}_container`}
                style={StyleSheet.absoluteFill}
                pointerEvents="box-none"
              >
                <DraggableWidget
                  key={`${original.id}_overlay`}
                  data={overlayData}
                  dispatch={dispatch}
                  isOverlay={true}
                >
                  <Image
                    source={{ uri: original?.data }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </DraggableWidget>
              </View>
            );
          })()}
      </View>
    </Modal>
  );
};
export default memo(SelectedWidgetModal);
```

### 6. Add Widget Sheet

#### **File:** [`src/widget/demo/AddWidgetSheet.tsx`](./demo/AddWidgetSheet.tsx)

```tsx
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

const AddWidgetSheet = ({
  visible = true,
  onClose = () => {},
}: {
  visible?: boolean;
  onClose?: () => void;
}) => {
  const { addWidget } = useWidgetContext();
  const handleAddPress = useCallback(
    (type: string) => {
      addWidget(type);
      onClose();
    },
    [addWidget, onClose],
  );
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
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
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
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 24, color: '#000' },
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
  full: { width: '100%', height: '100%' },
});
```

### 7. Edit Controls

#### **File:** [`src/widget/demo/EditControls.tsx`](./demo/EditControls.tsx)

```tsx
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Line, Polyline } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

const EditControls = ({
  onAddPress = () => {},
}: {
  onAddPress?: () => void;
}) => {
  const { state, dispatch } = useWidgetContext();
  const { isEditMode } = useMemo(() => state, [state]);
  const handleDone = useCallback(() => {
    dispatch({ type: 'TOGGLE_EDIT_MODE', payload: false });
  }, [dispatch]);
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
  addBtn: { backgroundColor: '#FCD535' },
  doneBtn: { backgroundColor: '#000000' },
});
```

### 8. Layout Logic (Skyline Algorithm)

#### **File:** [`src/widget/utils/layoutUtils.ts`](./utils/layoutUtils.ts)

```tsx
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

export const recalculateLayout = (widgets: Widget[]): Widget[] => {
  if (widgets.length === 0) return [];
  const horizon = new Uint16Array(COLUMNS);
  const layoutWidgets = widgets.map(widget => {
    const { width, height } = widget;
    const { colSpan, rowSpan } = getGridSizeFromDimensions(width, height);
    let bestRow = Infinity;
    let bestCol = 0;
    for (let c = 0; c <= COLUMNS - colSpan; c++) {
      let maxH = 0;
      for (let span = 0; span < colSpan; span++) {
        maxH = Math.max(maxH, horizon[c + span]);
      }
      if (maxH < bestRow) {
        bestRow = maxH;
        bestCol = c;
      }
    }
    for (let span = 0; span < colSpan; span++) {
      horizon[bestCol + span] = bestRow + rowSpan;
    }
    const dim = getDimensionsFromGridSize(colSpan, rowSpan);
    const newX = MARGIN + bestCol * GRID_STEP_X;
    const newY = bestRow * GRID_STEP_Y;
    if (
      widget.x === newX &&
      widget.y === newY &&
      widget.width === dim.width &&
      widget.height === dim.height &&
      (widget as any).gridRow === bestRow &&
      (widget as any).gridCol === bestCol
    )
      return widget;
    return {
      ...widget,
      x: newX,
      y: newY,
      width: dim.width,
      height: dim.height,
      gridRow: bestRow,
      gridCol: bestCol,
    } as Widget;
  });
  layoutWidgets.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  return layoutWidgets;
};

export const reorderWidgets = (
  widgets: Widget[],
  widgetId: string | number,
  newX: number,
  newY: number,
): Widget[] => {
  const widgetIndex = widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return widgets;
  const widget = widgets[widgetIndex];
  const activeCol = Math.round((newX - MARGIN) / GRID_STEP_X);
  const activeRow = Math.round(newY / GRID_STEP_Y);
  const targetSortKey =
    activeRow * COLUMNS + Math.max(0, Math.min(activeCol, COLUMNS - 1));
  const originalRow =
    (widget as any).gridRow ?? Math.round(widget.y / GRID_STEP_Y);
  const originalCol =
    (widget as any).gridCol ?? Math.round((widget.x - MARGIN) / GRID_STEP_X);
  const originalSortKey = originalRow * COLUMNS + originalCol;
  if (targetSortKey === originalSortKey) return widgets;
  const remainingWidgets = [...widgets];
  remainingWidgets.splice(widgetIndex, 1);
  let low = 0,
    high = remainingWidgets.length;
  const isDraggingDown = targetSortKey > originalSortKey;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const w = remainingWidgets[mid];
    const wRow = (w as any).gridRow ?? Math.round(w.y / GRID_STEP_Y);
    const wCol = (w as any).gridCol ?? Math.round((w.x - MARGIN) / GRID_STEP_X);
    const wSortKey = wRow * COLUMNS + wCol;
    if (isDraggingDown) {
      if (wSortKey <= targetSortKey) low = mid + 1;
      else high = mid;
    } else {
      if (wSortKey < targetSortKey) low = mid + 1;
      else high = mid;
    }
  }
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
  return recalculateLayout(
    widgets.map(w =>
      w.id === widgetId ? { ...w, width: newWidth, height: newHeight } : w,
    ),
  );
};

export const calculateTotalContentHeight = (widgets: Widget[]): number => {
  if (widgets.length === 0) return 0;
  let maxY = 0;
  const scanCount = Math.min(widgets.length, COLUMNS + 2);
  for (let i = 0; i < scanCount; i++) {
    const w = widgets[widgets.length - 1 - i];
    if (w.y + w.height > maxY) maxY = w.y + w.height;
  }
  return maxY + MARGIN + 100;
};
```

### 9. Grid Measurements

#### **File:** [`src/widget/utils/measure.ts`](./utils/measure.ts)

```tsx
import { Dimensions } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
export const MARGIN = 15;
export const COLUMNS = 2;
export const COLUMN_WIDTH = (SCREEN_WIDTH - MARGIN * (COLUMNS + 1)) / COLUMNS;
export const ROW_HEIGHT = COLUMN_WIDTH * 1.1;
export const GRID_STEP_X = COLUMN_WIDTH + MARGIN;
export const GRID_STEP_Y = ROW_HEIGHT + MARGIN;
```

### 10. TypeScript Definitions

#### **File:** [`src/widget/utils/types.ts`](./utils/types.ts)

```tsx
export interface Widget {
  id: string | number;
  data: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}
export interface FocusedWidget {
  id: string | number;
  layout: { x: number; y: number; width: number; height: number };
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
```

---

## Interaction Flow

### 1. Adding a Widget

1.  **User Action**: Taps "Add" button in `EditControls.tsx` or Long Presses empty space in `WidgetCanvas.tsx`.
2.  **UI Response**: `AddWidgetSheet.tsx` modal opens.
3.  **Selection**: User taps an image in the sheet.
4.  **Logic**: `handleAddPress` calls `context.addWidget(uri)`.
5.  **State Update**: `addWidget` in `WidgetContext.tsx` creates a new widget and dispatches `ADD_WIDGET`.
6.  **Layout Calculation**: Reducer calls `appendWidget` from `layoutUtils.ts` (Skyline Algorithm).
7.  **Render**: Context updates, triggering a re-render of `WidgetCanvas`.

### 2. Move / Reorder

1.  **Enter Edit Mode**: Triggered by `TOGGLE_EDIT_MODE`.
2.  **Drag Start**: User drags a `DraggableWidget`. `PanGesture` activates.
3.  **Dragging (UI Thread)**: `onUpdate` modifies `translationX/Y` shared values for 60fps performance.
4.  **Drag End**: `onFinalize` calls `runOnJS(handleDragEndAction)`.
5.  **State Update**: Dispatches `REORDER_WIDGET`.
6.  **Layout Calculation**: Reducer calls `reorderWidgets` (Binary Search + Skyline).

### 3. Resizing

1.  **Resize Start**: User drags the "handle" in Edit Mode.
2.  **Resizing (UI Thread)**: Modifies `width/height` shared values.
3.  **Resize End**: `onEnd` calls `runOnJS(handleResizeEndAction)`.
4.  **State Update**: Dispatches `RESIZE_WIDGET`.
5.  **Layout Calculation**: Recalculates entire grid reflow.
