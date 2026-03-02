import { Injectable } from '@nestjs/common';

@Injectable()
export class RedactionService {
  redactText(value: string): string {
    if (!value) {
      return value;
    }

    return value
      .replace(
        /\b(authorization\s*:\s*bearer\s+)[^\s"'`]+/gi,
        '$1[REDACTED_TOKEN]',
      )
      .replace(
        /\b((?:api[_-]?key|token|password|secret)(?:\s*[:=]\s*|[\s"']+))[^\s"'`]+/gi,
        '$1[REDACTED]',
      )
      .replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        '[REDACTED_EMAIL]',
      )
      .replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED_HEX]')
      .replace(
        /\b(?=[A-Za-z0-9+/_-]{40,}={0,2}\b)(?=[A-Za-z0-9+/_-]*[A-Za-z])(?=[A-Za-z0-9+/_-]*[0-9])[A-Za-z0-9+/_-]+={0,2}\b/g,
        '[REDACTED_SECRET]',
      );
  }
}
