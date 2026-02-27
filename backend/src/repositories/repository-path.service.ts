import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

@Injectable()
export class RepositoryPathService {
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = resolve(
      this.configService.get('REPOSITORIES_BASE_PATH', '/app/repos'),
    );
  }

  getBasePath(): string {
    return this.basePath;
  }

  buildLocalPath(userId: string, fullName: string): string {
    const segments = fullName.split('/');
    if (
      segments.length !== 2 ||
      segments[0]?.trim().length === 0 ||
      segments[1]?.trim().length === 0
    ) {
      throw new Error('Invalid repository fullName');
    }

    const [owner, repository] = segments;
    const safeOwner = this.sanitizeSegment(owner);
    const safeRepository = this.sanitizeSegment(repository);
    if (safeOwner.length === 0 || safeRepository.length === 0) {
      throw new Error('Invalid repository fullName');
    }

    const localPath = resolve(join(this.basePath, userId, safeRepository));

    this.assertWithinBasePath(localPath);
    return localPath;
  }

  async ensureParentDirectory(localPath: string): Promise<void> {
    await mkdir(dirname(localPath), { recursive: true });
  }

  private sanitizeSegment(value: string | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private assertWithinBasePath(localPath: string): void {
    const normalizedBasePath = this.basePath.endsWith(sep)
      ? this.basePath
      : `${this.basePath}${sep}`;
    if (!localPath.startsWith(normalizedBasePath)) {
      throw new Error('Repository path escapes base path');
    }
  }
}
