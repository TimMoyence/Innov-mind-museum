import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

export const useKeyboardVisible = (): boolean => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, () => {
      setVisible(true);
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => {
      setVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
};
