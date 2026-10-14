import { ENTITY, seedId } from './ids.js';

export const BERLIN = seedId(ENTITY.school, 1);
export const LISBON = seedId(ENTITY.school, 2);

export const SCHOOL_FIXTURES = [
  {
    id: BERLIN,
    name: 'Fahrschule Spree',
    legalName: 'Fahrschule Spree GmbH',
    taxId: 'DE000000001',
    address: 'Unter den Linden 1, 10117 Berlin',
    countryCode: 'DE',
    timeZone: 'Europe/Berlin',
    currency: 'EUR',
    locale: 'en',
    status: 'active',
  },
  {
    id: LISBON,
    name: 'Escola de Condução Tejo',
    legalName: 'Escola de Condução Tejo, Lda.',
    taxId: 'PT000000002',
    address: 'Rua Augusta 1, 1100-053 Lisboa',
    countryCode: 'PT',
    timeZone: 'Europe/Lisbon',
    currency: 'EUR',
    locale: 'en',
    status: 'active',
  },
] as const;

export const BRANCH_FIXTURES = [
  {
    schoolId: BERLIN,
    id: seedId(ENTITY.branch, 1),
    name: 'Mitte',
    address: 'Unter den Linden 1, 10117 Berlin',
    lat: 52.5170365,
    lng: 13.3888599,
  },
  {
    schoolId: LISBON,
    id: seedId(ENTITY.branch, 2),
    name: 'Baixa',
    address: 'Rua Augusta 1, 1100-053 Lisboa',
    lat: 38.7086,
    lng: -9.1366,
  },
] as const;

export const VEHICLE_FIXTURES = [
  {
    schoolId: BERLIN,
    id: seedId(ENTITY.vehicle, 1),
    branchId: seedId(ENTITY.branch, 1),
    plate: 'B-DS 101',
    makeModel: 'VW Golf',
    transmission: 'manual',
  },
  {
    schoolId: BERLIN,
    id: seedId(ENTITY.vehicle, 2),
    branchId: seedId(ENTITY.branch, 1),
    plate: 'B-DS 102',
    makeModel: 'VW ID.3',
    transmission: 'automatic',
  },
  {
    schoolId: LISBON,
    id: seedId(ENTITY.vehicle, 3),
    branchId: seedId(ENTITY.branch, 2),
    plate: 'AA-00-XX',
    makeModel: 'Renault Clio',
    transmission: 'manual',
  },
] as const;

export const PLAN_FIXTURES = [
  {
    id: seedId(ENTITY.plan, 1),
    code: 'solo',
    name: 'Solo',
    baseAmountMinor: 0,
    studentFeeMinor: 300,
    currency: 'EUR',
    maxInstructorSeats: 1,
    features: [],
  },
  {
    id: seedId(ENTITY.plan, 2),
    code: 'standard',
    name: 'Standard',
    baseAmountMinor: 4900,
    studentFeeMinor: 300,
    currency: 'EUR',
    maxInstructorSeats: null,
    features: ['enrolment_page'],
  },
] as const;
