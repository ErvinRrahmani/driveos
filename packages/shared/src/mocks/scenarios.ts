import type { SessionResponse } from '../dto/index.js';
import { ENTITY, seedId } from './fixtures/ids.js';
import { sessionResponse } from './identity.js';
import type { MockStore } from './store.js';

export type MockRole = 'owner' | 'office' | 'instructor' | 'student' | 'parent' | 'platform_admin';

const USER_BY_ROLE: Record<MockRole, number> = {
  platform_admin: 1,
  owner: 2,
  office: 3,
  instructor: 4,
  student: 6,
  parent: 11,
};

export const scenarios = {
  loggedInAs:
    (role: MockRole) =>
    (store: MockStore): SessionResponse =>
      sessionResponse(store, store.createSession(seedId(ENTITY.user, USER_BY_ROLE[role]))),
};
