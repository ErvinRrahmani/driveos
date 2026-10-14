import {
  type ArchiveStudentRequest,
  archiveStudentRequestSchema,
  type CreateEnrolmentRequest,
  createEnrolmentRequestSchema,
  type CreateStudentRequest,
  createStudentRequestSchema,
  type IdParams,
  idParamsSchema,
  type LinkGuardianRequest,
  linkGuardianRequestSchema,
  type LinkGuardianResponse,
  type ListStudentsQuery as ListStudentsParams,
  listStudentsQuerySchema,
  type RecordTestAttemptRequest,
  recordTestAttemptRequestSchema,
  type ReplaceStudentInstructorsRequest,
  replaceStudentInstructorsRequestSchema,
  type StudentInstructorsResponse,
  type StudentExportResponse,
  type StudentListResponse,
  type StudentProgressResponse,
  type StudentResponse,
  type UpdateStudentRequest,
  updateStudentRequestSchema,
} from '@driveos/shared';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { AnonymizeStudentCommand } from '../commands/anonymize-student.command.js';
import { ArchiveStudentCommand } from '../commands/archive-student.command.js';
import { CreateStudentCommand } from '../commands/create-student.command.js';
import { EnrolStudentCommand } from '../commands/enrol-student.command.js';
import { ExportStudentDataCommand } from '../commands/export-student-data.command.js';
import { LinkGuardianCommand } from '../commands/link-guardian.command.js';
import { RecordTestAttemptCommand } from '../commands/record-test-attempt.command.js';
import { ReplaceStudentInstructorsCommand } from '../commands/replace-student-instructors.command.js';
import { UpdateStudentCommand } from '../commands/update-student.command.js';
import { GetStudentInstructorsQuery } from '../queries/get-student-instructors.query.js';
import { GetStudentProgressQuery } from '../queries/get-student-progress.query.js';
import { GetStudentQuery } from '../queries/get-student.query.js';
import { ListStudentsQuery } from '../queries/list-students.query.js';
import { StatusCodes } from 'http-status-codes';

const params = new ZodValidationPipe(idParamsSchema);

@ApiTags('training')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('students.read', 'students.read.own')
  @ApiRoute({
    operationId: 'students.list',
    summary: 'Students (an instructor sees only the students they teach)',
    status: StatusCodes.OK,
    query: 'ListStudentsQuery',
    response: 'StudentListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listStudentsQuerySchema)) query: ListStudentsParams,
  ): Promise<StudentListResponse> {
    return this.queryBus.execute(new ListStudentsQuery(actor, query));
  }

  @Post()
  @RequirePermission('students.manage')
  @ApiRoute({
    operationId: 'students.create',
    summary: 'Add a student',
    status: StatusCodes.CREATED,
    body: 'CreateStudentRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createStudentRequestSchema)) body: CreateStudentRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateStudentCommand(actor, body));
  }

  @Get(':id')
  @RequireAnyPermission('students.read', 'students.read.own')
  @ApiRoute({
    operationId: 'students.get',
    summary: 'A student with enrolments, instructors and guardians',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'StudentResponse',
  })
  get(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
  ): Promise<StudentResponse> {
    return this.queryBus.execute(new GetStudentQuery(actor, id));
  }

  @Patch(':id')
  @RequirePermission('students.manage')
  @ApiRoute({
    operationId: 'students.update',
    summary: "Change a student's details",
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdateStudentRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(updateStudentRequestSchema)) body: UpdateStudentRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateStudentCommand(actor, id, body));
  }

  @Delete(':id')
  @RequirePermission('students.anonymize')
  @ApiRoute({
    operationId: 'students.anonymize',
    summary: 'Delete a student by anonymizing them; financial records are kept',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'CommandResult',
  })
  anonymize(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new AnonymizeStudentCommand(actor, id));
  }

  @Get(':id/instructors')
  @RequireAnyPermission('students.read', 'students.read.own')
  @ApiRoute({
    operationId: 'studentInstructors.list',
    summary: "A student's assigned instructors",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'StudentInstructorsResponse',
  })
  listInstructors(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
  ): Promise<StudentInstructorsResponse> {
    return this.queryBus.execute(new GetStudentInstructorsQuery(actor, id));
  }

  @Put(':id/instructors')
  @RequirePermission('students.manage')
  @ApiRoute({
    operationId: 'studentInstructors.replace',
    summary: "Replace a student's assigned instructors",
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'ReplaceStudentInstructorsRequest',
    response: 'StudentInstructorsResponse',
  })
  replaceInstructors(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(replaceStudentInstructorsRequestSchema))
    body: ReplaceStudentInstructorsRequest,
  ): Promise<StudentInstructorsResponse> {
    return this.commandBus.execute(new ReplaceStudentInstructorsCommand(actor, id, body));
  }

  @Post(':id/enrolments')
  @RequirePermission('students.manage')
  @ApiRoute({
    operationId: 'enrolments.create',
    summary: 'Enrol a student in a licence class',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'CreateEnrolmentRequest',
    response: 'CommandResult',
  })
  enrol(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(createEnrolmentRequestSchema)) body: CreateEnrolmentRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new EnrolStudentCommand(actor, id, body));
  }

  @Get(':id/progress')
  @RequireAnyPermission('progress.read', 'progress.read.own')
  @ApiRoute({
    operationId: 'progress.get',
    summary: "A student's syllabus progress and test attempts (never private notes)",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'StudentProgressResponse',
  })
  getProgress(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
  ): Promise<StudentProgressResponse> {
    return this.queryBus.execute(new GetStudentProgressQuery(actor, id));
  }

  @Post(':id/test-attempts')
  @RequireAnyPermission('test_attempts.write', 'test_attempts.write.own')
  @ApiRoute({
    operationId: 'testAttempts.record',
    summary: 'Record a theory or practical test result',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'RecordTestAttemptRequest',
    response: 'CommandResult',
  })
  recordTestAttempt(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(recordTestAttemptRequestSchema)) body: RecordTestAttemptRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new RecordTestAttemptCommand(actor, id, body));
  }

  @Post(':id/guardians')
  @RequirePermission('guardians.manage')
  @ApiRoute({
    operationId: 'guardians.link',
    summary: 'Link a parent or guardian to a student (or invite them by phone or email)',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'LinkGuardianRequest',
    response: 'LinkGuardianResponse',
  })
  linkGuardian(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(linkGuardianRequestSchema)) body: LinkGuardianRequest,
  ): Promise<LinkGuardianResponse> {
    return this.commandBus.execute(new LinkGuardianCommand(actor, id, body));
  }

  @Post(':id/export')
  @RequirePermission('students.export')
  @ApiRoute({
    operationId: 'students.export',
    summary: "Export a student's data as a JSON bundle and a PDF (no private notes)",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'StudentExportResponse',
  })
  exportData(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
  ): Promise<StudentExportResponse> {
    return this.commandBus.execute(new ExportStudentDataCommand(actor, id));
  }

  @Post(':id/archive')
  @RequirePermission('students.manage')
  @ApiRoute({
    operationId: 'students.archive',
    summary: 'Archive a student',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'ArchiveStudentRequest',
    response: 'CommandResult',
  })
  archive(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(archiveStudentRequestSchema)) body: ArchiveStudentRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new ArchiveStudentCommand(actor, id, body));
  }
}
