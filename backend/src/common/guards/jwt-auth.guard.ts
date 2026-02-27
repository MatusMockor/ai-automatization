import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  isEnvFlagEnabled,
  resolveSwaggerRoutePath,
} from '../utils/swagger-config.utils';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
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
    if (!isEnvFlagEnabled(process.env.ENABLE_SWAGGER, false)) {
      return false;
    }

    const request = context.switchToHttp().getRequest<{
      url?: string;
      originalUrl?: string;
    }>();
    const requestPath = (request?.originalUrl ?? request?.url ?? '').split(
      '?',
    )[0];
    const swaggerPath = resolveSwaggerRoutePath(process.env.SWAGGER_PATH);

    return (
      requestPath === swaggerPath ||
      requestPath.startsWith(`${swaggerPath}/`) ||
      requestPath === `${swaggerPath}-json`
    );
  }
}
