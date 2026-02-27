import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { parseOptionalInteger } from '../../common/utils/parse.utils';

const toOptionalInteger = (value: unknown): unknown => {
  return parseOptionalInteger(value, {
    nullAsUndefined: true,
  });
};

export class GetExecutionsQueryDto {
  @Transform(({ value }: { value: unknown }) => toOptionalInteger(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
