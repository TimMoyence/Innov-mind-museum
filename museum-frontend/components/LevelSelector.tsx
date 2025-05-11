import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { componentStyles } from "../../museum-frontend/app/styles/componentStyles";

interface LevelSelectorProps {
  levels: string[];
  selectedLevel: string;
  onSelectLevel: (level: string) => void;
}

export const LevelSelector: React.FC<LevelSelectorProps> = ({
  levels,
  selectedLevel,
  onSelectLevel,
}) => {
  return (
    <View style={componentStyles.levelButtons}>
      {levels.map((level) => (
        <TouchableOpacity
          key={level}
          style={[
            componentStyles.levelButton,
            selectedLevel === level && componentStyles.levelButtonSelected,
          ]}
          onPress={() => onSelectLevel(level)}
        >
          <Text
            style={[
              componentStyles.levelButtonText,
              selectedLevel === level &&
                componentStyles.levelButtonTextSelected,
            ]}
          >
            {level}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
