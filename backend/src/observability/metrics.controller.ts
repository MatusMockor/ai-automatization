import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    reply
      .code(200)
      .header('Content-Type', this.metricsService.contentType())
      .send(await this.metricsService.render());
  }
}
