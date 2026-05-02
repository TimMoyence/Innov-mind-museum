import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';

import '../../helpers/test-utils';

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

import { InAppBrowser } from '@/shared/ui/InAppBrowser';

describe('InAppBrowser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockCapturedProps)) {
      mockCapturedProps[key] = undefined;
    }
  });

  it('returns null when url is null (no Modal mounts)', () => {
    const onClose = jest.fn();
    render(<InAppBrowser url={null} onClose={onClose} />);
    // The close-button accessibilityLabel ("common.close") is only rendered
    // inside the Modal. With url=null we expect zero matches.
    expect(screen.queryByLabelText('common.close')).toBeNull();
  });

  it('renders the close button with accessibility label "common.close" when url is set', () => {
    render(<InAppBrowser url="https://example.com/page" onClose={jest.fn()} />);
    expect(screen.getByLabelText('common.close')).toBeTruthy();
  });

  it('renders the back button with accessibility label "common.back" disabled when canGoBack=false', () => {
    render(<InAppBrowser url="https://example.com/page" onClose={jest.fn()} />);
    const back = screen.getByLabelText('common.back');
    expect(back.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders the open-in-system button with accessibility label "inAppBrowser.openSystem"', () => {
    render(<InAppBrowser url="https://example.com/page" onClose={jest.fn()} />);
    expect(screen.getByLabelText('inAppBrowser.openSystem')).toBeTruthy();
  });

  it('shows the URL hostname in the URL bar (not the full URL)', () => {
    render(<InAppBrowser url="https://www.example.com/some/long/path?q=1" onClose={jest.fn()} />);
    expect(screen.getByText('www.example.com')).toBeTruthy();
  });

  it('falls back to raw string when URL parsing fails (safeHostFromUrl invariant)', () => {
    render(<InAppBrowser url="not-a-valid-url" onClose={jest.fn()} />);
    expect(screen.getByText('not-a-valid-url')).toBeTruthy();
  });

  it('fires onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    render(<InAppBrowser url="https://example.com" onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens current URL in the system browser when openSystem button is pressed', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('inAppBrowser.openSystem'));
    expect(openSpy).toHaveBeenCalledWith('https://example.com');
    openSpy.mockRestore();
  });

  it('passes the WebView source.uri equal to the prop url', () => {
    render(<InAppBrowser url="https://example.com/page" onClose={jest.fn()} />);
    expect(mockCapturedProps.source).toEqual({ uri: 'https://example.com/page' });
  });

  it('restricts originWhitelist to http/https only', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    expect(mockCapturedProps.originWhitelist).toEqual(['http://*', 'https://*']);
  });

  it('disables javaScriptCanOpenWindowsAutomatically (window.open hijack guard)', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    expect(mockCapturedProps.javaScriptCanOpenWindowsAutomatically).toBe(false);
  });

  it('onShouldStartLoadWithRequest allows http URLs', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'http://example.com/page' })).toBe(true);
  });

  it('onShouldStartLoadWithRequest allows https URLs', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'https://example.com/page' })).toBe(true);
  });

  it('onShouldStartLoadWithRequest hands mailto: to system handler and returns false', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'mailto:hi@example.com' })).toBe(false);
    expect(openSpy).toHaveBeenCalledWith('mailto:hi@example.com');
    openSpy.mockRestore();
  });

  it('onShouldStartLoadWithRequest hands tel: to system handler and returns false', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'tel:+33123456789' })).toBe(false);
    expect(openSpy).toHaveBeenCalledWith('tel:+33123456789');
    openSpy.mockRestore();
  });

  it('onShouldStartLoadWithRequest blocks javascript: scheme', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'javascript:alert(1)' })).toBe(false);
  });

  it('onShouldStartLoadWithRequest blocks data: and file: schemes', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const fn = mockCapturedProps.onShouldStartLoadWithRequest as (req: { url: string }) => boolean;
    expect(fn({ url: 'data:text/html,<script>x</script>' })).toBe(false);
    expect(fn({ url: 'file:///etc/passwd' })).toBe(false);
  });

  it('onNavigationStateChange updates canGoBack — back button becomes enabled', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
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
    render(<InAppBrowser url="https://example.com/start" onClose={jest.fn()} />);
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
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const onError = mockCapturedProps.onError as () => void;
    act(() => {
      onError();
    });
    expect(screen.getByText('inAppBrowser.loadError')).toBeTruthy();
  });

  it('onHttpError with status >= 400 shows error overlay', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const onHttpError = mockCapturedProps.onHttpError as (e: {
      nativeEvent: { statusCode: number };
    }) => void;
    act(() => {
      onHttpError({ nativeEvent: { statusCode: 503 } });
    });
    expect(screen.getByText('inAppBrowser.loadError')).toBeTruthy();
  });

  it('onHttpError with status < 400 does NOT show error overlay', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
    const onHttpError = mockCapturedProps.onHttpError as (e: {
      nativeEvent: { statusCode: number };
    }) => void;
    act(() => {
      onHttpError({ nativeEvent: { statusCode: 304 } });
    });
    expect(screen.queryByText('inAppBrowser.loadError')).toBeNull();
  });

  it('onLoadStart after an error clears the error overlay', () => {
    render(<InAppBrowser url="https://example.com" onClose={jest.fn()} />);
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
