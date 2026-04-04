import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import TermsScreen from '@/app/(stack)/terms';

describe('TermsScreen', () => {
  it('renders navigation buttons', () => {
    render(<TermsScreen />);
    expect(screen.getByRole('button', { name: 'a11y.terms.privacy_policy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a11y.terms.back_settings' })).toBeTruthy();
  });

  it('renders version note', () => {
    render(<TermsScreen />);
    expect(screen.getByText('terms.version_note')).toBeTruthy();
  });

  it('renders context menu', () => {
    render(<TermsScreen />);
    expect(screen.getByTestId('floating-context-menu')).toBeTruthy();
  });
});
