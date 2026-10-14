import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown,
): z.output<TSchema> {
  return schema.parse(body);
}

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    return this.schema.parse(value);
  }
}
