import type { DocumentItem } from '@driveos/shared';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { send } from '../../lib/flow';
import { formatDate } from '../../lib/format';
import { useServices } from '../../lib/session';
import { useDisplayZone, useDocuments, useStudentId } from '../../lib/student-data';
import { Banner, EmptyState, ListItem, Screen, Text } from '../../ui';
import { documentKindLabel } from './labels';
import { Loadable } from './common';

export function DocumentsScreen() {
  const { t } = useTranslation();
  const services = useServices();
  const documents = useDocuments(useStudentId());
  const zone = useDisplayZone();
  const [opening, setOpening] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const open = async (document: DocumentItem) => {
    setOpening(document.id);
    setFailure(null);
    const result = await send(() =>
      services.api.fetchClient.GET('/v1/documents/{id}/download-url', {
        params: { path: { id: document.id } },
      }),
    );
    setOpening(null);
    if (!result.ok) {
      setFailure(errorMessage(t, result));
      return;
    }
    await openBrowserAsync(result.data.url);
  };

  return (
    <Screen>
      <Text tone="muted">{t('documents.subtitle')}</Text>
      {failure ? <Banner tone="danger" message={failure} /> : null}
      <Loadable query={documents}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState title={t('documents.emptyTitle')} description={t('documents.empty')} />
          ) : (
            <>
              {data.items.map((document) => (
                <ListItem
                  key={document.id}
                  title={documentKindLabel(t, document.kind)}
                  subtitle={
                    document.status === 'ready'
                      ? t('documents.details', {
                          date: formatDate(document.createdAt, zone),
                          by: document.uploadedByName ?? '',
                        })
                      : t('documents.pending')
                  }
                  disabled={document.status !== 'ready' || opening !== null}
                  accessory={
                    <Text variant="label" tone="primary">
                      {opening === document.id ? t('common.loading') : t('documents.open')}
                    </Text>
                  }
                  onPress={() => void open(document)}
                />
              ))}
            </>
          )
        }
      </Loadable>
    </Screen>
  );
}
