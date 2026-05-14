import type React from 'react';

interface Props {
  url: string;
  close: () => void;
}

/**
 * Lazy wrapper for the in-app browser sheet. The underlying component pulls
 * in `react-native-webview`, whose native module `RNCWebView` isn't linked in
 * jest's stripped-down RN runtime. Deferring the require to the first render
 * keeps the routes registry importable everywhere — callers that never
 * actually open the `browser` route pay zero cost, and tests that DO drive
 * the browser still get to mock `react-native-webview` per-file (the WebView
 * mock applies the moment the lazy require fires).
 */
interface InnerModule {
  InAppBrowserSheetContent: React.FC<Props>;
}

export const InAppBrowserSheetContent: React.FC<Props> = (props) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred load to keep `react-native-webview` (which the inner component imports) out of the eager module graph; mirrors the lazy-require pattern used by `useVoiceDisclosure` for `expo-speech`. Approved-by: tim@2026-05-14
  const mod = require('@/shared/ui/InAppBrowserSheetContent') as InnerModule;
  const Content = mod.InAppBrowserSheetContent;
  return <Content {...props} />;
};
