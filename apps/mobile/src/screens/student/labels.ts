import type { TFunction } from 'i18next';

export function lessonStatusLabel(t: TFunction, status: string, lateCancel: boolean): string {
  switch (status) {
    case 'booked':
      return t('lessonStatus.booked');
    case 'completed':
      return t('lessonStatus.completed');
    case 'no_show':
      return t('lessonStatus.noShow');
    default:
      return lateCancel ? t('lessonStatus.lateCancelled') : t('lessonStatus.cancelled');
  }
}

export function ledgerEntryLabel(t: TFunction, entryType: string): string {
  switch (entryType) {
    case 'purchase':
      return t('ledger.purchase');
    case 'debit':
      return t('ledger.debit');
    case 'restore':
      return t('ledger.restore');
    case 'refund':
      return t('ledger.refund');
    default:
      return t('ledger.adjustment');
  }
}

export function documentKindLabel(t: TFunction, kind: string): string {
  switch (kind) {
    case 'id_document':
      return t('documentKind.idDocument');
    case 'medical_certificate':
      return t('documentKind.medicalCertificate');
    case 'eye_test':
      return t('documentKind.eyeTest');
    case 'first_aid_certificate':
      return t('documentKind.firstAid');
    case 'photo':
      return t('documentKind.photo');
    case 'learner_permit':
      return t('documentKind.learnerPermit');
    default:
      return t('documentKind.other');
  }
}

export function signerRoleLabel(t: TFunction, role: string): string {
  switch (role) {
    case 'student':
      return t('signerRole.student');
    case 'guardian':
      return t('signerRole.guardian');
    default:
      return t('signerRole.school');
  }
}
