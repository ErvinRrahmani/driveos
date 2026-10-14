import type { SchoolResponse } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import {
  GetPaymentAccountQuery,
  GetSchoolQuery,
  GetSchoolSettingsQuery,
  type SchoolPaymentAccount,
} from '../../school/index.js';

@Injectable()
export class SchoolFacts {
  constructor(private readonly queryBus: QueryBus) {}

  async currency(): Promise<string> {
    return (await this.profile()).currency;
  }

  profile(): Promise<SchoolResponse> {
    return this.queryBus.execute(new GetSchoolQuery());
  }

  paymentAccount(): Promise<SchoolPaymentAccount | null> {
    return this.queryBus.execute(new GetPaymentAccountQuery());
  }

  async allowsNegativeBalance(): Promise<boolean> {
    return (await this.queryBus.execute(new GetSchoolSettingsQuery())).allowNegativeBalance;
  }

  async checkoutEnabled(): Promise<boolean> {
    return (await this.paymentAccount())?.status === 'active';
  }
}
