import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Execution } from '../entities/execution.entity';

@Injectable()
export class ExecutionReportArtifactService {
  private readonly maxOutputChars = 10000;

  async writeReport(execution: Execution): Promise<string> {
    const relativePath = join('.ai', 'executions', `${execution.id}.md`);
    const absolutePath = join(execution.repository.localPath, relativePath);

    await mkdir(join(execution.repository.localPath, '.ai', 'executions'), {
      recursive: true,
    });

    await writeFile(absolutePath, this.buildReport(execution), 'utf8');
    return relativePath;
  }

  private buildReport(execution: Execution): string {
    const startedAt = execution.startedAt?.toISOString() ?? 'n/a';
    const finishedAt = execution.finishedAt?.toISOString() ?? 'n/a';
    const output = this.normalizeOutput(execution.output);

    return [
      '# Execution Report',
      '',
      `- Execution ID: ${execution.id}`,
      `- Action: ${execution.action}`,
      `- Task source: ${execution.taskSource}`,
      `- Task ID: ${execution.taskId}`,
      `- Task external ID: ${execution.taskExternalId}`,
      `- Status: ${execution.status}`,
      `- Started at: ${startedAt}`,
      `- Finished at: ${finishedAt}`,
      '',
      '## Task title',
      '',
      execution.taskTitle,
      '',
      '## Task description',
      '',
      execution.taskDescription?.trim().length
        ? execution.taskDescription.trim()
        : 'No description provided',
      '',
      '## Output snapshot',
      '',
      '```text',
      output,
      '```',
      '',
    ].join('\n');
  }

  private normalizeOutput(output: string): string {
    if (output.trim().length === 0) {
      return 'No output produced';
    }

    if (output.length <= this.maxOutputChars) {
      return output;
    }

    return `${output.slice(0, this.maxOutputChars)}\n\n[truncated]`;
  }
}
