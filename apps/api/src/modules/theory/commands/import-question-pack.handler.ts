import type { ImportQuestionPackResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { StatusCodes } from 'http-status-codes';
import {
  type ImportedQuestionPack,
  QUESTION_BANK_IMPORTER,
  type QuestionBankImporter,
  QuestionPackInvalidError,
} from '../../../adapters/question-bank/question-bank-importer.js';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { findPgError, PG_UNIQUE_VIOLATION } from '../../../kernel/http/pg-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { QuestionPacksRepository } from '../infra/question-packs.repository.js';
import { ImportQuestionPackCommand } from './import-question-pack.command.js';

const PACK_KEY = 'question_packs_country_class_language_version_key';

@CommandHandler(ImportQuestionPackCommand)
export class ImportQuestionPackHandler implements ICommandHandler<
  ImportQuestionPackCommand,
  ImportQuestionPackResponse
> {
  constructor(
    private readonly packs: QuestionPacksRepository,
    @Inject(QUESTION_BANK_IMPORTER) private readonly importer: QuestionBankImporter,
  ) {}

  async execute({ body }: ImportQuestionPackCommand): Promise<ImportQuestionPackResponse> {
    const pack = this.parse(body);
    try {
      const id = await this.packs.insertDraft(pack);
      return { id, version: pack.version, questionCount: pack.questions.length };
    } catch (error) {
      const pgError = findPgError(error);
      if (pgError?.code === PG_UNIQUE_VIOLATION && pgError.constraint === PACK_KEY) {
        throw new ConflictError('question_pack_exists', t('errors.question_pack_exists'));
      }
      throw error;
    }
  }

  private parse(body: unknown): ImportedQuestionPack {
    try {
      return this.importer.parse(body);
    } catch (error) {
      if (error instanceof QuestionPackInvalidError) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
          issues: error.issues,
        });
      }
      throw error;
    }
  }
}
