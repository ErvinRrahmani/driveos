// HTTP status codes come from `http-status-codes` (StatusCodes / ReasonPhrases),
// never from numeric literals or Nest's HttpStatus. These selectors only match a
// literal 100-599 where it is used as an HTTP status, so other numbers stay legal.

const MESSAGE = 'Use StatusCodes.X from http-status-codes instead of a numeric HTTP status.';
const HTTP_STATUS = 'Literal[raw=/^[1-5][0-9][0-9]$/]';
const STATUS_NAME = '/^status(Code)?$/';
const COMPARISON = '/^([!=]==?|[<>]=?)$/';

export const httpStatusSelectors = [
  // { status: 201 } in @ApiResponse and the other swagger decorators, MSW and fetch Response init
  `Property[key.name=${STATUS_NAME}] > ${HTTP_STATUS}.value`,
  `Property[key.value=${STATUS_NAME}] > ${HTTP_STATUS}.value`,
  // @HttpCode(200)
  `CallExpression[callee.name='HttpCode'] > ${HTTP_STATUS}.arguments`,
  // new ApiError(404, ...)
  `NewExpression[callee.name='ApiError'] > ${HTTP_STATUS}.arguments:first-child`,
  // supertest .expect(201)
  `CallExpression[callee.type='MemberExpression'][callee.property.name='expect'] > ${HTTP_STATUS}.arguments:first-child`,
  // expect(res.status).toBe(404)
  `CallExpression[callee.property.name=/^(toBe|toEqual|toStrictEqual)$/][callee.object.callee.name='expect'][callee.object.arguments.0.property.name=${STATUS_NAME}] > ${HTTP_STATUS}.arguments`,
  // res.status === 401, status >= 500
  `BinaryExpression[operator=${COMPARISON}][left.property.name=${STATUS_NAME}] > ${HTTP_STATUS}.right`,
  `BinaryExpression[operator=${COMPARISON}][right.property.name=${STATUS_NAME}] > ${HTTP_STATUS}.left`,
  `BinaryExpression[operator=${COMPARISON}][left.name=${STATUS_NAME}] > ${HTTP_STATUS}.right`,
  `BinaryExpression[operator=${COMPARISON}][right.name=${STATUS_NAME}] > ${HTTP_STATUS}.left`,
];

export const httpStatusRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: '@nestjs/common',
          importNames: ['HttpStatus'],
          message: 'Use StatusCodes from http-status-codes instead of HttpStatus.',
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    ...httpStatusSelectors.map((selector) => ({ selector, message: MESSAGE })),
  ],
};
