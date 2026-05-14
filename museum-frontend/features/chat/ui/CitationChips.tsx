import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChatUiMessageMetadata } from '@/features/chat/application/chatSessionLogic.pure';
import {
  selectChipModelsForMessage,
  type CitationChipModel,
  type CitationFamily,
  type ConfidenceLevel,
} from '@/features/chat/application/citations';
import { logCitationResolution } from '@/features/chat/application/citation-telemetry';
import { CitationChip } from '@/features/chat/ui/CitationChip';
import { semantic, space } from '@/shared/ui/tokens';

interface CitationChipsProps {
  readonly metadata: ChatUiMessageMetadata | null | undefined;
  readonly onProvenancePress?: (family: CitationFamily) => void;
  readonly onConfidencePress?: (level: ConfidenceLevel) => void;
}

/**
 * A6 — Citation chips cluster rendered at the bottom of every non-streaming
 * assistant bubble. Combines one confidence chip + 0..3 provenance chips,
 * deduplicated by UI family.
 *
 * Spec: `docs/chat-ux-refonte/specs/A6.md` §1.1 (R1-R7), §1.4 (R19-R21).
 *
 * Empty / undefined `sources` → renders the `'ai-knowledge'` chip (R4) to
 * honour UFR-013 doctrine (surface "AI-only" responses instead of pretending
 * the answer is sourced).
 *
 * Failure mode (R21) : `selectChipModelsForMessage` is pure and shouldn't
 * throw, but a try/catch defensive guard returns `null` rather than crashing
 * the bubble if it ever does.
 */
export const CitationChips = React.memo(
  ({ metadata, onProvenancePress, onConfidencePress }: CitationChipsProps) => {
    const models: CitationChipModel[] = useMemo(() => {
      try {
        return selectChipModelsForMessage(metadata);
      } catch {
        return [];
      }
    }, [metadata]);

    const hasSources = (metadata?.sources?.length ?? 0) > 0;

    useEffect(() => {
      logCitationResolution(models, hasSources);
    }, [models, hasSources]);

    if (models.length === 0) return null;

    return (
      <View style={styles.row}>
        {models.map((m) => {
          if (m.kind === 'confidence') {
            const handle = onConfidencePress
              ? () => {
                  onConfidencePress(m.level);
                }
              : undefined;
            return <CitationChip key={`c-${m.level}`} model={m} onPress={handle} />;
          }
          const handle = onProvenancePress
            ? () => {
                onProvenancePress(m.family);
              }
            : undefined;
          return <CitationChip key={`p-${m.family}`} model={m} onPress={handle} />;
        })}
      </View>
    );
  },
);
CitationChips.displayName = 'CitationChips';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: semantic.chat.gapSmall,
    columnGap: space['1'],
    rowGap: space['1'],
  },
});
