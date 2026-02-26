import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RequestUser } from './interfaces/request-user.interface';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

type PostgresError = {
  code?: string;
  message?: string;
  driverError?: {
    code?: string;
    errno?: number;
    message?: string;
  };
};

@Injectable()
export class AuthService {
  private readonly saltRounds: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const configuredRounds = parseInt(
      this.configService.get('BCRYPT_SALT_ROUNDS', '12'),
      10,
    );
    this.saltRounds = Number.isNaN(configuredRounds) ? 12 : configuredRounds;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    try {
      const user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
      });
      return this.createAuthResponse(user);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createAuthResponse(user);
  }

  async getProfile(userId: string): Promise<RequestUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.mapUser(user);
  }

  private async createAuthResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: this.mapUser(user),
    };
  }

  private mapUser(user: User): RequestUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const databaseError = error as PostgresError;
    const driverCode = databaseError.driverError?.code;
    const driverErrno = databaseError.driverError?.errno;
    const errorMessage = (
      databaseError.driverError?.message ??
      databaseError.message ??
      ''
    ).toLowerCase();

    return (
      databaseError.code === '23505' ||
      driverCode === '23505' ||
      databaseError.code === 'SQLITE_CONSTRAINT' ||
      driverCode === 'SQLITE_CONSTRAINT' ||
      driverErrno === 19 ||
      errorMessage.includes('unique constraint failed')
    );
  }
}
