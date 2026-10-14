import type {
  ContractListResponse,
  ContractResponse,
  ContractSummary,
  ContractSignature,
  ContractTemplate,
  ContractTemplateListResponse,
  CreateContractRequest,
  CreateContractTemplateRequest,
  CreateUploadUrlRequest,
  CreateUploadUrlResponse,
  DocumentDownloadUrlResponse,
  DocumentItem,
  DocumentListResponse,
  ListContractsQuery,
  ListContractTemplatesQuery,
  ListDocumentsQuery,
  SignContractRequest,
  SignContractResponse,
} from '../documents.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const document = {
  id: ids.document,
  ownerStudentId: ids.student,
  kind: 'eye_test',
  mime: 'application/pdf',
  sizeBytes: 182_400,
  status: 'ready',
  uploadedBy: ids.studentUser,
  uploadedByName: 'Stella Student',
  createdAt: '2026-10-03T14:20:00.000Z',
} satisfies DocumentItem;

const template = {
  id: ids.contractTemplate,
  name: 'Training contract (class B)',
  version: 1,
  body: 'SAMPLE: Training contract between Fahrschule Spree and {{student.fullName}} …',
  active: true,
} satisfies ContractTemplate;

const signature = {
  id: ids.contractSignature,
  signerUserId: ids.guardianUser,
  signerName: 'Gustav Minor',
  signerRole: 'guardian',
  signedAt: '2026-10-04T19:02:00.000Z',
} satisfies ContractSignature;

const contractSummary = {
  id: ids.contract,
  studentId: ids.minorStudent,
  studentName: 'Mia Minor',
  templateId: ids.contractTemplate,
  templateName: 'Training contract (class B)',
  templateVersion: 1,
  requiresGuardian: true,
  requiredSignerRoles: ['student', 'guardian'],
  signedRoles: ['guardian'],
  status: 'pending',
  createdAt: '2026-10-04T18:00:00.000Z',
  completedAt: null,
} satisfies ContractSummary;

export const documentsSamples = {
  createUploadUrlRequest: {
    kind: 'eye_test',
    mime: 'application/pdf',
    sizeBytes: 182_400,
    ownerStudentId: ids.student,
  } satisfies CreateUploadUrlRequest,
  createUploadUrlResponse: {
    documentId: ids.document,
    uploadUrl:
      'http://localhost:9000/driveos-documents/0192f000-0001-7000-8000-000000000001/0192f000-0116-7000-8000-000000000001?X-Amz-Signature=sample',
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf', 'x-amz-server-side-encryption': 'AES256' },
    expiresAt: '2026-10-03T14:25:00.000Z',
  } satisfies CreateUploadUrlResponse,
  document,
  listDocumentsQuery: {
    ownerStudentId: ids.student,
    status: 'ready',
    limit: 50,
  } satisfies ListDocumentsQuery,
  documentListResponse: { items: [document], nextCursor: null } satisfies DocumentListResponse,
  documentDownloadUrlResponse: {
    url: 'http://localhost:9000/driveos-documents/0192f000-0001-7000-8000-000000000001/0192f000-0116-7000-8000-000000000001?X-Amz-Signature=sample-get',
    expiresAt: '2026-10-06T10:05:00.000Z',
  } satisfies DocumentDownloadUrlResponse,
  contractTemplate: template,
  listContractTemplatesQuery: { active: 'true', limit: 50 } satisfies ListContractTemplatesQuery,
  contractTemplateListResponse: {
    items: [template],
    nextCursor: null,
  } satisfies ContractTemplateListResponse,
  createContractTemplateRequest: {
    name: 'Training contract (class A)',
    body: 'SAMPLE: Training contract for motorcycles …',
    active: true,
  } satisfies CreateContractTemplateRequest,
  createContractRequest: {
    studentId: ids.minorStudent,
    templateId: ids.contractTemplate,
  } satisfies CreateContractRequest,
  contractSignature: signature,
  contractResponse: {
    id: ids.contract,
    studentId: ids.minorStudent,
    studentName: 'Mia Minor',
    templateId: ids.contractTemplate,
    templateVersion: 1,
    body: 'SAMPLE: Training contract between Fahrschule Spree and Mia Minor …',
    requiresGuardian: true,
    requiredSignerRoles: ['student', 'guardian'],
    status: 'pending',
    createdAt: '2026-10-04T18:00:00.000Z',
    completedAt: null,
    signatures: [signature],
  } satisfies ContractResponse,
  signContractRequest: { role: 'guardian' } satisfies SignContractRequest,
  signContractResponse: {
    contractId: ids.contract,
    signatureId: ids.contractSignature,
    status: 'pending',
    completedAt: null,
  } satisfies SignContractResponse,
  listContractsQuery: { studentId: ids.minorStudent, limit: 50 } satisfies ListContractsQuery,
  contractSummary,
  contractListResponse: {
    items: [contractSummary],
    nextCursor: null,
  } satisfies ContractListResponse,
};
