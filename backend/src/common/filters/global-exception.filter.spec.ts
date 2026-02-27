import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  const createHost = (request: Record<string, unknown>) => {
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns HttpException response shape without mutation', () => {
    const filter = new GlobalExceptionFilter();
    const exception = new BadRequestException('Invalid payload');
    const { host, response } = createHost({
      method: 'POST',
      originalUrl: '/api/auth/login',
      headers: {
        'x-request-id': 'req-123',
      },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith(exception.getResponse());
    expect(loggerSpy).toHaveBeenCalled();
  });

  it('sanitizes unknown errors and returns generic internal error payload', () => {
    const filter = new GlobalExceptionFilter();
    const { host, response } = createHost({
      method: 'GET',
      originalUrl: '/api/tasks',
      headers: {
        'x-request-id': 'req-456',
      },
    });

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();

    filter.catch(new Error('Leaked internal details'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('500 (Internal server error)'),
      expect.stringContaining('requestId=req-456'),
    );
    const firstLogArgument = loggerSpy.mock.calls[0]?.[0] as string;
    expect(firstLogArgument).not.toContain('Leaked internal details');
  });
});
