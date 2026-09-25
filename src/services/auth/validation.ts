import { z } from 'zod';

const email = z.string().trim().email('Enter a valid email address.');
// A documented client baseline; Supabase enforces the project's actual policy.
export const minimumPasswordLength = 8;
const newPassword = z
  .string()
  .min(minimumPasswordLength, 'Use at least 8 characters.');
export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});
export const emailSchema = z.object({ email });
export const passwordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine(value => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords don’t match.',
  });
export const signUpSchema = z
  .object({ email, password: newPassword, confirmPassword: z.string() })
  .refine(value => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords don’t match.',
  });
export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type EmailValues = z.infer<typeof emailSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
