import { Query } from '../../../kernel/cqrs/index.js';

export interface UserDevice {
  id: string;
  userId: string;
  pushToken: string;
  platform: 'ios' | 'android';
  locale: string;
}

export class ListDevicesForUsersQuery extends Query<UserDevice[]> {
  constructor(readonly userIds: readonly string[]) {
    super();
  }
}
