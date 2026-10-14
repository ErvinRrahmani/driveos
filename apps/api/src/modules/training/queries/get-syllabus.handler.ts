import type { SyllabusResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { ProgressRecords } from '../infra/progress-records.js';
import { GetSyllabusQuery } from './get-syllabus.query.js';

@QueryHandler(GetSyllabusQuery)
export class GetSyllabusHandler implements IQueryHandler<GetSyllabusQuery, SyllabusResponse> {
  constructor(private readonly progress: ProgressRecords) {}

  async execute({ params }: GetSyllabusQuery): Promise<SyllabusResponse> {
    return { items: await this.progress.syllabus(params.licenceClass) };
  }
}
