import type { DocumentItem } from '@driveos/shared';
import { documentKindSchema, documentMimeSchema } from '@driveos/shared';
import type { documents } from './schema.js';

export type DocumentRow = typeof documents.$inferSelect;

export function toDocumentItem(row: DocumentRow, uploaderName: string | null): DocumentItem {
  return {
    id: row.id,
    ownerStudentId: row.ownerStudentId,
    kind: documentKindSchema.parse(row.kind),
    mime: documentMimeSchema.parse(row.mime),
    sizeBytes: row.sizeBytes,
    status: row.status,
    uploadedBy: row.uploadedBy,
    uploadedByName: uploaderName,
    createdAt: row.createdAt.toISOString(),
  };
}
