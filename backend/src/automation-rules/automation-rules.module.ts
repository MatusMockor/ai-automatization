import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRule } from './entities/automation-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule]), RepositoriesModule],
  controllers: [AutomationRulesController],
  providers: [AutomationRulesService],
  exports: [AutomationRulesService],
})
export class AutomationRulesModule {}
