import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

import { legalScreenStyles } from './legal.styles';

interface LegalSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

const styles = StyleSheet.create(legalScreenStyles);

export const LegalSections = ({ sections }: { sections: readonly LegalSection[] }) => {
  const { theme } = useTheme();

  return (
    <>
      {sections.map((section) => (
        <GlassCard key={section.id} style={styles.sectionCard} intensity={52}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{section.title}</Text>
          <View style={styles.paragraphGroup}>
            {section.paragraphs.map((paragraph, index) => (
              <Text
                key={`${section.id}-${String(index)}`}
                style={[styles.paragraph, { color: theme.textSecondary }]}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        </GlassCard>
      ))}
    </>
  );
};
