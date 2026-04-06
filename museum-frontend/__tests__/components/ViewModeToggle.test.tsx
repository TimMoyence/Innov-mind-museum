import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ViewModeToggle } from '@/features/museum/ui/ViewModeToggle';

describe('ViewModeToggle', () => {
  const onToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders list and map toggle buttons', () => {
    render(<ViewModeToggle mode="list" onToggle={onToggle} />);

    expect(screen.getByLabelText('a11y.museum.list_view')).toBeTruthy();
    expect(screen.getByLabelText('a11y.museum.map_view')).toBeTruthy();
  });

  it('marks list as selected when mode is list', () => {
    render(<ViewModeToggle mode="list" onToggle={onToggle} />);

    const listButton = screen.getByLabelText('a11y.museum.list_view');
    expect(listButton.props.accessibilityState.selected).toBe(true);

    const mapButton = screen.getByLabelText('a11y.museum.map_view');
    expect(mapButton.props.accessibilityState.selected).toBe(false);
  });

  it('marks map as selected when mode is map', () => {
    render(<ViewModeToggle mode="map" onToggle={onToggle} />);

    const mapButton = screen.getByLabelText('a11y.museum.map_view');
    expect(mapButton.props.accessibilityState.selected).toBe(true);

    const listButton = screen.getByLabelText('a11y.museum.list_view');
    expect(listButton.props.accessibilityState.selected).toBe(false);
  });

  it('fires onToggle with list when list button is pressed', () => {
    render(<ViewModeToggle mode="map" onToggle={onToggle} />);

    fireEvent.press(screen.getByLabelText('a11y.museum.list_view'));
    expect(onToggle).toHaveBeenCalledWith('list');
  });

  it('fires onToggle with map when map button is pressed', () => {
    render(<ViewModeToggle mode="list" onToggle={onToggle} />);

    fireEvent.press(screen.getByLabelText('a11y.museum.map_view'));
    expect(onToggle).toHaveBeenCalledWith('map');
  });

  it('has radiogroup accessibility role on the container', () => {
    const { toJSON } = render(<ViewModeToggle mode="list" onToggle={onToggle} />);
    const tree = toJSON();
    expect(tree).not.toBeNull();
    // The root View has accessibilityRole="radiogroup"
    if (tree && !Array.isArray(tree)) {
      expect(tree.props.accessibilityRole).toBe('radiogroup');
    }
  });
});
