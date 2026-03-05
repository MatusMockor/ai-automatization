import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { RepositoryResponseDto } from './dto/repository-response.dto';
import { UpsertRepositoryCheckProfileDto } from './dto/upsert-repository-check-profile.dto';
import { RepositoriesService } from './repositories.service';

@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  listRepositories(
    @CurrentUser() user: RequestUser,
  ): Promise<RepositoryResponseDto[]> {
    return this.repositoriesService.listForUser(user.id);
  }

  @Post()
  createRepository(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.createForUser(user.id, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  async deleteRepository(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) repositoryId: string,
  ): Promise<void> {
    await this.repositoriesService.deleteForUser(user.id, repositoryId);
  }

  @HttpCode(200)
  @Post(':id/sync')
  syncRepository(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) repositoryId: string,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.syncForUser(user.id, repositoryId);
  }

  @Put(':id/check-profile')
  upsertRepositoryCheckProfile(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) repositoryId: string,
    @Body() dto: UpsertRepositoryCheckProfileDto,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.upsertCheckProfileForUser(
      user.id,
      repositoryId,
      dto,
    );
  }

  @HttpCode(204)
  @Delete(':id/check-profile')
  async deleteRepositoryCheckProfile(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) repositoryId: string,
  ): Promise<void> {
    await this.repositoriesService.deleteCheckProfileForUser(
      user.id,
      repositoryId,
    );
  }
}
