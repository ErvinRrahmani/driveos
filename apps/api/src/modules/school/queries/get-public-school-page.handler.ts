import {
  LEAD_CONSENT_TEXT_VERSION,
  PAGE_LIMIT_MAX,
  type LessonType,
  type PublicSchoolPage,
} from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ListPublicPriceItemsQuery } from '../../billing/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { ListLessonTypesQuery } from '../../scheduling/index.js';
import { reviewSummary } from '../domain/reviews.js';
import { PublicProfileRecords, schoolNotFound } from '../infra/public-profile-records.js';
import { hhmm, SchoolRecords } from '../infra/school-records.js';
import { branches, openingHours, schoolReviews, schools } from '../infra/schema.js';
import { GetPublicSchoolPageQuery } from './get-public-school-page.query.js';

const REVIEWS_ON_PAGE = 20;

type Page = PublicSchoolPage;

@QueryHandler(GetPublicSchoolPageQuery)
export class GetPublicSchoolPageHandler implements IQueryHandler<GetPublicSchoolPageQuery, Page> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolRecords,
    private readonly profiles: PublicProfileRecords,
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory) private readonly directory: MembershipDirectory,
  ) {}

  async execute(): Promise<Page> {
    const profile = await this.profiles.current();
    if (!profile?.published) throw schoolNotFound();
    const [school] = await this.tenant.tx
      .select()
      .from(schools)
      .where(eq(schools.id, this.school.schoolId));
    if (!school) throw schoolNotFound();
    return {
      slug: profile.slug,
      name: school.name,
      headline: profile.headline,
      description: profile.description,
      address: school.address,
      phone: profile.phone,
      whatsappUrl: profile.whatsappNumber
        ? `https://wa.me/${profile.whatsappNumber.replace(/\D/g, '')}`
        : null,
      instagramUrl: profile.instagramUrl,
      facebookUrl: profile.facebookUrl,
      externalReviewUrl: profile.externalReviewUrl,
      timeZone: school.timeZone,
      currency: school.currency,
      locale: school.locale,
      branches: await this.branches(),
      prices: profile.showPrices
        ? await this.queryBus.execute(new ListPublicPriceItemsQuery())
        : [],
      instructors: profile.showInstructors ? await this.instructors() : [],
      reviews: await this.reviews(),
      licenceClasses: await this.licenceClasses(),
      consentTextVersion: LEAD_CONSENT_TEXT_VERSION,
    };
  }

  /** Each branch with its own opening hours, or the school-wide hours when it has none. */
  private async branches(): Promise<Page['branches']> {
    const rows = await this.tenant.tx.select().from(branches).orderBy(asc(branches.name));
    const hours = await this.tenant.tx
      .select()
      .from(openingHours)
      .orderBy(asc(openingHours.weekday), asc(openingHours.opens));
    const hoursOf = (branchId: string | null) =>
      hours
        .filter((row) => row.branchId === branchId)
        .map((row) => ({ weekday: row.weekday, opens: hhmm(row.opens), closes: hhmm(row.closes) }));
    const schoolWide = hoursOf(null);
    return rows.map((branch) => {
      const own = hoursOf(branch.id);
      return {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        lat: branch.lat,
        lng: branch.lng,
        openingHours: own.length > 0 ? own : schoolWide,
      };
    });
  }

  private async instructors(): Promise<Page['instructors']> {
    const active = (await this.directory.listByRole('instructor')).filter(
      (membership) => membership.status === 'active',
    );
    const names = new Map(
      (await this.directory.contactsOf(active.map((membership) => membership.userId))).map(
        (contact) => [contact.userId, contact.fullName],
      ),
    );
    return active
      .map((membership) => ({
        membershipId: membership.id,
        name: names.get(membership.userId) ?? '',
      }))
      .filter((instructor) => instructor.name !== '')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async reviews(): Promise<Page['reviews']> {
    const approved = await this.tenant.tx
      .select({
        id: schoolReviews.id,
        displayName: schoolReviews.displayName,
        rating: schoolReviews.rating,
        text: schoolReviews.text,
        submittedAt: schoolReviews.submittedAt,
      })
      .from(schoolReviews)
      .where(eq(schoolReviews.status, 'approved'))
      .orderBy(desc(schoolReviews.submittedAt), desc(schoolReviews.id));
    return {
      ...reviewSummary(approved.map((review) => review.rating)),
      items: approved.slice(0, REVIEWS_ON_PAGE).map((review) => ({
        ...review,
        submittedAt: review.submittedAt.toISOString(),
      })),
    };
  }

  /** Sorted distinct licence classes of the school's active lesson types (scheduling). */
  private async licenceClasses(): Promise<string[]> {
    const types: LessonType[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.queryBus.execute(
        new ListLessonTypesQuery({ active: 'true', limit: PAGE_LIMIT_MAX, cursor }),
      );
      types.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return [...new Set(types.map((type) => type.licenceClass))].sort();
  }
}
