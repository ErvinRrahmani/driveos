import { applyDecorators, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

const IDEMPOTENT = Symbol('idempotent');

export function Idempotent(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT, true),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description: 'Client-chosen key; a retry with the same key and body replays the response.',
      schema: { type: 'string', minLength: 1, maxLength: IDEMPOTENCY_KEY_MAX_LENGTH },
    }),
  );
}

export function isIdempotentRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(IDEMPOTENT, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
