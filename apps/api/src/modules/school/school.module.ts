import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ConnectPaymentAccountHandler } from './commands/connect-payment-account.handler.js';
import { CreateBranchHandler } from './commands/create-branch.handler.js';
import { CreateVehicleHandler } from './commands/create-vehicle.handler.js';
import { DeleteStudentReviewHandler } from './commands/delete-student-review.handler.js';
import { ModerateReviewHandler } from './commands/moderate-review.handler.js';
import { ProvisionSchoolHandler } from './commands/provision-school.handler.js';
import { ReplaceOpeningHoursHandler } from './commands/replace-opening-hours.handler.js';
import { SubmitReviewHandler } from './commands/submit-review.handler.js';
import { UpdateBranchHandler } from './commands/update-branch.handler.js';
import { UpdatePublicProfileHandler } from './commands/update-public-profile.handler.js';
import { UpdateSchoolSettingsHandler } from './commands/update-school-settings.handler.js';
import { UpdateSchoolHandler } from './commands/update-school.handler.js';
import { UpdateVehicleHandler } from './commands/update-vehicle.handler.js';
import { BranchesController } from './http/branches.controller.js';
import { PublicProfileController } from './http/public-profile.controller.js';
import { PublicSchoolController } from './http/public-school.controller.js';
import { ReviewsController } from './http/reviews.controller.js';
import { SchoolController } from './http/school.controller.js';
import { StaffController } from './http/staff.controller.js';
import { VehiclesController } from './http/vehicles.controller.js';
import { PublicPages } from './infra/public-pages.js';
import { PublicProfileRecords } from './infra/public-profile-records.js';
import { ReviewRecords } from './infra/review-records.js';
import { SchoolRecords } from './infra/school-records.js';
import { GetMissingBranchIdsHandler } from './queries/get-missing-branch-ids.handler.js';
import { GetOpeningHoursHandler } from './queries/get-opening-hours.handler.js';
import { GetPaymentAccountHandler } from './queries/get-payment-account.handler.js';
import { GetPublicProfileHandler } from './queries/get-public-profile.handler.js';
import { GetPublicSchoolPageHandler } from './queries/get-public-school-page.handler.js';
import { GetSchoolSettingsHandler } from './queries/get-school-settings.handler.js';
import { GetSchoolHandler } from './queries/get-school.handler.js';
import { GetVehicleHandler } from './queries/get-vehicle.handler.js';
import { ListBranchesHandler } from './queries/list-branches.handler.js';
import { ListReviewsHandler } from './queries/list-reviews.handler.js';
import { ListStaffHandler } from './queries/list-staff.handler.js';
import { ListVehiclesHandler } from './queries/list-vehicles.handler.js';
import { ResolvePublicSchoolHandler } from './queries/resolve-public-school.handler.js';

@Module({
  imports: [IdentityModule],
  controllers: [
    SchoolController,
    BranchesController,
    VehiclesController,
    StaffController,
    PublicProfileController,
    PublicSchoolController,
    ReviewsController,
  ],
  providers: [
    SchoolRecords,
    PublicProfileRecords,
    ReviewRecords,
    PublicPages,
    ProvisionSchoolHandler,
    UpdateSchoolHandler,
    UpdateSchoolSettingsHandler,
    ReplaceOpeningHoursHandler,
    CreateBranchHandler,
    UpdateBranchHandler,
    CreateVehicleHandler,
    UpdateVehicleHandler,
    ConnectPaymentAccountHandler,
    GetSchoolHandler,
    GetSchoolSettingsHandler,
    GetOpeningHoursHandler,
    GetMissingBranchIdsHandler,
    GetPaymentAccountHandler,
    ListBranchesHandler,
    GetVehicleHandler,
    ListVehiclesHandler,
    ListStaffHandler,
    UpdatePublicProfileHandler,
    SubmitReviewHandler,
    ModerateReviewHandler,
    DeleteStudentReviewHandler,
    GetPublicProfileHandler,
    GetPublicSchoolPageHandler,
    ListReviewsHandler,
    ResolvePublicSchoolHandler,
  ],
})
export class SchoolModule {}
