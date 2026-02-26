import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AddTaskPrefixDto } from './dto/add-task-prefix.dto';
import { TaskPrefixResponseDto } from './dto/task-prefix-response.dto';
import { TaskPrefix } from './entities/task-prefix.entity';

type DatabaseError = {
  code?: string;
  message?: string;
  driverError?: {
    code?: string;
    errno?: number;
    message?: string;
  };
};

@Injectable()
export class TaskPrefixService {
  constructor(
    @InjectRepository(TaskPrefix)
    private readonly taskPrefixRepository: Repository<TaskPrefix>,
  ) {}

  async addPrefix(
    connectionId: string,
    dto: AddTaskPrefixDto,
  ): Promise<TaskPrefixResponseDto> {
    const normalizedValue = this.normalizePrefix(dto.value);
    const value = dto.value.trim();

    const prefix = this.taskPrefixRepository.create({
      connectionId,
      value,
      normalizedValue,
    });

    try {
      const savedPrefix = await this.taskPrefixRepository.save(prefix);
      return this.mapToResponse(savedPrefix);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Task prefix already exists for this connection',
        );
      }

      throw error;
    }
  }

  async deletePrefix(connectionId: string, prefixId: string): Promise<boolean> {
    const result = await this.taskPrefixRepository.delete({
      id: prefixId,
      connectionId,
    });

    return (result.affected ?? 0) > 0;
  }

  normalizePrefix(value: string): string {
    return value.trim().toLowerCase();
  }

  mapToResponse(prefix: TaskPrefix): TaskPrefixResponseDto {
    return {
      id: prefix.id,
      connectionId: prefix.connectionId,
      value: prefix.value,
      normalizedValue: prefix.normalizedValue,
      createdAt: prefix.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const databaseError = error as DatabaseError;
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
