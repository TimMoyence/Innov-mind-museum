import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface RadioButtonProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function RadioButton({ label, selected, onSelect }: RadioButtonProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onSelect}>
      <View style={styles.radio}>
        {selected && <View style={styles.selected} />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  radio: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selected: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  label: {
    fontSize: 16,
    color: '#1a1a1a',
  },
});