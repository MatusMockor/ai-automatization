import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { access } from 'fs/promises';
import { join } from 'path';
import type {
  PreCommitRuntimeLanguage,
  PreCommitStepPreset,
} from './pre-commit-check-profile.types';

const PRESET_COMMANDS: Record<
  PreCommitRuntimeLanguage,
  Record<PreCommitStepPreset, string>
> = {
  php: {
    format: 'composer run format:check',
    lint: 'composer run lint',
    test: 'composer test',
  },
  node: {
    format: 'npm run format:check',
    lint: 'npm run lint',
    test: 'npm test -- --ci',
  },
};

@Injectable()
export class CheckPresetRegistryService {
  async resolveLanguage(localPath: string): Promise<PreCommitRuntimeLanguage> {
    if (await this.exists(join(localPath, 'composer.json'))) {
      return 'php';
    }

    if (await this.exists(join(localPath, 'package.json'))) {
      return 'node';
    }

    throw new InternalServerErrorException(
      'Unable to determine repository runtime language for pre-commit checks',
    );
  }

  getCommand(
    language: PreCommitRuntimeLanguage,
    preset: PreCommitStepPreset,
  ): string {
    return PRESET_COMMANDS[language][preset];
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
