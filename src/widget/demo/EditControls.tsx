import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Svg, Line, Polyline } from 'react-native-svg';
import { useWidgetContext } from '../context/WidgetContext';

interface EditControlsProps {
  onAddPress?: () => void;
}

const EditControls = ({ onAddPress = () => {} }: EditControlsProps) => {
  const { state, dispatch } = useWidgetContext();
  const { isEditMode } = useMemo(() => state, [state]);

  const handleDone = useCallback(() => {
    dispatch({ type: 'TOGGLE_EDIT_MODE', payload: false });
  }, [dispatch]);

  if (!isEditMode) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, styles.addBtn]}
        onPress={onAddPress}
      >
        <Svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000"
          strokeWidth="3"
        >
          <Line x1="12" y1="5" x2="12" y2="19" />
          <Line x1="5" y1="12" x2="19" y2="12" />
        </Svg>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.doneBtn]}
        onPress={handleDone}
      >
        <Svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFF"
          strokeWidth="3"
        >
          <Polyline points="20 6 9 17 4 12" />
        </Svg>
      </TouchableOpacity>
    </View>
  );
};

export default memo(EditControls);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    gap: 50,
    alignSelf: 'center',
    borderRadius: 16,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  addBtn: {
    backgroundColor: '#FCD535', // Yellow
  },
  doneBtn: {
    backgroundColor: '#000000', // Black
  },
});
