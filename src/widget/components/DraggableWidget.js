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

    // We need to pass gestures specifically to views, or compose them carefully
    // Since resize is on a specific child view (handle), we don't strictly need to race it with drag 
    // IF the handle is outside or on top of the drag area.
    // However, Gesture Detector usually wraps the root.
    // Better approach: Wrap the Handle in its OWN GestureDetector.
    // Race tap with drag? No, drag is only in edit mode.
    // So just compose based on mode validity.
    // If isEditMode, Drag. If !isEditMode, Tap.
    // Composition
    const composedGesture = isOverlay ? overlayGesture : Gesture.Exclusive(dragGesture, longPressGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: isOverlay ? 0 : x.value }, // Overlay is absolute positioned by parent container or updated 
            // Wait, Modal renders View at absoluteFill. 
            // We need to position this widget at specific coords.
            // If isOverlay, we shouldn't use sharedValue x/y for dragging.
            // We should use static data.x/y passed in props?
            // Actually, for animation consistency, let's just stick to props for Overlay.
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
        // Android Shadow Fix: Elevation works best when background is set.
        // We set it on the container but rely on child content for visible shape?
        // Actually, we must set it mostly for the lift effect. 
        // If we set bg color here, it might overlap? 
        // Let's try to ensure elevation is dynamic.
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
