import '../helpers/test-utils';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockCreateTicket = jest.fn();
jest.mock('@/features/support/infrastructure/ticketApi', () => ({
  ticketApi: {
    createTicket: (...args: unknown[]) => mockCreateTicket(...args),
  },
}));

jest.mock('@/shared/api/generated/openapi', () => ({}));

import CreateTicketScreen from '@/app/(stack)/create-ticket';

describe('CreateTicketScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<CreateTicketScreen />);
    expect(screen.getByText('tickets.createTicket')).toBeTruthy();
  });

  it('renders subject and description fields', () => {
    render(<CreateTicketScreen />);
    expect(screen.getByText('tickets.subject')).toBeTruthy();
    expect(screen.getByText('tickets.description')).toBeTruthy();
  });

  it('renders priority label and pills', () => {
    render(<CreateTicketScreen />);
    expect(screen.getByText('tickets.priority')).toBeTruthy();
    expect(screen.getByText('tickets.priorityLow')).toBeTruthy();
    expect(screen.getByText('tickets.priorityMedium')).toBeTruthy();
    expect(screen.getByText('tickets.priorityHigh')).toBeTruthy();
  });

  it('renders the submit button', () => {
    render(<CreateTicketScreen />);
    expect(screen.getByLabelText('tickets.submitTicket')).toBeTruthy();
  });

  it('submit button is disabled when fields are empty', () => {
    render(<CreateTicketScreen />);
    const submitButton = screen.getByLabelText('tickets.submitTicket');
    expect(submitButton.props.accessibilityState?.disabled).toBeTruthy();
  });

  it('calls createTicket on valid submit', async () => {
    mockCreateTicket.mockResolvedValue({
      ticket: { id: '123' },
    });

    render(<CreateTicketScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('tickets.subjectPlaceholder'), 'Test subject');
    fireEvent.changeText(
      screen.getByPlaceholderText('tickets.descriptionPlaceholder'),
      'Test description with enough chars',
    );
    fireEvent.press(screen.getByLabelText('tickets.submitTicket'));

    await waitFor(() => {
      expect(mockCreateTicket).toHaveBeenCalledWith({
        subject: 'Test subject',
        description: 'Test description with enough chars',
        priority: 'medium',
      });
    });
  });
});
