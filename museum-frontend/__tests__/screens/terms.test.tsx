import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import TermsScreen from '@/app/(stack)/terms';

describe('TermsScreen', () => {
  it('renders without crashing', () => {
    render(<TermsScreen />);
    expect(screen.getByText('Terms of Service')).toBeTruthy();
  });

  it('renders the document title', () => {
    render(<TermsScreen />);
    expect(screen.getByText('Terms of Service')).toBeTruthy();
  });

  it('renders section titles', () => {
    render(<TermsScreen />);
    expect(screen.getByText('1. Acceptance of Terms')).toBeTruthy();
    expect(screen.getByText('2. Description of Service')).toBeTruthy();
    expect(screen.getByText('3. User Accounts')).toBeTruthy();
  });

  it('renders version note', () => {
    render(<TermsScreen />);
    expect(screen.getByText('terms.version_note')).toBeTruthy();
  });

  it('renders privacy policy button', () => {
    render(<TermsScreen />);
    expect(screen.getByText('terms.privacy_policy')).toBeTruthy();
  });

  it('renders back to settings button', () => {
    render(<TermsScreen />);
    expect(screen.getByText('terms.back_settings')).toBeTruthy();
  });
});
