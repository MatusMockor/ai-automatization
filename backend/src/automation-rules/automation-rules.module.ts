import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionsModule } from '../executions/executions.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { SyncedTask } from '../tasks/entities/synced-task.entity';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRule } from './entities/automation-rule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationRule, SyncedTask]),
    RepositoriesModule,
    ExecutionsModule,
  ],
  controllers: [AutomationRulesController],
  providers: [AutomationRulesService],
  exports: [AutomationRulesService],
})
export class AutomationRulesModule {}
