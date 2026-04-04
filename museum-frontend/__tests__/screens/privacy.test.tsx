import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import PrivacyScreen from '@/app/(stack)/privacy';

describe('PrivacyScreen', () => {
  it('renders navigation buttons', () => {
    render(<PrivacyScreen />);
    expect(screen.getByRole('button', { name: 'a11y.privacy.open_support' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a11y.privacy.back_settings' })).toBeTruthy();
  });

  it('renders status pill as ready when no placeholders', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.status_ready')).toBeTruthy();
  });

  it('renders GDPR rights and quick facts sections', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.quick_facts')).toBeTruthy();
    expect(screen.getByText('privacy.gdpr_rights')).toBeTruthy();
  });
});
