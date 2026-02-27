import { Injectable } from '@nestjs/common';

const FORBIDDEN_TERMS_PATTERN = /\b(ai|anthropic|claude|codex)\b/gi;

type ResolvePublicationContentInput = {
  taskTitle: string;
  taskExternalId: string;
  taskSource: 'asana' | 'jira';
  taskDescription: string | null;
  executionOutput: string;
  templateBody: string | null;
};

type ResolvedPublicationContent = {
  commitMessage: string;
  pullRequestTitle: string;
  pullRequestBody: string;
};

type ParsedClaudeContract = {
  title: string | null;
  body: string | null;
};

@Injectable()
export class PublicationContentResolver {
  resolve(input: ResolvePublicationContentInput): ResolvedPublicationContent {
    const parsedContract = this.parseClaudeContract(input.executionOutput);
    const defaultTitle = this.sanitizeTitle(
      `${input.taskTitle} [\`${input.taskExternalId}\`]`,
      input.taskExternalId,
    );

    const pullRequestTitle =
      input.templateBody !== null
        ? defaultTitle
        : this.sanitizeTitle(
            parsedContract.title ?? defaultTitle,
            input.taskExternalId,
          );

    const pullRequestBody = this.resolveBody(input, parsedContract);

    return {
      commitMessage: pullRequestTitle,
      pullRequestTitle,
      pullRequestBody,
    };
  }

  private resolveBody(
    input: ResolvePublicationContentInput,
    parsedContract: ParsedClaudeContract,
  ): string {
    if (input.templateBody !== null) {
      return this.sanitizeBody(input.templateBody) || this.defaultBody(input);
    }

    if (parsedContract.body) {
      const sanitized = this.sanitizeBody(parsedContract.body);
      if (sanitized.length > 0) {
        return sanitized;
      }
    }

    return this.defaultBody(input);
  }

  private parseClaudeContract(output: string): ParsedClaudeContract {
    const titleMatch = output.match(/^PR_TITLE:\s*(.+)$/im);
    const bodyTagRegex = /^PR_BODY:\s*/gim;
    let lastBodyStartIndex: number | null = null;
    let match: RegExpExecArray | null = null;

    while ((match = bodyTagRegex.exec(output)) !== null) {
      lastBodyStartIndex = match.index + match[0].length;
    }

    const title = titleMatch?.[1]?.trim() || null;
    const body =
      lastBodyStartIndex === null
        ? null
        : output.slice(lastBodyStartIndex).trim() || null;

    return { title, body };
  }

  private sanitizeTitle(title: string, taskExternalId: string): string {
    const sanitized = this.sanitizeGeneric(title)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 255);

    if (sanitized.length > 0) {
      return sanitized;
    }

    return `Task update [\`${taskExternalId}\`]`;
  }

  private sanitizeBody(body: string): string {
    return body
      .replace(FORBIDDEN_TERMS_PATTERN, '')
      .replace(/\r/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 50000);
  }

  private sanitizeGeneric(value: string): string {
    return value
      .replace(FORBIDDEN_TERMS_PATTERN, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private defaultBody(input: ResolvePublicationContentInput): string {
    const descriptionBlock = input.taskDescription
      ? `Task description:\n${input.taskDescription}\n\n`
      : '';

    const body = `## Summary\n${descriptionBlock}Task source: ${input.taskSource}\nTask ID: ${input.taskExternalId}\n\n## Changes\n- Implemented repository updates related to the task above.\n`;

    return (
      this.sanitizeBody(body) ||
      `Task update for [\`${input.taskExternalId}\`].`
    );
  }
}
