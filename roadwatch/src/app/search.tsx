import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { autocomplete, geocode, hasGoogleKey, placeDetails, type Suggestion } from '../lib/google';
import { getState, setDestination } from '../lib/radar';
import { radius, space, type, usePalette } from '../theme';

function newSessionToken() {
  // Groups the typing and the final pick into one billed Places session.
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function SearchScreen() {
  const c = usePalette();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newSessionToken());

  // Live suggestions with Google Places; the phone geocoder only searches on submit.
  useEffect(() => {
    if (!hasGoogleKey) return;
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      autocomplete(q, getState().fix, session.current, controller.signal)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  // With Google, suggestions only make sense for the current text.
  const shown = hasGoogleKey && query.trim().length < 2 ? [] : results;

  const submit = async () => {
    const q = query.trim();
    if (hasGoogleKey || !q) return;
    setLoading(true);
    try {
      const r = await geocode(q);
      setResults(r);
      setError(r.length ? null : 'Nothing found. Try adding the town or city.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const pick = async (s: Suggestion) => {
    try {
      setLoading(true);
      const place = s.place ?? (await placeDetails(s.id, session.current));
      session.current = newSessionToken();
      setDestination(place);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={[styles.inputWrap, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Ionicons name="search" size={20} color={c.muted} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          placeholder="Search for a place or address"
          placeholderTextColor={c.muted}
          returnKeyType="search"
          autoCorrect={false}
          style={[type.body, styles.input, { color: c.ink }]}
        />
        {loading && <ActivityIndicator color={c.brand} />}
      </View>

      {error && <Text style={[type.small, styles.message, { color: c.danger }]}>{error}</Text>}

      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxl }}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => pick(item)}
            style={({ pressed }) => [
              styles.result,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="location" size={22} color={c.brand} />
            <View style={styles.fill}>
              <Text style={[type.body, { color: c.ink, fontWeight: '600' }]} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle && (
                <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[type.small, styles.message, { color: c.muted }]}>
            {hasGoogleKey ? 'Start typing to search with Google.' : 'Type an address and press search.'} Or close this
            and long-press anywhere on the map to drop a pin.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    margin: space.lg,
    paddingHorizontal: space.lg,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, height: '100%' },
  message: { paddingHorizontal: space.xl, lineHeight: 20 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
});
