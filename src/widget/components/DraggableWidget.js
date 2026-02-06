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
    children
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
            const isStalePos = (Math.abs(data.x - dragStartX.value) < 1 && Math.abs(data.y - dragStartY.value) < 1);
            const isStaleSize = (Math.abs(data.width - resizeStartWidth.value) < 1 && Math.abs(data.height - resizeStartHeight.value) < 1);

            // If data is NOT stale (it changed), we can clear pending immediately.
            // If it IS stale, we wait for timeout (handled by JS callback).
            if (!isStalePos || !isStaleSize) {
                isPendingUpdate.value = false;
            }
        }
    }, [data, targetX, targetY, targetW, targetH, targetZ, isPendingUpdate, dragStartX, dragStartY, resizeStartWidth, resizeStartHeight]);

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
                tZ: targetZ.value
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
        }
    );

    // Reaction to update Y position based on Scroll Delta
    useAnimatedReaction(
        () => {
            return {
                isDragging: isDraggingLocal.value,
                // Safely access parentScrollY.value, default to 0 if prop is undefined/null
                scrollYValue: parentScrollY ? parentScrollY.value : 0,
                transX: translationX.value,
                transY: translationY.value
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
        }
    );

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

    // Safe callback for drag end logic (timeout + dispatch) on JS thread
    const handleDragEndAction = useCallback((id, xVal, yVal) => {
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
                y: yVal
            }
        });
    }, [dispatch, isPendingUpdate]);

    const handleResizeEndAction = useCallback((id, wVal, hVal) => {
        // Safety timeout to reset pending state
        setTimeout(() => {
            isPendingUpdate.value = false;
        }, 150);

        dispatch({
            type: 'RESIZE_WIDGET',
            payload: {
                id: id,
                width: wVal,
                height: hVal
            }
        });
    }, [dispatch, isPendingUpdate]);

    const handleLongPress = (e) => {
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
                    height: data.height
                }
            }
        });
    };

    // --- Gestures ---

    // Memoize gestures to prevent cancellation on re-render
    const longPressGesture = useMemo(() => Gesture.LongPress()
        .minDuration(500)
        .enabled(!isEditMode && !isOverlay)
        .onStart((e) => {
            runOnJS(handleLongPress)(e);
        }), [isEditMode, isOverlay, handleLongPress]);

    const overlayGesture = useMemo(() => Gesture.Tap().enabled(isOverlay), [isOverlay]);

    const dragGesture = useMemo(() => Gesture.Pan()
        .enabled(isEditMode)
        .activateAfterLongPress(20) // Prevent accidental drags when scrolling
        .onStart((e) => {
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
        .onUpdate((e) => {
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
        }), [isEditMode, isDraggingGlobal, data.id, data.x, data.y, x, y, dragY, parentScrollY, onDragStart, onDragEnd, dispatch, bringToFront, globalOriginX, globalOriginY, globalTranslationX, globalTranslationY, handleDragEndAction]);

    const resizeGesture = useMemo(() => Gesture.Pan()
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
        .onUpdate((e) => {
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
        }), [isEditMode, data.id, data.width, data.height, width, height, dispatch, bringToFront, dragStartX, dragStartY, resizeStartWidth, resizeStartHeight, x, y, handleResizeEndAction]);

    const composedGesture = useMemo(() => isOverlay ? overlayGesture : Gesture.Exclusive(dragGesture, longPressGesture),
        [isOverlay, overlayGesture, dragGesture, longPressGesture]);

    const animatedStyle = useAnimatedStyle(() => {
        const isActive = isDraggingLocal.value || isResizingLocal.value || isOverlay || isPendingUpdate.value;
        return {
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
            // Force high z-index locally when dragging/pending to prevent flicker/clipping
            zIndex: isActive ? 9999 : zIndex.value,
            opacity: shouldHide ? 0 : 1, // Hide original

            // Dynamic elevation with spring for smoother non-flickering transition
            elevation: withSpring(isActive ? 10 : 4, { stiffness: 300, damping: 30 }),
        };
    });

    return (
        <Animated.View style={[styles.widgetContainer, animatedStyle]}>
            <GestureDetector gesture={composedGesture}>
                {/* Visual Jiggle in Edit Mode is handled by rotation */}
                <View style={styles.innerContent}>
                    {children}
                </View>
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
        shadowRadius: 5,   // Reduced from 12

        // Android Elevation requires backgroundColor on the same view
        elevation: 4,      // Reduced from 8
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
