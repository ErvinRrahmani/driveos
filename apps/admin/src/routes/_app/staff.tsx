import type { Invitation, StaffMember } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { RoleList } from '@/components/school-switcher';
import { InvitationForm } from '@/components/staff/invitation-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDate } from '@/lib/format';
import { listSearchSchema, pageQuery } from '@/lib/search';

const STAFF_ROLE_FILTERS = ['owner', 'office', 'instructor'] as const;

const staffSearchSchema = listSearchSchema.extend({
  tab: z.enum(['members', 'invitations']).optional().catch(undefined),
  role: z.enum(STAFF_ROLE_FILTERS).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/staff')({
  validateSearch: (search) => staffSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['staff.read']}>
      <StaffPage />
    </RequirePermission>
  ),
});

function StaffPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canInvite = useCan('invitations.manage');
  const tab = search.tab ?? 'members';
  return (
    <>
      <PageHeader title={t('staff.title')} />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            search: { tab: value === 'invitations' ? 'invitations' : undefined },
          })
        }
      >
        <TabsList>
          <TabsTrigger value="members">{t('staff.tabs.members')}</TabsTrigger>
          {canInvite && (
            <TabsTrigger value="invitations">{t('staff.tabs.invitations')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="members" className="space-y-4">
          <MembersTab />
        </TabsContent>
        {canInvite && (
          <TabsContent value="invitations" className="space-y-4">
            <InvitationsTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

const memberHelper = columnHelperFor<StaffMember>();

function MembersTab() {
  const { t } = useTranslation();
  const { api } = useServices();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const roleId = useId();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const list = api.$api.useQuery(
    'get',
    '/v1/staff',
    { params: { query: { ...pageQuery(search), role: search.role } } },
    { placeholderData: keepPreviousData },
  );
  const columns = useMemo(
    () =>
      memberHelper.columns([
        memberHelper.accessor('fullName', { header: t('staff.name') }),
        memberHelper.display({
          id: 'contact',
          header: t('staff.contact'),
          cell: ({ row }) => row.original.email ?? row.original.phone ?? '—',
        }),
        memberHelper.accessor('roles', {
          header: t('staff.roles'),
          cell: ({ getValue }) => <RoleList roles={getValue()} />,
        }),
        memberHelper.accessor('status', {
          header: t('staff.status'),
          cell: ({ getValue }) => <Badge variant="secondary">{t(`status.${getValue()}`)}</Badge>,
        }),
      ]),
    [t],
  );
  return (
    <>
      <div className="grid w-48 gap-2">
        <Label htmlFor={roleId}>{t('staff.roleFilter')}</Label>
        <NativeSelect
          id={roleId}
          value={search.role ?? ''}
          onChange={(event) => {
            const role = STAFF_ROLE_FILTERS.find((candidate) => candidate === event.target.value);
            void navigate({ search: (prev) => ({ ...prev, role, cursor: undefined }) });
          }}
        >
          <option value="">{t('staff.allRoles')}</option>
          {STAFF_ROLE_FILTERS.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DataTable
        label={t('staff.tabs.members')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(member) => member.membershipId}
        emptyTitle={t('staff.empty')}
      />
    </>
  );
}

const invitationHelper = columnHelperFor<Invitation>();

function InvitationsTab() {
  const { t } = useTranslation();
  const { api } = useServices();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [inviting, setInviting] = useState(false);
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const list = api.$api.useQuery(
    'get',
    '/v1/invitations',
    { params: { query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );
  const columns = useMemo(
    () =>
      invitationHelper.columns([
        invitationHelper.display({
          id: 'contact',
          header: t('staff.contact'),
          cell: ({ row }) => row.original.email ?? row.original.phone ?? '—',
        }),
        invitationHelper.accessor('roles', {
          header: t('staff.roles'),
          cell: ({ getValue }) => <RoleList roles={getValue()} />,
        }),
        invitationHelper.accessor('expiresAt', {
          header: t('staff.expiresAt'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
      ]),
    [t],
  );
  const inviteButton = (
    <Button onClick={() => setInviting(true)}>
      <UserPlus aria-hidden />
      {t('staff.invite')}
    </Button>
  );
  return (
    <>
      <div className="flex justify-end">{inviteButton}</div>
      <DataTable
        label={t('staff.tabs.invitations')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(invitation) => invitation.id}
        emptyTitle={t('staff.invitationsEmpty')}
        emptyDescription={t('staff.invitationsEmptyBody')}
      />
      <FormDialog open={inviting} onOpenChange={setInviting} title={t('staff.inviteTitle')}>
        <InvitationForm onDone={() => setInviting(false)} />
      </FormDialog>
    </>
  );
}
