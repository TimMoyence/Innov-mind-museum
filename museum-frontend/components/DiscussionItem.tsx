import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { componentStyles } from '../../museum-frontend/app/styles/componentStyles';

interface DiscussionItemProps {
  imageUrl: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  tags: string[];
  onPress?: () => void;
}

export const DiscussionItem: React.FC<DiscussionItemProps> = ({
  imageUrl,
  title,
  location,
  time,
  participants,
  tags,
  onPress,
}) => {
  return (
    <TouchableOpacity style={componentStyles.discussionItem} onPress={onPress}>
      <View style={componentStyles.discussionImageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={componentStyles.discussionImage}
        />
        <View style={componentStyles.discussionTags}>
          {tags.map((tag, index) => (
            <View key={index} style={componentStyles.discussionTag}>
              <Text style={componentStyles.discussionTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={componentStyles.discussionContent}>
        <Text style={componentStyles.discussionTitle}>{title}</Text>
        <Text style={componentStyles.discussionDescription}>{location}</Text>
        <View style={componentStyles.discussionMeta}>
          <Text style={componentStyles.discussionTime}>{time}</Text>
          <Text style={componentStyles.discussionParticipants}>
            {participants} participants
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
