import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
} from 'react-native';
import { useWidgetContext } from '../context/WidgetContext';

const DATA = [
  `https://wallpapers.com/images/featured/4k-tech-ulcajgzzc25jlrgi.jpg`,
  `https://images.unsplash.com/photo-1724391114112-c83ad59f1d5f?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Ym13JTIwd2FsbHBhcGVyfGVufDB8fDB8fHww`,
  `https://www.hdcarwallpapers.com/walls/bugatti_chiron_super_sport_golden_era_4k-HD.jpg`,
  `https://cloudinary-marketing-res.cloudinary.com/image/upload/w_1300/q_auto/f_auto/hiking_dog_mountain`,
  `https://cdn.pixabay.com/photo/2018/01/14/23/12/nature-3082832_1280.jpg`,
  `https://images.pexels.com/photos/19727174/pexels-photo-19727174.jpeg?cs=srgb&dl=pexels-ryank-19727174.jpg&fm=jpg`,
  `https://cdn.wallpapersafari.com/93/66/hvpRyg.jpg`,
  `https://images5.alphacoders.com/139/thumb-1920-1395234.jpg`,
  `https://4kwallpapers.com/images/wallpapers/assassins-creed-3840x2160-16786.jpeg`,
  `https://images.hdqwalls.com/wallpapers/assassins-creed-game-4k-h8.jpg`,
];

interface AddWidgetSheetProps {
  visible?: boolean;
  onClose?: () => void;
}

const AddWidgetSheet = ({
  visible = true,
  onClose = () => {},
}: AddWidgetSheetProps) => {
  const { addWidget } = useWidgetContext();

  const handleAddPress = useCallback(
    (type: string) => {
      addWidget(type);
      onClose();
    },
    [addWidget, onClose],
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlay}
            onPress={onClose}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Add Widget</Text>

            <ScrollView
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {DATA.map((uri, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.gridItem}
                  onPress={() => handleAddPress(uri)}
                >
                  <Image
                    source={{ uri: uri }}
                    style={styles.full}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <View style={styles.backdrop} />
    </>
  );
};

export default memo(AddWidgetSheet);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
    top: -100,
    bottom: -100,
    left: -100,
    right: -100,
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 0,
    maxHeight: '60%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#CCC',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 9,
  },
  gridItem: {
    width: '48%',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
    color: '#333',
    height: 140,
    justifyContent: 'center',
    marginBottom: 15,
    borderRadius: 15,
    overflow: 'hidden',
  },
  full: {
    width: '100%',
    height: '100%',
  },
});
