/**
 * W3 Cluster C — Museum picker screen.
 *
 * Three sections:
 *   1. Debounced search input (300 ms) calling `museumApi.searchMuseums`.
 *   2. Horizontal favourites strip (read from `museum.favourites` storage).
 *   3. Vertical FlatList of nearby museums (BE pre-sorts by distance asc).
 *
 * Tap on any row → persists to favourites + calls `onSelect(museumId)`.
 *
 * Spec : `team-state/2026-05-17-w3-geo-walk-intra/spec.md` R15-R17.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useLocation } from '@/features/museum/application/useLocation';
import { addFavourite, getFavourites } from '@/features/museum/infrastructure/favourites';
import {
  museumApi,
  type MuseumDirectoryEntry,
  type MuseumSearchEntry,
} from '@/features/museum/infrastructure/museumApi';
import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

/** ms the search input must remain idle before firing the BE call. */
const SEARCH_DEBOUNCE_MS = 300;
/** radius (meters) for the nearby / search-by-coords API call. */
const SEARCH_RADIUS_M = 5_000;

interface MuseumPickerScreenProps {
  /**
   * Invoked when the user taps a museum row in any section. The picker
   * persists the chosen ID to favourites *before* calling this callback so
   * the next mount surfaces the entry in the favourites strip.
   */
  onSelect: (museum: { id: number; name: string }) => void;
  /** Invoked when the user dismisses the picker via the close (X) button. */
  onClose?: () => void;
}

/** Narrow row shape consumed by the list / strip — null IDs filtered upstream. */
interface PickableMuseum {
  readonly id: number;
  readonly name: string;
  readonly address: string | null;
  readonly distance: number | null;
}

function toPickable(entry: MuseumSearchEntry | MuseumDirectoryEntry): PickableMuseum | null {
  const id = 'id' in entry ? entry.id : null;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null;
  const name = entry.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  const address = 'address' in entry && typeof entry.address === 'string' ? entry.address : null;
  const distance =
    'distance' in entry && typeof entry.distance === 'number' ? entry.distance : null;
  return { id, name, address, distance };
}

export function MuseumPickerScreen({ onSelect, onClose }: MuseumPickerScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { latitude, longitude, status } = useLocation();

  const [query, setQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PickableMuseum[]>([]);
  const [nearby, setNearby] = useState<PickableMuseum[]>([]);
  const [favouriteIds, setFavouriteIds] = useState<number[]>([]);
  const [favouriteEntries, setFavouriteEntries] = useState<PickableMuseum[]>([]);

  // Load favourites once on mount.
  useEffect(() => {
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;
    void (async () => {
      const ids = await getFavourites();
      if (isCancelled()) return;
      setFavouriteIds(ids);
    })();
    return () => {
      state.cancelled = true;
    };
  }, []);

  // Resolve favourite IDs → display entries via the directory.
  useEffect(() => {
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;
    void (async () => {
      if (favouriteIds.length === 0) {
        if (isCancelled()) return;
        setFavouriteEntries([]);
        return;
      }
      try {
        const directory = await museumApi.listMuseumDirectory();
        if (isCancelled()) return;
        const byId = new Map(directory.map((m) => [m.id, m]));
        const ordered = favouriteIds
          .map((id) => byId.get(id))
          .filter((m): m is MuseumDirectoryEntry => m !== undefined)
          .map(toPickable)
          .filter((m): m is PickableMuseum => m !== null);
        setFavouriteEntries(ordered);
      } catch {
        if (isCancelled()) return;
        setFavouriteEntries([]);
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, [favouriteIds]);

  // Nearby fetch — fires once when GPS coords resolve.
  useEffect(() => {
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;
    void (async () => {
      if (status !== 'granted' || latitude === null || longitude === null) {
        if (isCancelled()) return;
        setNearby([]);
        return;
      }
      try {
        const { museums } = await museumApi.searchMuseums({
          lat: latitude,
          lng: longitude,
          radius: SEARCH_RADIUS_M,
        });
        if (isCancelled()) return;
        const entries = museums.map(toPickable).filter((m): m is PickableMuseum => m !== null);
        setNearby(entries);
      } catch {
        if (isCancelled()) return;
        setNearby([]);
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, [latitude, longitude, status]);

  // Debounced search.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = query.trim();
    const state: { cancelled: boolean } = { cancelled: false };
    const isCancelled = (): boolean => state.cancelled;
    if (trimmed.length === 0) {
      void Promise.resolve().then(() => {
        if (!isCancelled()) setSearchResults([]);
      });
      return () => {
        state.cancelled = true;
      };
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const { museums } = await museumApi.searchMuseums({
            q: trimmed,
            lat: latitude ?? undefined,
            lng: longitude ?? undefined,
            radius: SEARCH_RADIUS_M,
          });
          if (isCancelled()) return;
          const entries = museums.map(toPickable).filter((m): m is PickableMuseum => m !== null);
          setSearchResults(entries);
        } catch {
          if (isCancelled()) return;
          setSearchResults([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      state.cancelled = true;
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, latitude, longitude]);

  const handlePick = useCallback(
    (museum: PickableMuseum) => {
      void addFavourite(museum.id);
      onSelect({ id: museum.id, name: museum.name });
    },
    [onSelect],
  );

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const isSearching = trimmedQuery.length > 0;
  const visibleMuseums = isSearching ? searchResults : nearby;
  const isEmpty =
    isSearching && searchResults.length === 0
      ? true
      : !isSearching && nearby.length === 0 && favouriteEntries.length === 0;

  const renderRow = useCallback(
    ({ item }: { item: PickableMuseum }) => (
      <Pressable
        testID={`museum-picker-row-${String(item.id)}`}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        onPress={() => {
          handlePick(item);
        }}
        style={[
          styles.row,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.cardBorder,
          },
        ]}
      >
        <Ionicons name="business-outline" size={20} color={theme.primary} />
        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.address ? (
            <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      </Pressable>
    ),
    [theme, handlePick],
  );

  const renderFavourite = (entry: PickableMuseum) => (
    <Pressable
      key={entry.id}
      testID={`museum-picker-favourite-${String(entry.id)}`}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
      onPress={() => {
        handlePick(entry);
      }}
      style={[
        styles.favouriteChip,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <Ionicons name="star" size={14} color={theme.primary} />
      <Text style={[styles.favouriteChipText, { color: theme.textPrimary }]} numberOfLines={1}>
        {entry.name}
      </Text>
    </Pressable>
  );

  return (
    <View
      testID="museum-picker-screen"
      style={[styles.root, { backgroundColor: theme.cardBackground }]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
          <TextInput
            testID="museum-picker-search"
            accessibilityLabel={t('museumPicker.search_placeholder')}
            placeholder={t('museumPicker.search_placeholder')}
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: theme.textPrimary }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        {onClose ? (
          <Pressable
            testID="museum-picker-close"
            accessibilityRole="button"
            accessibilityLabel={t('museumPicker.close_a11y')}
            onPress={onClose}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {!isSearching && favouriteEntries.length > 0 ? (
        <View testID="museum-picker-favourites-section" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {t('museumPicker.favorites_section')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.favouritesStrip}
          >
            {favouriteEntries.map(renderFavourite)}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.listSection}>
        {!isSearching ? (
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {t('museumPicker.nearby_section')}
          </Text>
        ) : null}
        <FlatList
          testID="museum-picker-list"
          data={visibleMuseums}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={{ height: space['2'] }} />}
          ListEmptyComponent={
            isEmpty ? (
              <Text
                testID="museum-picker-empty"
                style={[styles.empty, { color: theme.textSecondary }]}
              >
                {t('museumPicker.empty_state')}
              </Text>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: space['4'],
    paddingTop: space['4'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    marginBottom: space['3'],
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
    borderRadius: radius.lg,
    borderWidth: semantic.input.borderWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: semantic.button.fontSize,
    paddingVertical: 0,
  },
  closeButton: {
    width: space['8'],
    height: space['8'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: space['3'],
  },
  sectionTitle: {
    fontSize: semantic.section.captionSize,
    fontWeight: '600',
    marginBottom: space['2'],
    textTransform: 'uppercase',
  },
  favouritesStrip: {
    gap: space['2'],
    paddingEnd: space['2'],
  },
  favouriteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['1'],
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
  },
  favouriteChipText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
  listSection: {
    flex: 1,
  },
  listContent: {
    paddingBottom: space['8'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    paddingHorizontal: space['4'],
    paddingVertical: space['3'],
    borderRadius: semantic.card.radius,
    borderWidth: semantic.input.borderWidth,
  },
  rowContent: {
    flex: 1,
    gap: space['1'],
  },
  rowTitle: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: semantic.section.captionSize,
  },
  empty: {
    textAlign: 'center',
    marginTop: space['6'],
    fontSize: semantic.form.labelSize,
  },
});
