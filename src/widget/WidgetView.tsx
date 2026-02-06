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
