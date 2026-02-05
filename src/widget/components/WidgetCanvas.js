import React, { memo, useCallback, useState } from 'react'
import {
    StyleSheet,
    View,
    ScrollView,
    Text,
    Image,
} from 'react-native';
import { useWidgetContext } from '../context/WidgetContext';
import { calculateTotalContentHeight } from '../utils/layoutUtils';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import EditControls from '../demo/EditControls';
import AddWidgetSheet from '../demo/AddWidgetSheet';
import DraggableWidget from './DraggableWidget';
import SelectedWidgetModal from './SelectedWidgetModal';
import { MARGIN } from '../utils/measure';

const WidgetCanvas = () => {
    const { state, dispatch } = useWidgetContext();
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const contentHeight = calculateTotalContentHeight(state.widgets);

    const longPressEmpty = Gesture.LongPress()
        .minDuration(500)
        .onStart(() => {
            runOnJS(dispatch)({ type: 'TOGGLE_EDIT_MODE', payload: true });
        });

    const handleAddPress = useCallback(() => { setIsSheetOpen(true) }, [])

    const handleSheetClose = useCallback(() => { setIsSheetOpen(false) }, [])

    return (
        <View style={styles.container}>
            {/* Widget Canvas */}
            {
                state.widgets.length === 0 ?
                    <GestureDetector gesture={longPressEmpty}>
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyPlacholder} numberOfLines={1}>
                                {`Long press to add widgets`}
                            </Text>
                        </View>
                    </GestureDetector>
                    :
                    <ScrollView contentContainerStyle={[styles.contentContainer]}>
                        {/* Widget Layer */}
                        <View style={[styles.canvasContainer, { height: contentHeight }]}>
                            {/* Render regular widgets */}
                            {state?.widgets?.map(widget => (
                                <DraggableWidget key={widget.id} data={widget}>
                                    {/* Replace with Your Component */}
                                    <Image
                                        source={{ uri: widget?.data }}
                                        style={{ width: '100%', height: '100%', }}
                                        resizeMode='cover'
                                    />
                                </DraggableWidget>
                            ))}
                        </View>
                    </ScrollView>
            }

            <SelectedWidgetModal />

            {/* Edit Mode Controls */}
            <EditControls onAddPress={handleAddPress} />

            {/* Bottom Sheet */}
            {isSheetOpen && <AddWidgetSheet onClose={handleSheetClose} />}
        </View>
    )
}

export default memo(WidgetCanvas)

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
})