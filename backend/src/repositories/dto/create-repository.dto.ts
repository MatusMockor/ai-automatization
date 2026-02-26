import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

const FULL_NAME_PATTERN = /^[a-z0-9._-]+\/[a-z0-9._-]+$/;

export class CreateRepositoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(255)
  @Matches(FULL_NAME_PATTERN, {
    message:
      'fullName must match owner/repo and contain only letters, numbers, ".", "_" or "-".',
  })
  fullName!: string;
}
