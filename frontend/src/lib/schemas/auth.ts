import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .email('Please enter a valid email')
    .max(255),
  password: z.string().min(1, 'Password is required').max(72),
});
export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .email('Please enter a valid email')
    .max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});
export type RegisterFormData = z.infer<typeof registerSchema>;
