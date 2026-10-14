import { ENTITY, fixtureId } from './ids.js';
import { BERLIN, LISBON } from './schools.js';

const SCHOOLS = [
  { schoolId: BERLIN, taxRateBp: 1900, amounts: [6500, 60000, 2900, 15000] },
  { schoolId: LISBON, taxRateBp: 2300, amounts: [4500, 42000, 2500, 11000] },
] as const;

const LESSON_TYPES = [
  {
    name: 'Standard lesson',
    kind: 'lesson',
    minutes: 60,
    creditMinutes: 60,
    requiresVehicle: true,
    requiresEntitlement: null,
  },
  {
    name: 'Night drive',
    kind: 'lesson',
    minutes: 45,
    creditMinutes: 60,
    requiresVehicle: true,
    requiresEntitlement: null,
  },
  {
    name: 'Driving exam',
    kind: 'exam',
    minutes: 60,
    creditMinutes: 0,
    requiresVehicle: true,
    requiresEntitlement: 'exam_car',
  },
] as const;

const PRICE_ITEMS = [
  { name: 'Single lesson', kind: 'lesson', creditMinutes: 60, entitlementKind: null },
  { name: '10-lesson package', kind: 'package', creditMinutes: 600, entitlementKind: null },
  {
    name: 'Premium theory',
    kind: 'upsell',
    creditMinutes: null,
    entitlementKind: 'premium_theory',
  },
  { name: 'Car for the exam', kind: 'upsell', creditMinutes: null, entitlementKind: 'exam_car' },
] as const;

export const LESSON_TYPE_FIXTURES = SCHOOLS.flatMap(({ schoolId }, schoolIndex) =>
  LESSON_TYPES.map((lessonType, index) => ({
    schoolId,
    id: fixtureId(ENTITY.lessonType, schoolIndex, index),
    ...lessonType,
    licenceClass: 'B',
  })),
);

export const PRICE_ITEM_FIXTURES = SCHOOLS.flatMap(
  ({ schoolId, taxRateBp, amounts }, schoolIndex) =>
    PRICE_ITEMS.map((item, index) => ({
      schoolId,
      id: fixtureId(ENTITY.priceItem, schoolIndex, index),
      ...item,
      amountMinor: amounts[index] ?? 0,
      currency: 'EUR',
      taxRateBp,
      sortOrder: index + 1,
    })),
);
