import { PLAN_FEATURES, type PlanFeature } from '@driveos/shared';

export { PLAN_FEATURES, type PlanFeature };

export const hasFeature = (features: readonly string[], feature: PlanFeature): boolean =>
  features.includes(feature);
