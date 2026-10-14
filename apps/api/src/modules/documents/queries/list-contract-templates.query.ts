import type {
  ContractTemplateListResponse,
  ListContractTemplatesQuery as ListContractTemplatesParams,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListContractTemplatesQuery extends Query<ContractTemplateListResponse> {
  constructor(readonly params: ListContractTemplatesParams) {
    super();
  }
}
