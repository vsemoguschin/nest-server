import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponse } from '../errors/error.response';

const json = (val: unknown) => ({
  'application/json': {
    schema: { $ref: getSchemaPath(ErrorResponse) },
    examples: val as Record<string, { summary: string; value: any }>,
  },
});

/** Стандартный набор ошибок с общими примерами (без instance) */
export const ApiErrorResponsesDefault = () =>
  applyDecorators(
    ApiExtraModels(ErrorResponse),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
      content: json({
        ValidationError: {
          summary: 'Validation error',
          value: {
            status: 400,
            title: 'Bad Request',
            detail: 'Invalid input',
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      content: json({
        MissingOrExpiredJWT: {
          summary: 'Missing/expired token',
          value: {
            status: 401,
            title: 'Unauthorized',
            detail: 'JWT token is missing or expired',
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden',
      content: json({
        Forbidden: {
          summary: 'Access denied',
          value: {
            status: 403,
            title: 'Forbidden',
            detail: 'You do not have access to this resource',
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 500,
      description: 'Server Error',
      content: json({
        Unexpected: {
          summary: 'Unexpected error',
          value: {
            status: 500,
            title: 'Internal Server Error',
            detail: 'Unexpected error occurred',
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
  );

/** Вариант с указанием instance (путь эндпоинта) для примеров */
export const ApiErrorResponses = (instance: string) =>
  applyDecorators(
    ApiExtraModels(ErrorResponse),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
      content: json({
        ValidationError: {
          summary: 'Validation error',
          value: {
            status: 400,
            title: 'Bad Request',
            detail: 'Invalid query parameter: page',
            instance,
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      content: json({
        MissingOrExpiredJWT: {
          summary: 'Missing/expired token',
          value: {
            status: 401,
            title: 'Unauthorized',
            detail: 'JWT token is missing or expired',
            instance,
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden',
      content: json({
        Forbidden: {
          summary: 'Access denied',
          value: {
            status: 403,
            title: 'Forbidden',
            detail: 'You do not have access to this resource',
            instance,
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
    ApiResponse({
      status: 500,
      description: 'Server Error',
      content: json({
        Unexpected: {
          summary: 'Unexpected error',
          value: {
            status: 500,
            title: 'Internal Server Error',
            detail: 'Unexpected error occurred',
            instance,
            timestamp: '2025-08-29T10:15:00.000Z',
          },
        },
      }),
    }),
  );
