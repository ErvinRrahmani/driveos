import { z } from 'zod';
import { dateTimeSchema } from '../dto/common.js';
import { signerRoleSchema } from '../dto/enums.js';
import { defineEvent } from './define-event.js';

export const DocumentUploaded = defineEvent({
  type: 'DocumentUploaded',
  version: 1,
  schema: z.object({
    documentId: z.uuid(),
    ownerStudentId: z.uuid().nullable(),
    kind: z.string().min(1),
    mime: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    uploadedBy: z.uuid(),
  }),
});

export const ContractCreated = defineEvent({
  type: 'ContractCreated',
  version: 1,
  schema: z.object({
    contractId: z.uuid(),
    studentId: z.uuid(),
    templateId: z.uuid(),
    templateVersion: z.number().int().positive(),
    requiresGuardian: z.boolean(),
    signerUserIds: z.array(z.uuid()),
  }),
});

export const ContractSigned = defineEvent({
  type: 'ContractSigned',
  version: 1,
  schema: z.object({
    contractId: z.uuid(),
    studentId: z.uuid(),
    signatureId: z.uuid(),
    signerUserId: z.uuid(),
    signerRole: signerRoleSchema,
    signedAt: dateTimeSchema,
  }),
});

export const ContractCompleted = defineEvent({
  type: 'ContractCompleted',
  version: 1,
  schema: z.object({
    contractId: z.uuid(),
    studentId: z.uuid(),
    completedAt: dateTimeSchema,
  }),
});
