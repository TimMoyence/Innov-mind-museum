import { render, screen } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import type { ApiConfigurationSnapshot } from '@/shared/infrastructure/apiConfig';
import { StartupConfigurationErrorScreen } from '@/shared/ui/StartupConfigurationErrorScreen';

describe('StartupConfigurationErrorScreen', () => {
  const snapshot: ApiConfigurationSnapshot = {
    buildVariant: 'development',
    apiEnvironment: 'staging',
    fallbackBaseUrl: 'http://localhost:3000',
    stagingBaseUrl: 'https://staging.example.com',
    productionBaseUrl: 'https://prod.example.com',
    resolvedBaseUrl: 'https://staging.example.com',
  };

  it('renders the error message', () => {
    const error = new Error('Missing EXPO_PUBLIC_API_BASE_URL');

    render(<StartupConfigurationErrorScreen error={error} snapshot={snapshot} />);

    expect(screen.getByText('Missing EXPO_PUBLIC_API_BASE_URL')).toBeTruthy();
  });

  it('renders the error badge and title', () => {
    render(
      <StartupConfigurationErrorScreen error={new Error('Config error')} snapshot={snapshot} />,
    );

    expect(screen.getByText('startupError.badge')).toBeTruthy();
    expect(screen.getByText('startupError.title')).toBeTruthy();
  });

  it('renders build context details', () => {
    render(<StartupConfigurationErrorScreen error={new Error('test')} snapshot={snapshot} />);

    expect(screen.getByText('development')).toBeTruthy();
    expect(screen.getByText('staging')).toBeTruthy();
    // staging URL appears twice: as resolvedBaseUrl and as stagingBaseUrl
    expect(screen.getAllByText('https://staging.example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('https://prod.example.com')).toBeTruthy();
  });

  it('renders how-to-fix steps', () => {
    render(<StartupConfigurationErrorScreen error={new Error('test')} snapshot={snapshot} />);

    expect(screen.getByText('startupError.step1')).toBeTruthy();
    expect(screen.getByText('startupError.step2')).toBeTruthy();
    expect(screen.getByText('startupError.step3')).toBeTruthy();
  });

  it('renders fallback text when optional URLs are absent', () => {
    const minimalSnapshot: ApiConfigurationSnapshot = {
      buildVariant: 'production',
      apiEnvironment: 'production',
      fallbackBaseUrl: 'http://localhost:3000',
      resolvedBaseUrl: 'http://localhost:3000',
    };

    render(
      <StartupConfigurationErrorScreen error={new Error('test')} snapshot={minimalSnapshot} />,
    );

    // Both staging and production URL rows show the fallback i18n key
    const fallbackTexts = screen.getAllByText('common.not_configured');
    expect(fallbackTexts.length).toBe(2);
  });
});
