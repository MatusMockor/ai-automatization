import { Injectable } from '@nestjs/common';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class PullRequestTemplateResolver {
  async resolve(repositoryPath: string): Promise<string | null> {
    const directCandidates = [
      '.github/pull_request_template.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ];

    for (const relativePath of directCandidates) {
      const content = await this.readIfExists(
        join(repositoryPath, relativePath),
      );
      if (content !== null) {
        return content;
      }
    }

    const templateDirectory = join(
      repositoryPath,
      '.github',
      'PULL_REQUEST_TEMPLATE',
    );
    try {
      const directoryStat = await stat(templateDirectory);
      if (!directoryStat.isDirectory()) {
        return this.readIfExists(
          join(repositoryPath, 'pull_request_template.md'),
        );
      }

      const files = await readdir(templateDirectory);
      const markdownFiles = files
        .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
        .sort((left, right) => left.localeCompare(right));

      for (const fileName of markdownFiles) {
        const content = await this.readIfExists(
          join(templateDirectory, fileName),
        );
        if (content !== null) {
          return content;
        }
      }
    } catch {
      // Ignore template directory probing errors and continue to root fallback.
    }

    return this.readIfExists(join(repositoryPath, 'pull_request_template.md'));
  }

  private async readIfExists(filePath: string): Promise<string | null> {
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        return null;
      }

      const content = await readFile(filePath, 'utf8');
      return content.trim();
    } catch {
      return null;
    }
  }
}
