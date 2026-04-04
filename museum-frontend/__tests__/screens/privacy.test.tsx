import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import PrivacyScreen from '@/app/(stack)/privacy';

describe('PrivacyScreen', () => {
  it('renders without crashing', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('Privacy Policy (GDPR / RGPD)')).toBeTruthy();
  });

  it('renders the document title', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('Privacy Policy (GDPR / RGPD)')).toBeTruthy();
  });

  it('renders metadata labels', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('Last updated')).toBeTruthy();
    expect(screen.getByText('Controller')).toBeTruthy();
    expect(screen.getByText('Privacy contact')).toBeTruthy();
  });

  it('renders metadata values', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('2026-03-18')).toBeTruthy();
  });

  it('renders the status pill as ready when no placeholders', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.status_ready')).toBeTruthy();
  });

  it('renders quick facts section', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.quick_facts')).toBeTruthy();
  });

  it('renders GDPR rights section', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.gdpr_rights')).toBeTruthy();
  });

  it('renders section titles from policy content', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('1. Data Controller')).toBeTruthy();
    expect(screen.getByText('2. Data We Collect')).toBeTruthy();
  });

  it('renders support and settings buttons', () => {
    render(<PrivacyScreen />);
    expect(screen.getByText('privacy.open_support')).toBeTruthy();
    expect(screen.getByText('privacy.back_settings')).toBeTruthy();
  });
});
