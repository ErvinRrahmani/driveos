import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { httpStatusRules } from '../src/http-status.js';

const linter = new Linter({ configType: 'flat' });
const config = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    rules: httpStatusRules,
  },
];

function lint(code) {
  return linter.verify(code, config, 'file.ts').map((m) => m.ruleId);
}

describe('http status lint rules', () => {
  it.each([
    "import { HttpStatus } from '@nestjs/common';",
    '@ApiResponse({ status: 404 }) class A {}',
    "const init = { 'status': 201 };",
    'class A { @HttpCode(200) m() {} }',
    "throw new ApiError(409, 'lesson_conflict', 'x');",
    'request(app).get("/v1/me").expect(401);',
    'expect(res.status).toBe(501);',
    'expect(res.status).toEqual(404);',
    'if (response.status !== 401) {}',
    'if (status >= 500) {}',
    'if (409 === res.statusCode) {}',
  ])('flags %s', (code) => {
    const ruleIds = lint(code);
    expect(ruleIds).toHaveLength(1);
    expect(['no-restricted-imports', 'no-restricted-syntax']).toContain(ruleIds[0]);
  });

  it.each([
    "import { Injectable } from '@nestjs/common';",
    "import { StatusCodes } from 'http-status-codes';",
    '@ApiResponse({ status: StatusCodes.NOT_FOUND }) class A {}',
    'class A { @HttpCode(StatusCodes.OK) m() {} }',
    'request(app).get("/v1/me").expect(StatusCodes.UNAUTHORIZED);',
    'expect(res.status).toBe(StatusCodes.NOT_IMPLEMENTED);',
    'if (status >= StatusCodes.INTERNAL_SERVER_ERROR) {}',
    'const price = { amountMinor: 500, minutes: 120, limit: 200 };',
    'expect(balance).toBe(480);',
    'text.slice(0, 200);',
    "const lesson = { status: 'booked' };",
    'if (count > 100) {}',
    'const z = { status: 42 };',
  ])('allows %s', (code) => {
    expect(lint(code)).toEqual([]);
  });
});
