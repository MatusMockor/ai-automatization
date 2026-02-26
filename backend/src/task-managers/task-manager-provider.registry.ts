import { Inject, Injectable } from '@nestjs/common';
import { TASK_MANAGER_PROVIDERS } from './constants/task-managers.tokens';
import {
  TaskManagerProvider,
  TaskManagerProviderType,
} from './interfaces/task-manager-provider.interface';

@Injectable()
export class TaskManagerProviderRegistry {
  private readonly providersByType: Map<
    TaskManagerProviderType,
    TaskManagerProvider
  >;

  constructor(
    @Inject(TASK_MANAGER_PROVIDERS)
    providers: TaskManagerProvider[],
  ) {
    this.providersByType = new Map();

    for (const provider of providers) {
      const existingProvider = this.providersByType.get(provider.provider);
      if (existingProvider) {
        const existingName =
          existingProvider.constructor?.name ?? 'UnknownProvider';
        const duplicateName = provider.constructor?.name ?? 'UnknownProvider';

        throw new Error(
          `Duplicate task manager provider registration for "${provider.provider}" (${existingName} and ${duplicateName})`,
        );
      }

      this.providersByType.set(provider.provider, provider);
    }
  }

  getProvider(type: TaskManagerProviderType): TaskManagerProvider {
    const provider = this.providersByType.get(type);
    if (!provider) {
      throw new Error(`Unsupported task manager provider: ${type}`);
    }

    return provider;
  }
}
