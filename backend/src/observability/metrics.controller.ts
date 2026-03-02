import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  private readonly enabled: boolean;

  constructor(
    private readonly metricsService: MetricsService,
    configService: ConfigService,
  ) {
    const enabledFlag = (
      configService.get<string>('ENABLE_METRICS', 'false') ?? 'false'
    )
      .trim()
      .toLowerCase();
    this.enabled = ['1', 'true', 'yes', 'on'].includes(enabledFlag);
  }

  @Public()
  @Get()
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    if (!this.enabled) {
      throw new NotFoundException();
    }

    reply
      .code(200)
      .header('Content-Type', this.metricsService.contentType())
      .send(await this.metricsService.render());
  }
}
