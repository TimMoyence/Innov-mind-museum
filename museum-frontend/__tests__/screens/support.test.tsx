import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';
import { router } from 'expo-router';

jest.mock('@/shared/config/supportLinks', () => ({
  SUPPORT_LINKS: {
    instagram: {
      label: 'Instagram',
      url: 'https://instagram.com/musaium',
      handle: '@musaium',
      ready: false,
    },
    telegram: {
      label: 'Telegram',
      url: 'https://t.me/musaium',
      handle: '@musaium',
      ready: true,
    },
  },
  getReadySupportChannels: () => [
    [
      'telegram',
      { label: 'Telegram', url: 'https://t.me/musaium', handle: '@musaium', ready: true },
    ],
  ],
  isValidSupportUrl: (url: string) => url.startsWith('https://'),
}));

import SupportScreen from '@/app/(stack)/support';

describe('SupportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  it('renders title, subtitle, and scope section', () => {
    render(<SupportScreen />);
    expect(screen.getByText('support.title')).toBeTruthy();
    expect(screen.getByText('support.subtitle')).toBeTruthy();
    expect(screen.getByText('support.scope_title')).toBeTruthy();
  });

  it('renders ticket section with buttons', () => {
    render(<SupportScreen />);
    expect(screen.getByLabelText('tickets.createTicket')).toBeTruthy();
    expect(screen.getByLabelText('tickets.myTickets')).toBeTruthy();
  });

  it('navigates to create ticket', () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('tickets.createTicket'));
    expect(router.push).toHaveBeenCalledWith('/(stack)/create-ticket');
  });

  it('navigates to tickets list', () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('tickets.myTickets'));
    expect(router.push).toHaveBeenCalledWith('/(stack)/tickets');
  });

  it('opens telegram channel on press', async () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('a11y.support.telegram'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('https://t.me/musaium');
    });
  });

  it('shows alert when channel URL cannot be opened', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('a11y.support.telegram'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  it('shares support channels', async () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('a11y.support.share'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalled();
    });
  });

  it('navigates back to settings', () => {
    render(<SupportScreen />);
    fireEvent.press(screen.getByLabelText('a11y.support.back_settings'));
    expect(router.push).toHaveBeenCalledWith('/(stack)/settings');
  });
});
