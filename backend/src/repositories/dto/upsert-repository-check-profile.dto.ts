import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { PreCommitChecksProfileDto } from '../../executions/pre-commit/dto/pre-commit-check-profile.dto';

export class UpsertRepositoryCheckProfileDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PreCommitChecksProfileDto)
  profile!: PreCommitChecksProfileDto;
}
