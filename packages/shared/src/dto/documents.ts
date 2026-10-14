import { z } from 'zod';
import {
  dateTimeSchema,
  pageQuerySchema,
  pageResponseSchema,
  booleanQuerySchema,
} from './common.js';
import {
  contractStatusSchema,
  documentKindSchema,
  documentMimeSchema,
  documentStatusSchema,
  signerRoleSchema,
} from './enums.js';

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const CONTRACT_BODY_MAX = 100_000;

export const createUploadUrlRequestSchema = z.strictObject({
  kind: documentKindSchema,
  mime: documentMimeSchema,
  sizeBytes: z.number().int().min(1).max(DOCUMENT_MAX_BYTES),
  ownerStudentId: z.uuid().optional(),
});
export type CreateUploadUrlRequest = z.infer<typeof createUploadUrlRequestSchema>;

export const createUploadUrlResponseSchema = z.object({
  documentId: z.uuid(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: dateTimeSchema,
});
export type CreateUploadUrlResponse = z.infer<typeof createUploadUrlResponseSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  ownerStudentId: z.uuid().nullable(),
  kind: documentKindSchema,
  mime: documentMimeSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: documentStatusSchema,
  uploadedBy: z.uuid(),
  uploadedByName: z.string().nullable(),
  createdAt: dateTimeSchema,
});
export type DocumentItem = z.infer<typeof documentSchema>;

export const listDocumentsQuerySchema = pageQuerySchema.extend({
  ownerStudentId: z.uuid().optional(),
  kind: documentKindSchema.optional(),
  status: documentStatusSchema.optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const documentListResponseSchema = pageResponseSchema(documentSchema);
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;

export const documentDownloadUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: dateTimeSchema,
});
export type DocumentDownloadUrlResponse = z.infer<typeof documentDownloadUrlResponseSchema>;

export const contractTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  version: z.number().int().positive(),
  body: z.string(),
  active: z.boolean(),
});
export type ContractTemplate = z.infer<typeof contractTemplateSchema>;

export const listContractTemplatesQuerySchema = pageQuerySchema.extend({
  active: booleanQuerySchema.optional(),
});
export type ListContractTemplatesQuery = z.infer<typeof listContractTemplatesQuerySchema>;

export const contractTemplateListResponseSchema = pageResponseSchema(contractTemplateSchema);
export type ContractTemplateListResponse = z.infer<typeof contractTemplateListResponseSchema>;

export const createContractTemplateRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(CONTRACT_BODY_MAX),
  active: z.boolean().default(true),
});
export type CreateContractTemplateRequest = z.infer<typeof createContractTemplateRequestSchema>;

export const createContractRequestSchema = z.strictObject({
  studentId: z.uuid(),
  templateId: z.uuid(),
});
export type CreateContractRequest = z.infer<typeof createContractRequestSchema>;

export const contractSignatureSchema = z.object({
  id: z.uuid(),
  signerUserId: z.uuid(),
  signerName: z.string(),
  signerRole: signerRoleSchema,
  signedAt: dateTimeSchema,
});
export type ContractSignature = z.infer<typeof contractSignatureSchema>;

export const contractResponseSchema = z.object({
  id: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  templateId: z.uuid(),
  templateVersion: z.number().int().positive(),
  body: z.string(),
  requiresGuardian: z.boolean(),
  requiredSignerRoles: z.array(signerRoleSchema),
  status: contractStatusSchema,
  createdAt: dateTimeSchema,
  completedAt: dateTimeSchema.nullable(),
  signatures: z.array(contractSignatureSchema),
});
export type ContractResponse = z.infer<typeof contractResponseSchema>;

export const signContractRequestSchema = z.strictObject({
  role: signerRoleSchema.optional(),
});
export type SignContractRequest = z.infer<typeof signContractRequestSchema>;

export const signContractResponseSchema = z.object({
  contractId: z.uuid(),
  signatureId: z.uuid(),
  status: contractStatusSchema,
  completedAt: dateTimeSchema.nullable(),
});
export type SignContractResponse = z.infer<typeof signContractResponseSchema>;

export const listContractsQuerySchema = pageQuerySchema.extend({
  studentId: z.uuid().optional(),
  status: contractStatusSchema.optional(),
});
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

export const contractSummarySchema = contractResponseSchema
  .omit({ body: true, signatures: true })
  .extend({
    templateName: z.string(),
    signedRoles: z.array(signerRoleSchema),
  });
export type ContractSummary = z.infer<typeof contractSummarySchema>;

export const contractListResponseSchema = pageResponseSchema(contractSummarySchema);
export type ContractListResponse = z.infer<typeof contractListResponseSchema>;
