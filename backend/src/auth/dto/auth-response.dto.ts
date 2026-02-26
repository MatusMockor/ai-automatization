import { RequestUser } from '../interfaces/request-user.interface';

export class AuthResponseDto {
  accessToken!: string;
  user!: RequestUser;
}
