import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

type ResponsePayload = {
  statusCode: number;
  message: string | string[];
  error?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      method?: string;
      url?: string;
      originalUrl?: string;
      headers?: Record<string, string | string[] | undefined>;
      id?: string;
    }>();
    const response = http.getResponse<{
      status: (code: number) => { send: (body: unknown) => void };
    }>();

    const status = this.resolveStatus(exception);
    const payload = this.resolvePayload(exception, status);

    const requestIdHeader = request?.headers?.['x-request-id'];
    const requestId =
      typeof requestIdHeader === 'string'
        ? requestIdHeader
        : Array.isArray(requestIdHeader)
          ? requestIdHeader[0]
          : request?.id;

    const messageForLogs = Array.isArray(payload.message)
      ? payload.message.join('; ')
      : payload.message;

    this.logger.error(
      `${request?.method ?? 'UNKNOWN'} ${request?.originalUrl ?? request?.url ?? ''} -> ${status} (${this.sanitizeLogMessage(messageForLogs)})`,
      requestId ? `requestId=${requestId}` : undefined,
    );

    response.status(status).send(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolvePayload(exception: unknown, status: number): ResponsePayload {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        statusCode: status,
        message: response,
      };
    }

    if (this.isResponsePayload(response)) {
      return response;
    }

    return {
      statusCode: status,
      message: exception.message || 'Unexpected error',
    };
  }

  private isResponsePayload(value: unknown): value is ResponsePayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const payload = value as Partial<ResponsePayload>;
    const isMessageValid =
      typeof payload.message === 'string' || Array.isArray(payload.message);

    return typeof payload.statusCode === 'number' && isMessageValid;
  }

  private sanitizeLogMessage(message: string): string {
    return message.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}
