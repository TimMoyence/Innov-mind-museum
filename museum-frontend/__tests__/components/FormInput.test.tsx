import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { FormInput } from '@/shared/ui/FormInput';

describe('FormInput — variant-driven defaults', () => {
  const baseProps = {
    icon: 'mail-outline' as const,
    value: '',
    onChangeText: jest.fn(),
    placeholder: 'placeholder',
  };

  beforeEach(() => jest.clearAllMocks());

  it('defaults to the "text" variant with sensible autofill props', () => {
    const { getByPlaceholderText } = render(<FormInput {...baseProps} />);
    const input = getByPlaceholderText('placeholder');
    expect(input.props.secureTextEntry).toBe(false);
    expect(input.props.autoCapitalize).toBe('sentences');
    expect(input.props.keyboardType).toBe('default');
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.textContentType).toBe('none');
  });

  it('wires email autofill hints for variant="email"', () => {
    const { getByPlaceholderText } = render(<FormInput {...baseProps} variant="email" />);
    const input = getByPlaceholderText('placeholder');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoComplete).toBe('email');
    expect(input.props.textContentType).toBe('emailAddress');
  });

  it('wires existing-password hints for variant="password"', () => {
    const { getByPlaceholderText } = render(<FormInput {...baseProps} variant="password" />);
    const input = getByPlaceholderText('placeholder');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoComplete).toBe('current-password');
    expect(input.props.textContentType).toBe('password');
  });

  it('wires new-password hints for variant="password-new"', () => {
    const { getByPlaceholderText } = render(<FormInput {...baseProps} variant="password-new" />);
    const input = getByPlaceholderText('placeholder');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.textContentType).toBe('newPassword');
  });

  it('respects explicit prop overrides over variant defaults', () => {
    const { getByPlaceholderText } = render(
      <FormInput
        {...baseProps}
        variant="password"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
      />,
    );
    const input = getByPlaceholderText('placeholder');
    // still secureTextEntry because we didn't override it
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.textContentType).toBe('oneTimeCode');
  });
});
