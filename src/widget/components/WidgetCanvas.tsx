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
// Configurable buffer: 1.0 means 1 screen height above and 1 screen height below.
// Total rendered height = Buffer + Screen + Buffer = 1 + 1 + 1 = 3x Screen Height.
const VISIBILITY_BUFFER = SCREEN_HEIGHT * 1.0;

const WidgetCanvas = () => {
  const { state, dispatch } = useWidgetContext();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Virtualization State
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const scrollY = useSharedValue(0);

  const contentHeight = calculateTotalContentHeight(state.widgets);

  // Use SharedValue for widgets array to safely access from worklets
  const widgetsShared = useSharedValue(state.widgets);
  useEffect(() => {
    widgetsShared.value = state.widgets;
  }, [state.widgets]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();

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

  // Auto-Scroll Logic - JS Thread Loop for Stability
  const rafId = useRef<number | null>(null);
  const containerRef = useRef<View>(null);
  const containerLayout = useSharedValue({ top: 0, bottom: SCREEN_HEIGHT });

  const handleDragStart = useCallback(
    (id: string | number) => {
      setDraggingId(id);
      // Measure container on drag start to get accurate boundaries
      if (containerRef.current) {
        containerRef.current.measure((x, y, width, height, pageX, pageY) => {
          containerLayout.value = { top: pageY, bottom: pageY + height };
        });
      }
    },
    [containerLayout],
  );

  // Worklet to perform scroll on UI Thread (Smoother execution on Android)
  const scrollToPosition = (y: number) => {
    'worklet';
    scrollTo(scrollRef, 0, y, false);
  };

  const performAutoScroll = useCallback(() => {
    const SCROLL_THRESHOLD = 150;
    const BASE_SPEED = 5;
    const MAX_SPEED = 20;

    // Read shared values synchronously on JS thread (safe for read)
    const currentDragY = dragY.value;
    const currentScrollY = scrollY.value;
    const currentIsDragging = isDragging.value;

    if (currentIsDragging !== 1) return;

    let speed = 0;

    // Fallback boundaries if measurement fails (0 and Screen Height)
    // This ensures scrolling works even if measure is async or failed
    const layout = containerLayout.value;
    const topEdge = layout.top || 0;
    const bottomEdge =
      layout.bottom && layout.bottom > 0 ? layout.bottom : SCREEN_HEIGHT;

    // Bottom Edge
    // Check if drag is within threshold distance of value bottom edge
    if (currentDragY > bottomEdge - SCROLL_THRESHOLD) {
      const ratio =
        (currentDragY - (bottomEdge - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
      speed = BASE_SPEED + ratio * (MAX_SPEED - BASE_SPEED);

      // Dispatch directly to UI thread for smooth native scrolling
      runOnUI(scrollToPosition)(currentScrollY + speed);
    }
    // Top Edge
    // Check if drag is within threshold distance of top edge
    else if (currentDragY < topEdge + SCROLL_THRESHOLD && currentScrollY > 0) {
      const ratio =
        (topEdge + SCROLL_THRESHOLD - currentDragY) / SCROLL_THRESHOLD;
      speed = BASE_SPEED + ratio * (MAX_SPEED - BASE_SPEED);

      // Dispatch directly to UI thread
      runOnUI(scrollToPosition)(Math.max(0, currentScrollY - speed));
    }

    // Loop MUST continue as long as we are dragging, even if not currently scrolling
    // This ensures that if the user drags back to the edge, it catches it.
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

  // Monitor drag state changes to start/stop loop
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

  const handleDragEnd = useCallback(() => setDraggingId(null), []);
  const handleAddPress = useCallback(() => {
    setIsSheetOpen(true);
  }, []);

  const handleSheetClose = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  return (
    <View ref={containerRef} style={styles.container}>
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
