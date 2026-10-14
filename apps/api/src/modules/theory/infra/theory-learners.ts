import type { TheoryQuestion } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { StatusCodes } from 'http-status-codes';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../adapters/storage/object-storage.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { HasEntitlementQuery } from '../../billing/index.js';
import { GetSchoolQuery, GetSchoolSettingsQuery } from '../../school/index.js';
import { GetStudentByUserQuery, GetStudentQuery } from '../../training/index.js';
import { type QuestionPackRecord, QuestionPacksRepository } from './question-packs.repository.js';
import type { QuestionRecord } from './questions.repository.js';

export const MEDIA_URL_TTL_SECONDS = 300;

export interface Learner {
  studentId: string;
  licenceClass: string;
  examLanguage: string;
}

@Injectable()
export class TheoryLearners {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly packs: QuestionPacksRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async ownStudentId(actor: Principal): Promise<string | null> {
    const profile = await this.queryBus.execute(new GetStudentByUserQuery(actor.userId));
    return profile?.studentId ?? null;
  }

  async self(actor: Principal): Promise<Learner> {
    const studentId = await this.ownStudentId(actor);
    if (!studentId) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
    }
    return this.of(actor, studentId);
  }

  async of(actor: Principal, studentId: string): Promise<Learner> {
    const student = await this.queryBus.execute(new GetStudentQuery(actor, studentId));
    return {
      studentId: student.id,
      licenceClass: student.licenceClass,
      examLanguage: student.examLanguage,
    };
  }

  async currentPack(learner: Learner): Promise<QuestionPackRecord | null> {
    const school = await this.queryBus.execute(new GetSchoolQuery());
    return this.packs.latestPublished({
      countryCode: school.countryCode,
      licenceClass: learner.licenceClass,
      language: learner.examLanguage,
    });
  }

  async requireCurrentPack(learner: Learner): Promise<QuestionPackRecord> {
    const pack = await this.currentPack(learner);
    if (!pack) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'question_pack_missing',
        t('errors.question_pack_missing'),
      );
    }
    return pack;
  }

  async premium(studentId: string): Promise<boolean> {
    const settings = await this.queryBus.execute(new GetSchoolSettingsQuery());
    if (settings.theoryPremiumFree) return true;
    return this.queryBus.execute(new HasEntitlementQuery(studentId, 'premium_theory'));
  }

  async view(question: QuestionRecord): Promise<TheoryQuestion> {
    const media = question.mediaKey
      ? await this.storage.presignDownload({
          key: question.mediaKey,
          expiresInSeconds: MEDIA_URL_TTL_SECONDS,
        })
      : null;
    return {
      id: question.id,
      category: question.category,
      body: question.body,
      mediaUrl: media?.url ?? null,
      answers: question.answers,
      points: question.points,
    };
  }
}

export function premiumRequired(): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'premium_required', t('errors.premium_required'));
}
