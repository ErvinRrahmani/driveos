import { Inject } from '@nestjs/common';
import type { StaffListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { MembershipDirectory } from '../../identity/index.js';
import { ListStaffQuery } from './list-staff.query.js';

@QueryHandler(ListStaffQuery)
export class ListStaffHandler implements IQueryHandler<ListStaffQuery, StaffListResponse> {
  constructor(@Inject(MembershipDirectory) private readonly directory: MembershipDirectory) {}

  async execute({ params }: ListStaffQuery): Promise<StaffListResponse> {
    const cursor = idCursor(params.cursor);
    const staff = (await this.directory.listStaff())
      .filter((member) => !params.role || member.roles.includes(params.role))
      .filter((member) => !cursor || member.membershipId > cursor)
      .sort((a, b) => a.membershipId.localeCompare(b.membershipId));
    return pageOf(staff, params.limit, (member) => member.membershipId);
  }
}
