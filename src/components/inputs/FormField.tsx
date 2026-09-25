import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import { TextInput } from './TextInput';

type Props<T extends FieldValues> = Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'onBlur'
> & {
  control: Control<T>;
  name: Path<T>;
  label: string;
};
export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  ...props
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInput
          {...props}
          ref={field.ref}
          label={label}
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
