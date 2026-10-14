import { describe, expect, it } from 'vitest';
import {
  heldSignerRoles,
  isContractComplete,
  requiredSignerRoles,
  signerRoleFor,
} from '../../../src/modules/documents/domain/contract-signing.js';

describe('requiredSignerRoles', () => {
  it('asks only the student of an adult and the student plus a guardian of a minor', () => {
    expect(requiredSignerRoles(false)).toEqual(['student']);
    expect(requiredSignerRoles(true)).toEqual(['student', 'guardian']);
  });
});

describe('isContractComplete', () => {
  it("is not complete for a minor with only the student's signature", () => {
    expect(isContractComplete(true, ['student'])).toBe(false);
    expect(isContractComplete(true, ['guardian'])).toBe(false);
    expect(isContractComplete(true, ['student', 'guardian'])).toBe(true);
  });

  it("is complete for an adult with the student's signature", () => {
    expect(isContractComplete(false, [])).toBe(false);
    expect(isContractComplete(false, ['student'])).toBe(true);
  });
});

describe('heldSignerRoles', () => {
  const people = { studentUserId: 'u-student', guardianUserIds: ['u-mum', 'u-dad'] };

  it('derives the roles a user holds on a contract', () => {
    expect(heldSignerRoles('u-student', people)).toEqual(['student']);
    expect(heldSignerRoles('u-dad', people)).toEqual(['guardian']);
    expect(heldSignerRoles('u-office', people)).toEqual([]);
    expect(heldSignerRoles('u-student', { studentUserId: null, guardianUserIds: [] })).toEqual([]);
  });
});

describe('signerRoleFor', () => {
  const minor = { required: requiredSignerRoles(true), signed: [] as const };

  it('picks the only role the signer holds', () => {
    expect(signerRoleFor({ ...minor, held: ['guardian'] })).toEqual({ ok: true, role: 'guardian' });
    expect(signerRoleFor({ ...minor, held: ['student'] })).toEqual({ ok: true, role: 'student' });
  });

  it('rejects people who are neither the student nor a consenting guardian', () => {
    expect(signerRoleFor({ ...minor, held: [] })).toEqual({ ok: false, reason: 'not_a_signer' });
  });

  it('lets the requested role narrow but never claim a role the signer does not hold', () => {
    expect(signerRoleFor({ ...minor, held: ['student'], requested: 'guardian' })).toEqual({
      ok: false,
      reason: 'not_a_signer',
    });
    expect(signerRoleFor({ ...minor, held: ['student'], requested: 'school' })).toEqual({
      ok: false,
      reason: 'not_a_signer',
    });
    expect(
      signerRoleFor({ ...minor, held: ['student', 'guardian'], requested: 'guardian' }),
    ).toEqual({ ok: true, role: 'guardian' });
  });

  it('refuses a second signature in the same role', () => {
    expect(signerRoleFor({ ...minor, held: ['student'], signed: ['student'] })).toEqual({
      ok: false,
      reason: 'already_signed',
    });
    expect(
      signerRoleFor({ ...minor, held: ['guardian'], signed: ['guardian'], requested: 'guardian' }),
    ).toEqual({ ok: false, reason: 'already_signed' });
  });

  it('signs the next missing role for someone who holds both', () => {
    expect(signerRoleFor({ ...minor, held: ['student', 'guardian'], signed: ['student'] })).toEqual(
      { ok: true, role: 'guardian' },
    );
  });

  it('does not take a guardian signature on an adult contract', () => {
    expect(
      signerRoleFor({ required: requiredSignerRoles(false), signed: [], held: ['guardian'] }),
    ).toEqual({ ok: false, reason: 'not_required' });
  });
});
