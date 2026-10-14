import { verifyLoginCodeRequestSchema } from '@driveos/shared';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { errorMessage } from '../components/error-message';
import type { ApiFailure } from '../lib/api-errors';
import { requestLoginCode, verifyLoginCode } from '../lib/login-flow';
import { useAuthState, useServices } from '../lib/session';
import { Button, Input, Screen, spacing, Text } from '../ui';

type Step = 'contact' | 'code';

const contactSchema = verifyLoginCodeRequestSchema.shape.contact;
const codeSchema = verifyLoginCodeRequestSchema.shape.code;

export function LoginScreen() {
  const { t } = useTranslation();
  const services = useServices();
  const router = useRouter();
  const { status } = useAuthState();
  const [step, setStep] = useState<Step>('contact');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn' && !busy) return <Redirect href="/" />;

  const failureText = (failure: ApiFailure) => {
    if (failure.code === 'invalid_code') return t('login.errors.invalidCode');
    if (failure.code === 'validation_error') return t('login.errors.invalidContact');
    return errorMessage(t, failure);
  };

  const sendCode = async () => {
    if (!contactSchema.safeParse(contact).success) {
      setError(t('login.errors.invalidContact'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestLoginCode(services, contact);
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    setCode('');
    setStep('code');
  };

  const verify = async () => {
    if (!codeSchema.safeParse(code.trim()).success) {
      setError(t('login.errors.codeFormat'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await verifyLoginCode(services, contact, code);
    if (!result.ok) {
      setBusy(false);
      setError(failureText(result));
      return;
    }
    router.replace(result.next);
  };

  const changeContact = () => {
    setStep('contact');
    setError(null);
  };

  return (
    <Screen title={t('login.title')} subtitle={t('login.subtitle')}>
      {step === 'contact' ? (
        <View style={{ gap: spacing.lg }}>
          <Input
            label={t('login.contactLabel')}
            hint={t('login.contactHint')}
            value={contact}
            onChangeText={setContact}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={() => void sendCode()}
            error={error}
          />
          <Button title={t('login.sendCode')} loading={busy} onPress={() => void sendCode()} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Text tone="muted">{t('login.codeSent', { contact: contact.trim() })}</Text>
          <Input
            label={t('login.codeLabel')}
            value={code}
            onChangeText={setCode}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => void verify()}
            error={error}
          />
          <Button title={t('login.verify')} loading={busy} onPress={() => void verify()} />
          <Button
            title={t('login.resend')}
            variant="secondary"
            disabled={busy}
            onPress={() => void sendCode()}
          />
          <Button
            title={t('login.changeContact')}
            variant="ghost"
            disabled={busy}
            onPress={changeContact}
          />
        </View>
      )}
    </Screen>
  );
}
