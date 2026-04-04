import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

// Patch expo-router mock to include Stack and Link
const expoRouter = require('expo-router');
expoRouter.Stack = { Screen: () => null };
expoRouter.Link = ({ children }: { children: React.ReactNode }) => children;

import NotFoundScreen from '@/app/+not-found';

describe('NotFoundScreen', () => {
  it('renders the title', () => {
    render(<NotFoundScreen />);
    expect(screen.getByText('notFound.title')).toBeTruthy();
  });

  it('renders the home button', () => {
    render(<NotFoundScreen />);
    expect(screen.getByText('notFound.button')).toBeTruthy();
  });

  it('has correct accessibility label on button', () => {
    render(<NotFoundScreen />);
    expect(screen.getByLabelText('a11y.notFound.home')).toBeTruthy();
  });
});
