import { Injectable } from '@nestjs/common';
import { TaskPrefix } from './entities/task-prefix.entity';
import { ProviderTask } from './interfaces/task-manager-provider.interface';

type FilteredTask = ProviderTask & {
  matchedPrefix: string | null;
};

type NormalizedPrefix = {
  value: string;
  normalizedValue: string;
};

@Injectable()
export class TaskFilterService {
  filterTasks(tasks: ProviderTask[], prefixes: TaskPrefix[]): FilteredTask[] {
    const normalizedPrefixes = this.normalizePrefixes(prefixes);

    if (normalizedPrefixes.length === 0) {
      return tasks.map((task) => ({
        ...task,
        matchedPrefix: null,
      }));
    }

    const filteredTasks: FilteredTask[] = [];

    for (const task of tasks) {
      const matchedPrefix = this.matchPrefix(task.title, normalizedPrefixes);
      if (!matchedPrefix) {
        continue;
      }

      filteredTasks.push({
        ...task,
        matchedPrefix,
      });
    }

    return filteredTasks;
  }

  private normalizePrefixes(prefixes: TaskPrefix[]): NormalizedPrefix[] {
    return prefixes
      .map((prefix) => ({
        value: prefix.value,
        normalizedValue: prefix.normalizedValue,
      }))
      .filter((prefix) => prefix.normalizedValue.length > 0)
      .sort((a, b) => {
        if (b.normalizedValue.length !== a.normalizedValue.length) {
          return b.normalizedValue.length - a.normalizedValue.length;
        }

        return a.normalizedValue.localeCompare(b.normalizedValue);
      });
  }

  private matchPrefix(
    title: string,
    prefixes: NormalizedPrefix[],
  ): string | null {
    const normalizedTitle = title.trimStart().toLowerCase();

    for (const prefix of prefixes) {
      if (normalizedTitle.startsWith(prefix.normalizedValue)) {
        return prefix.value;
      }
    }

    return null;
  }
}
