import { Transform } from 'class-transformer';
import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeTaskKey = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim();
};

export class SnoozeAutomationInboxItemDto {
  @Transform(({ value }: { value: unknown }) => normalizeTaskKey(value))
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  taskKey!: string;

  @IsDateString()
  untilAt!: string;
}
