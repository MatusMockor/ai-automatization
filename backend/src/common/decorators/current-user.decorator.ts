import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../auth/interfaces/request-user.interface';

type RequestWithUser = Request & {
  user: RequestUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
