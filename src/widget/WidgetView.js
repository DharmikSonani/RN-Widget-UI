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