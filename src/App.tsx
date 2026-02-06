import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import WidgetView from './widget/WidgetView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const App = () => {
    const topSpace = useSafeAreaInsets().top;

    return (
        <View style={styles.container}>
            <StatusBar
                barStyle={'dark-content'}
                translucent
            />

            <View style={[styles.headerContainer, { paddingTop: topSpace + 10 }]}>
                <Text style={styles.headerTitle} numberOfLines={1}>{`Widgets`}</Text>
            </View>

            <WidgetView />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 1)',
    },
    headerContainer: {
        alignItems: 'center',
        width: '100%',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: 'rgba(200, 200, 200, 1)',
    },
    headerTitle: {
        fontSize: 20,
        color: 'rgba(0, 0, 0, 1)',
        fontWeight: 'bold',
    },
});

export default App;
