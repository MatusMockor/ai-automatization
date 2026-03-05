import { z } from 'zod';

export const settingsSchema = z.object({
  claudeOauthToken: z.string().max(4096).optional(),
  githubToken: z.string().max(4096).optional(),
});
export type SettingsFormData = z.infer<typeof settingsSchema>;

export const preCommitChecksProfileSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['warn', 'block']),
  runner: z.object({
    type: z.literal('compose_service'),
    service: z.string().min(1),
  }),
  steps: z.array(
    z.object({
      preset: z.enum(['format', 'lint', 'test']),
      enabled: z.boolean(),
    }),
  ),
  runtime: z
    .object({
      language: z.enum(['php', 'node']),
      version: z.string().min(1),
    })
    .optional(),
});
