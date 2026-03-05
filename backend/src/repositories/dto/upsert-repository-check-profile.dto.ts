import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { PreCommitChecksProfileDto } from '../../executions/pre-commit/dto/pre-commit-check-profile.dto';

export class UpsertRepositoryCheckProfileDto {
  @ValidateNested()
  @Type(() => PreCommitChecksProfileDto)
  profile!: PreCommitChecksProfileDto;
}
