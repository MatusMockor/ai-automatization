import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutionsModule } from '../executions/executions.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRule } from './entities/automation-rule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationRule]),
    RepositoriesModule,
    ExecutionsModule,
  ],
  controllers: [AutomationRulesController],
  providers: [AutomationRulesService],
  exports: [AutomationRulesService],
})
export class AutomationRulesModule {}
