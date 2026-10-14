import type { ContractResponse, ContractSummary } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { requiredSignerRoles } from '../domain/contract-signing.js';
import { People } from './people.js';
import { contractSignatures, contracts, contractTemplates } from './schema.js';

export type ContractRow = typeof contracts.$inferSelect;

@Injectable()
export class ContractViews {
  constructor(
    private readonly tenant: TenantContext,
    private readonly people: People,
  ) {}

  async detail(row: ContractRow): Promise<ContractResponse> {
    const signatures = await this.tenant.tx
      .select()
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, row.id))
      .orderBy(asc(contractSignatures.signedAt), asc(contractSignatures.id));
    const signerNames = await this.people.userNames(signatures.map((s) => s.signerUserId));
    const studentNames = await this.people.studentNames([row.studentId]);
    return {
      id: row.id,
      studentId: row.studentId,
      studentName: studentNames.get(row.studentId) ?? '',
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      body: row.bodySnapshot,
      requiresGuardian: row.requiresGuardian,
      requiredSignerRoles: requiredSignerRoles(row.requiresGuardian),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      signatures: signatures.map((signature) => ({
        id: signature.id,
        signerUserId: signature.signerUserId,
        signerName: signerNames.get(signature.signerUserId) ?? '',
        signerRole: signature.signerRole,
        signedAt: signature.signedAt.toISOString(),
      })),
    };
  }

  async summaries(rows: readonly ContractRow[]): Promise<ContractSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const signatures = await this.tenant.tx
      .select({ contractId: contractSignatures.contractId, role: contractSignatures.signerRole })
      .from(contractSignatures)
      .where(inArray(contractSignatures.contractId, ids));
    const templates = await this.tenant.tx
      .select({ id: contractTemplates.id, name: contractTemplates.name })
      .from(contractTemplates)
      .where(inArray(contractTemplates.id, [...new Set(rows.map((row) => row.templateId))]));
    const templateNames = new Map(templates.map((template) => [template.id, template.name]));
    const studentNames = await this.people.studentNames(rows.map((row) => row.studentId));
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: studentNames.get(row.studentId) ?? '',
      templateId: row.templateId,
      templateName: templateNames.get(row.templateId) ?? '',
      templateVersion: row.templateVersion,
      requiresGuardian: row.requiresGuardian,
      requiredSignerRoles: requiredSignerRoles(row.requiresGuardian),
      signedRoles: signatures.filter((s) => s.contractId === row.id).map((s) => s.role),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));
  }
}
