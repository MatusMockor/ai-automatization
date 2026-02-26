import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const normalizeRequiredString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

export class AddTaskPrefixDto {
  @Transform(({ value }: { value: unknown }) => normalizeRequiredString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  value!: string;
}
