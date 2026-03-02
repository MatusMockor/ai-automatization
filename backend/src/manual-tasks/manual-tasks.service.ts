import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';
import { ManualTaskResponseDto } from './dto/manual-task-response.dto';
import { UpdateManualTaskDto } from './dto/update-manual-task.dto';
import { ManualTask } from './entities/manual-task.entity';

@Injectable()
export class ManualTasksService {
  constructor(
    @InjectRepository(ManualTask)
    private readonly manualTaskRepository: Repository<ManualTask>,
  ) {}

  async listForUser(userId: string): Promise<ManualTaskResponseDto[]> {
    const tasks = await this.manualTaskRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return tasks.map((task) => this.mapToResponse(task));
  }

  async createForUser(
    userId: string,
    dto: CreateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    const manualTask = this.manualTaskRepository.create({
      userId,
      title: dto.title,
      description: dto.description ?? null,
    });

    const savedTask = await this.manualTaskRepository.save(manualTask);
    return this.mapToResponse(savedTask);
  }

  async updateForUser(
    userId: string,
    taskId: string,
    dto: UpdateManualTaskDto,
  ): Promise<ManualTaskResponseDto> {
    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    const manualTask = await this.getOwnedTask(userId, taskId);
    if (dto.title !== undefined) {
      manualTask.title = dto.title;
    }
    if (dto.description !== undefined) {
      manualTask.description = dto.description;
    }

    const savedTask = await this.manualTaskRepository.save(manualTask);
    return this.mapToResponse(savedTask);
  }

  async deleteForUser(userId: string, taskId: string): Promise<void> {
    const manualTask = await this.getOwnedTask(userId, taskId);
    await this.manualTaskRepository.remove(manualTask);
  }

  private async getOwnedTask(
    userId: string,
    taskId: string,
  ): Promise<ManualTask> {
    const task = await this.manualTaskRepository.findOneBy({
      id: taskId,
      userId,
    });
    if (!task) {
      throw new NotFoundException('Manual task not found');
    }

    return task;
  }

  private mapToResponse(task: ManualTask): ManualTaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
