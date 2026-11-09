import { Text, type StyleProp, type TextStyle } from 'react-native';

interface TextLinesProps {
  lines: readonly string[];
  style: StyleProp<TextStyle>;
  prefix?: string;
}

export const TextLines = ({ lines, style, prefix }: TextLinesProps) => (
  <>
    {lines.map((line) => (
      <Text key={line} style={style}>
        {prefix}
        {line}
      </Text>
    ))}
  </>
);
