import { applyDecorators, HttpCode } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  type ApiParamOptions,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { jsonSchemaOf, type SchemaName, schemaRef } from './schemas.js';

type ParamSchema = Extract<ApiParamOptions, { schema: unknown }>['schema'];

export type SuccessStatus =
  StatusCodes.OK | StatusCodes.CREATED | StatusCodes.ACCEPTED | StatusCodes.NO_CONTENT;

export interface ApiRouteSpec {
  operationId: string;
  summary: string;
  status: SuccessStatus;
  response?: SchemaName;
  produces?: 'application/pdf';
  body?: SchemaName;
  query?: SchemaName;
  params?: SchemaName | Readonly<Record<string, ParamSchema>>;
  public?: true;
}

export const UUID_PARAM: ParamSchema = { type: 'string', format: 'uuid' };

interface ObjectSchema {
  properties?: Record<string, ParamSchema>;
  required?: string[];
}

function fieldsOf(name: SchemaName): { name: string; required: boolean; schema: ParamSchema }[] {
  const schema = jsonSchemaOf(name) as ObjectSchema;
  if (!schema.properties) throw new Error(`${name} is not an object schema`);
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([field, fieldSchema]) => ({
    name: field,
    required: required.has(field),
    schema: fieldSchema,
  }));
}

function successResponse(spec: ApiRouteSpec): MethodDecorator & ClassDecorator {
  if (spec.produces) {
    return applyDecorators(
      ApiProduces(spec.produces),
      ApiResponse({
        status: spec.status,
        content: { [spec.produces]: { schema: { type: 'string', format: 'binary' } } },
      }),
    );
  }
  if (!spec.response) return ApiResponse({ status: spec.status, description: 'No content' });
  return ApiResponse({ status: spec.status, schema: schemaRef(spec.response) });
}

export function ApiRoute(spec: ApiRouteSpec) {
  const error = { schema: schemaRef('ErrorResponse') };
  const decorators: (MethodDecorator | ClassDecorator)[] = [
    HttpCode(spec.status),
    ApiOperation({ operationId: spec.operationId, summary: spec.summary }),
    successResponse(spec),
  ];
  if (!spec.public) decorators.push(ApiBearerAuth(), ApiUnauthorizedResponse(error));
  if (spec.body) decorators.push(ApiBody({ schema: schemaRef(spec.body) }));
  if (spec.query) {
    for (const field of fieldsOf(spec.query)) decorators.push(ApiQuery(field));
  }
  if (spec.body || spec.query) decorators.push(ApiBadRequestResponse(error));
  if (spec.params) {
    const params =
      typeof spec.params === 'string'
        ? fieldsOf(spec.params)
        : Object.entries(spec.params).map(([name, schema]) => ({ name, schema }));
    for (const { name, schema } of params)
      decorators.push(ApiParam({ name, required: true, schema }));
    decorators.push(ApiNotFoundResponse(error));
  }
  return applyDecorators(...decorators);
}
