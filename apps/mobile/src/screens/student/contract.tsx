import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentScope } from '../../lib/student-scope';
import { errorMessage } from '../../components/error-message';
import { signContract } from '../../lib/student-flows';
import { formatDateTime } from '../../lib/format';
import { useServices } from '../../lib/session';
import { useDisplayZone } from '../../lib/student-data';
import { Banner, Button, Card, Screen, Text } from '../../ui';
import { signerRoleLabel } from './labels';
import { Loadable, Section } from './common';

export function ContractScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useServices();
  const queryClient = useQueryClient();
  const zone = useDisplayZone();
  const { signerRole } = useStudentScope();
  const contract = services.api.$api.useQuery('get', '/v1/contracts/{id}', {
    params: { path: { id } },
  });
  const [signing, setSigning] = useState(false);
  const [signedHere, setSignedHere] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );

  const sign = async () => {
    setSigning(true);
    setNotice(null);
    const result = await signContract(services, id, signerRole);
    setSigning(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', message: errorMessage(t, result) });
      return;
    }
    setSignedHere(true);
    setNotice({
      tone: 'success',
      message: result.status === 'signed' ? t('contract.complete') : t('contract.signedByYou'),
    });
    await queryClient.invalidateQueries({ queryKey: ['get', '/v1/contracts/{id}'] });
  };

  return (
    <Screen>
      <Loadable query={contract}>
        {(data) => {
          const signedByMe =
            signedHere || data.signatures.some((signature) => signature.signerRole === signerRole);
          return (
            <>
              <Text tone="muted">
                {t('contract.meta', {
                  student: data.studentName,
                  version: data.templateVersion,
                })}
              </Text>
              <Card>
                <Text>{data.body}</Text>
              </Card>
              <Section title={t('contract.signatures')}>
                {data.requiredSignerRoles.map((role) => {
                  const signature = data.signatures.find((item) => item.signerRole === role);
                  return (
                    <Text key={role}>
                      {signature
                        ? t('contract.signedBy', {
                            role: signerRoleLabel(t, role),
                            name: signature.signerName,
                            date: formatDateTime(signature.signedAt, zone),
                          })
                        : t('contract.waitingFor', { role: signerRoleLabel(t, role) })}
                    </Text>
                  );
                })}
              </Section>
              {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
              {data.status === 'signed' ? (
                <Banner tone="success" message={t('contract.complete')} />
              ) : signedByMe || !data.requiredSignerRoles.includes(signerRole) ? null : (
                <>
                  <Text tone="muted">{t('contract.signHint')}</Text>
                  <Button
                    title={t('contract.sign')}
                    loading={signing}
                    onPress={() => void sign()}
                  />
                </>
              )}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}
