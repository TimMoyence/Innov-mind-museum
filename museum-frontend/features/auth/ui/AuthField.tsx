import type { ComponentProps } from 'react';
import { Controller, type Control } from 'react-hook-form';

import { FormInput } from '@/shared/ui/FormInput';

import type { AuthFormValues } from './authFormSchema';

type AuthTextField = 'firstname' | 'lastname' | 'email' | 'password' | 'dateOfBirth';

type AuthFieldProps = Omit<
  ComponentProps<typeof FormInput>,
  'value' | 'onChangeText' | 'onBlur' | 'error'
> & {
  control: Control<AuthFormValues>;
  name: AuthTextField;
};

export function AuthField({ control, name, ...input }: AuthFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <FormInput
          {...input}
          value={value ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
        />
      )}
    />
  );
}
