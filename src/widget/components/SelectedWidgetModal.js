import { Image, Modal, StyleSheet, TouchableOpacity, View, Text } from 'react-native'
import { Svg, Path } from 'react-native-svg';
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
                            <View key={`${original.id}_container`} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                                {/* The Widget */}
                                <DraggableWidget
                                    key={`${original.id}_overlay`}
                                    data={overlayData}
                                    dispatch={dispatch}
                                    scrollY={null}
                                >
                                    <Image
                                        source={{ uri: original?.data }}
                                        style={{ width: '100%', height: '100%', }}
                                        resizeMode='cover'
                                    />
                                </DraggableWidget>

                                {/* Context Menu - Positioned Relative to Widget */}
                                <View style={[
                                    styles.contextMenu,
                                    {
                                        left: overlayData.x + (overlayData.width / 2) - 90, // Center (180/2)
                                        top: overlayData.y - 70 // Above widget
                                    }
                                ]}>
                                    <View style={styles.menuItemContainer}>
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => {
                                                handleDismiss();
                                                dispatch({ type: 'REMOVE_WIDGET', payload: original.id });
                                            }}
                                        >
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
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => {
                                                handleDismiss();
                                                dispatch({ type: 'TOGGLE_EDIT_MODE', payload: true });
                                            }}
                                        >
                                            <Text style={styles.menuText}>{`Edit Page`}</Text>
                                            <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </Svg>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
            </View>
        </Modal>
    )
}

export default memo(SelectedWidgetModal)

const styles = StyleSheet.create({
    contextMenu: {
        position: 'absolute',
        width: 180,
        backgroundColor: '#FFF',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 10000000,
        paddingVertical: 4,
    },
    menuItemContainer: {
        paddingVertical: 12,
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
})