import { Injectable } from '@nestjs/common';

@Injectable()
export class BranchNameBuilder {
  buildBaseBranchName(prefix: string, taskExternalId: string): string {
    const normalizedPrefix =
      prefix.trim().replace(/\/+$/g, '').replace(/^\/+/, '') || 'feature/ai';
    const normalizedTaskId = this.sanitizeSegment(taskExternalId);

    return `${normalizedPrefix}/${normalizedTaskId || 'task'}`;
  }

  buildCandidate(baseName: string, attempt: number): string {
    if (attempt <= 1) {
      return baseName;
    }

    return `${baseName}-${attempt}`;
  }

  private sanitizeSegment(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }
}
