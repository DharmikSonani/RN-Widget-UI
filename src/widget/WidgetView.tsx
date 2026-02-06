import React from 'react'
import { StyleSheet } from 'react-native';
import { WidgetProvider } from './context/WidgetContext';
import WidgetCanvas from './components/WidgetCanvas';
import { GestureHandlerRootView } from 'react-native-gesture-handler'

const WidgetView = () => {
    return (
        <GestureHandlerRootView style={styles.container}>
            <WidgetProvider>
                <WidgetCanvas />
            </WidgetProvider>
        </GestureHandlerRootView>
    )
}

export default WidgetView

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
})
