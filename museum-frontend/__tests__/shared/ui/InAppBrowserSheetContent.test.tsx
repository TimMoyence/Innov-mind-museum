import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';

import '../../helpers/test-utils';

/**
 * Sheet-content variant of the legacy `InAppBrowser` tests (migrated under
 * C4). The `<Modal>` wrapper is now owned by the bottom-sheet router, so the
 * `url=null → no Modal mounts` branch is dropped (the router simply does not
 * activate this route when no URL is supplied). Every other security /
 * navigation behaviour is preserved.
 */

// react-native-webview is not in test-utils; mock it to capture props per render
// so the test can drive callback semantics (onLoadStart, onError, scheme guard, etc.).
// Variable must be `mock`-prefixed so jest's hoist guard allows the closure ref.
// Using React.createElement (not JSX) inside the factory avoids the babel
// jsx-runtime `_jsx` helper, whose out-of-scope reference triggers Jest's
// hoist-guard ReferenceError.
const mockCapturedProps: Record<string, unknown> = {};
jest.mock('react-native-webview', () => {
  const RN = require('react-native');
  const ReactRuntime = require('react');
  const WebView = ReactRuntime.forwardRef((props: Record<string, unknown>) => {
    Object.assign(mockCapturedProps, props);
    return ReactRuntime.createElement(RN.View, { testID: 'webview' });
  });
  WebView.displayName = 'WebView';
  return { WebView };
});

import { InAppBrowserSheetContent } from '@/shared/ui/InAppBrowserSheetContent';

describe('InAppBrowserSheetContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockCapturedProps)) {
      mockCapturedProps[key] = undefined;
    }
  });

  it('renders the close button with accessibility label "common.close"', () => {
    render(<InAppBrowserSheetContent url="https://example.com/page" close={jest.fn()} />);
    expect(screen.getByLabelText('common.close')).toBeTruthy();
  });

  it('renders the back button with accessibility label "common.back" disabled when canGoBack=false', () => {
    render(<InAppBrowserSheetContent url="https://example.com/page" close={jest.fn()} />);
    const back = screen.getByLabelText('common.back');
    expect(back.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders the open-in-system button with accessibility label "inAppBrowser.openSystem"', () => {
    render(<InAppBrowserSheetContent url="https://example.com/page" close={jest.fn()} />);
    expect(screen.getByLabelText('inAppBrowser.openSystem')).toBeTruthy();
  });

  it('shows the URL hostname in the URL bar (not the full URL)', () => {
    render(
      <InAppBrowserSheetContent
        url="https://www.example.com/some/long/path?q=1"
        close={jest.fn()}
      />,
    );
    expect(screen.getByText('www.example.com')).toBeTruthy();
  });

  it('falls back to raw string when URL parsing fails (safeHostFromUrl invariant)', () => {
    render(<InAppBrowserSheetContent url="not-a-valid-url" close={jest.fn()} />);
    expect(screen.getByText('not-a-valid-url')).toBeTruthy();
  });

  it('fires close when the close button is pressed', () => {
    const close = jest.fn();
    render(<InAppBrowserSheetContent url="https://example.com" close={close} />);
    fireEvent.press(screen.getByLabelText('common.close'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('opens current URL in the system browser when openSystem button is pressed', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('inAppBrowser.openSystem'));
    expect(openSpy).toHaveBeenCalledWith('https://example.com');
    openSpy.mockRestore();
  });

  it('passes the WebView source.uri equal to the prop url', () => {
    render(<InAppBrowserSheetContent url="https://example.com/page" close={jest.fn()} />);
    expect(mockCapturedProps.source).toEqual({ uri: 'https://example.com/page' });
  });

  it('restricts originWhitelist to http/https only', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    expect(mockCapturedProps.originWhitelist).toEqual(['http://*', 'https://*']);
  });

  it('disables javaScriptCanOpenWindowsAutomatically (window.open hijack guard)', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    expect(mockCapturedProps.javaScriptCanOpenWindowsAutomatically).toBe(false);
  });

  it('onShouldStartLoadWithRequest allows http URLs', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'http://example.com/page' })).toBe(true);
  });

  it('onShouldStartLoadWithRequest allows https URLs', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'https://example.com/page' })).toBe(true);
  });

  it('onShouldStartLoadWithRequest hands mailto: to system handler and returns false', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'mailto:hi@example.com' })).toBe(false);
    expect(openSpy).toHaveBeenCalledWith('mailto:hi@example.com');
    openSpy.mockRestore();
  });

  it('onShouldStartLoadWithRequest hands tel: to system handler and returns false', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'tel:+33123456789' })).toBe(false);
    expect(openSpy).toHaveBeenCalledWith('tel:+33123456789');
    openSpy.mockRestore();
  });

  it('onShouldStartLoadWithRequest blocks javascript: scheme', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'javascript:alert(1)' })).toBe(false);
  });

  it('onShouldStartLoadWithRequest blocks data: and file: schemes', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'data:text/html,<script>x</script>' })).toBe(false);
    expect(fn({ url: 'file:///etc/passwd' })).toBe(false);
  });

  it('onNavigationStateChange updates canGoBack — back button becomes enabled', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const navChange = mockCapturedProps.onNavigationStateChange as (n: {
      canGoBack: boolean;
      url: string;
    }) => void;
    act(() => {
      navChange({ canGoBack: true, url: 'https://example.com/next' });
    });
    const back = screen.getByLabelText('common.back');
    expect(back.props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('onNavigationStateChange updates the URL bar hostname', () => {
    render(<InAppBrowserSheetContent url="https://example.com/start" close={jest.fn()} />);
    const navChange = mockCapturedProps.onNavigationStateChange as (n: {
      canGoBack: boolean;
      url: string;
    }) => void;
    act(() => {
      navChange({ canGoBack: false, url: 'https://second.example.org/x' });
    });
    expect(screen.getByText('second.example.org')).toBeTruthy();
  });

  it('onError shows the error overlay with localized loadError message', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const onError = mockCapturedProps.onError as () => void;
    act(() => {
      onError();
    });
    expect(screen.getByText('inAppBrowser.loadError')).toBeTruthy();
  });

  it('onHttpError with status >= 400 shows error overlay', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const onHttpError = mockCapturedProps.onHttpError as (e: {
      nativeEvent: { statusCode: number };
    }) => void;
    act(() => {
      onHttpError({ nativeEvent: { statusCode: 503 } });
    });
    expect(screen.getByText('inAppBrowser.loadError')).toBeTruthy();
  });

  it('onHttpError with status < 400 does NOT show error overlay', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const onHttpError = mockCapturedProps.onHttpError as (e: {
      nativeEvent: { statusCode: number };
    }) => void;
    act(() => {
      onHttpError({ nativeEvent: { statusCode: 304 } });
    });
    expect(screen.queryByText('inAppBrowser.loadError')).toBeNull();
  });

  it('onLoadStart after an error clears the error overlay', () => {
    render(<InAppBrowserSheetContent url="https://example.com" close={jest.fn()} />);
    const onError = mockCapturedProps.onError as () => void;
    const onLoadStart = mockCapturedProps.onLoadStart as () => void;
    act(() => {
      onError();
    });
    expect(screen.getByText('inAppBrowser.loadError')).toBeTruthy();
    act(() => {
      onLoadStart();
    });
    expect(screen.queryByText('inAppBrowser.loadError')).toBeNull();
  });
});
