import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetPersistedCache, queryClient } from '@/shared/data/queryClient';

describe('resetPersistedCache', () => {
  afterEach(async () => {
    queryClient.clear();
    await AsyncStorage.clear();
  });

  it('removes the persisted cache key from AsyncStorage', async () => {
    await AsyncStorage.setItem('musaium.query.cache', JSON.stringify({ foo: 'bar' }));
    expect(await AsyncStorage.getItem('musaium.query.cache')).not.toBeNull();

    await resetPersistedCache();

    expect(await AsyncStorage.getItem('musaium.query.cache')).toBeNull();
  });

  it('clears the in-memory React Query cache', async () => {
    queryClient.setQueryData(['test-scope'], { secret: 'previous-user' });
    expect(queryClient.getQueryData(['test-scope'])).toEqual({ secret: 'previous-user' });

    await resetPersistedCache();

    expect(queryClient.getQueryData(['test-scope'])).toBeUndefined();
  });

  it('still clears the in-memory cache even if the persister throws', async () => {
    queryClient.setQueryData(['test-scope-2'], { secret: 'other' });

    const originalRemoveItem = AsyncStorage.removeItem as jest.Mock;
    const stashed = originalRemoveItem.getMockImplementation();
    originalRemoveItem.mockRejectedValueOnce(new Error('quota exceeded'));

    await resetPersistedCache();

    expect(queryClient.getQueryData(['test-scope-2'])).toBeUndefined();

    if (stashed) originalRemoveItem.mockImplementation(stashed);
  });
});
