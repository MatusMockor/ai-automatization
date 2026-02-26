import { z } from 'zod';

export const settingsSchema = z.object({
  claudeApiKey: z.string().max(4096).optional(),
  githubToken: z.string().max(4096).optional(),
});
export type SettingsFormData = z.infer<typeof settingsSchema>;
