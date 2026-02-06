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
                                dispatch={dispatch}
                                scrollY={null}
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