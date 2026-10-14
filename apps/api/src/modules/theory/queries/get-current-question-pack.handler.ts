import type { QuestionPack } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type { Principal } from '../../../kernel/auth/principal.js';
import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { GetSchoolQuery } from '../../school/index.js';
import { GetStudentByUserQuery, GetStudentQuery } from '../../training/index.js';
import { QuestionPacksRepository } from '../infra/question-packs.repository.js';
import { GetCurrentQuestionPackQuery } from './get-current-question-pack.query.js';

interface PackChoice {
  licenceClass?: string;
  language?: string;
}

@QueryHandler(GetCurrentQuestionPackQuery)
export class GetCurrentQuestionPackHandler implements IQueryHandler<
  GetCurrentQuestionPackQuery,
  QuestionPack
> {
  constructor(
    private readonly packs: QuestionPacksRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ actor, params }: GetCurrentQuestionPackQuery): Promise<QuestionPack> {
    const { licenceClass, language } = await this.choice(actor, params);
    if (!licenceClass)
      throw invalidField(['licenceClass'], 'Required for callers without a student profile');
    if (!language)
      throw invalidField(['language'], 'Required for callers without a student profile');
    const school = await this.queryBus.execute(new GetSchoolQuery());
    const pack = await this.packs.latestPublished({
      countryCode: school.countryCode,
      licenceClass,
      language,
    });
    if (!pack?.publishedAt) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'question_pack_missing',
        t('errors.question_pack_missing'),
      );
    }
    return {
      id: pack.id,
      countryCode: pack.countryCode,
      licenceClass: pack.licenceClass,
      language: pack.language,
      version: pack.version,
      questionCount: await this.packs.questionCount(pack.id),
      categories: await this.packs.categories(pack.id),
      exam: pack.exam,
      publishedAt: pack.publishedAt.toISOString(),
    };
  }

  private async choice(actor: Principal, params: PackChoice): Promise<PackChoice> {
    if (params.licenceClass && params.language) return params;
    const profile = await this.queryBus.execute(new GetStudentByUserQuery(actor.userId));
    if (!profile) return params;
    const student = await this.queryBus.execute(new GetStudentQuery(actor, profile.studentId));
    return {
      licenceClass: params.licenceClass ?? student.licenceClass,
      language: params.language ?? student.examLanguage,
    };
  }
}
