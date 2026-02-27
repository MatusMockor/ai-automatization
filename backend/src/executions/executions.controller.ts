import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { RequestUser } from '../auth/interfaces/request-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateExecutionDto } from './dto/create-execution.dto';
import {
  ExecutionDetailResponseDto,
  ExecutionSummaryResponseDto,
} from './dto/execution-response.dto';
import { GetExecutionsQueryDto } from './dto/get-executions-query.dto';
import { ExecutionsService } from './executions.service';

@Controller('executions')
export class ExecutionsController {
  private readonly logger = new Logger(ExecutionsController.name);

  constructor(private readonly executionsService: ExecutionsService) {}

  @Post()
  createExecution(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateExecutionDto,
  ): Promise<ExecutionSummaryResponseDto> {
    return this.executionsService.createForUser(user.id, dto);
  }

  @Get()
  listExecutions(
    @CurrentUser() user: RequestUser,
    @Query() query: GetExecutionsQueryDto,
  ): Promise<ExecutionSummaryResponseDto[]> {
    return this.executionsService.listForUser(user.id, query);
  }

  @Get(':id')
  getExecution(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) executionId: string,
  ): Promise<ExecutionDetailResponseDto> {
    return this.executionsService.getDetailForUser(user.id, executionId);
  }

  @Get(':id/stream')
  async streamExecution(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) executionId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const stream = await this.executionsService.streamForUser(
      user.id,
      executionId,
    );

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof reply.raw.flushHeaders === 'function') {
      reply.raw.flushHeaders();
    }

    const subscription = stream.subscribe({
      next: (event) => {
        if (reply.raw.writableEnded || reply.raw.destroyed) {
          return;
        }

        const eventType = event.type ?? 'message';
        const data = JSON.stringify(event.data ?? null);
        reply.raw.write(`event: ${eventType}\n`);
        reply.raw.write(`data: ${data}\n\n`);
      },
      complete: () => {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      },
      error: (error: unknown) => {
        if (!reply.raw.writableEnded) {
          this.logger.error('Execution stream failed', error);
          reply.raw.write('event: error\n');
          reply.raw.write(
            `data: ${JSON.stringify({
              message: 'An error occurred while streaming',
            })}\n\n`,
          );
          reply.raw.end();
        }
      },
    });

    reply.raw.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancelExecution(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) executionId: string,
  ): Promise<ExecutionSummaryResponseDto> {
    return this.executionsService.cancelForUser(user.id, executionId);
  }
}
