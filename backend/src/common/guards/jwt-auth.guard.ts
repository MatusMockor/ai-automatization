import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private static readonly ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    if (this.isSwaggerPublicRoute(context)) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser) {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException('Unauthorized');
    }

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    return user;
  }

  private isSwaggerPublicRoute(context: ExecutionContext): boolean {
    if (!this.isSwaggerEnabled()) {
      return false;
    }

    const request = context.switchToHttp().getRequest<{
      url?: string;
      originalUrl?: string;
    }>();
    const requestPath = (request?.originalUrl ?? request?.url ?? '').split(
      '?',
    )[0];
    const swaggerPath = this.resolveSwaggerPath();

    return (
      requestPath === swaggerPath ||
      requestPath.startsWith(`${swaggerPath}/`) ||
      requestPath === `${swaggerPath}-json`
    );
  }

  private isSwaggerEnabled(): boolean {
    const rawValue = process.env.ENABLE_SWAGGER;
    if (rawValue === undefined) {
      return false;
    }

    return JwtAuthGuard.ENABLED_VALUES.has(rawValue.toLowerCase());
  }

  private resolveSwaggerPath(): string {
    const normalizedPath = (process.env.SWAGGER_PATH ?? 'api/docs')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');

    return `/${normalizedPath || 'api/docs'}`;
  }
}
