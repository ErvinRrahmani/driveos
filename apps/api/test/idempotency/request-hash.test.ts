import { describe, expect, it } from 'vitest';
import { canonicalJson, requestHash } from '../../src/kernel/idempotency/request-hash.js';

describe('canonicalJson', () => {
  it('sorts object keys recursively and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('drops undefined object values like JSON.stringify and encodes a missing body as null', () => {
    expect(canonicalJson({ a: undefined, b: 'x' })).toBe('{"b":"x"}');
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('requestHash', () => {
  const base = { method: 'POST', path: '/v1/ping', body: { message: 'hi', n: 1 } };

  it('is a sha256 hex digest that ignores key order', () => {
    const hash = requestHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash({ ...base, body: { n: 1, message: 'hi' } })).toBe(hash);
  });

  it('changes with the method, the path or the body', () => {
    const hash = requestHash(base);
    expect(requestHash({ ...base, method: 'PUT' })).not.toBe(hash);
    expect(requestHash({ ...base, path: '/v1/pong' })).not.toBe(hash);
    expect(requestHash({ ...base, body: { message: 'hi', n: 2 } })).not.toBe(hash);
  });
});
