import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useFieldContext } from './context';

function messageOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message;
  return undefined;
}

export function useFieldUi<TValue>() {
  const field = useFieldContext<TValue>();
  const { t, i18n } = useTranslation();
  const id = useId();
  const { meta } = field.state;
  const fromServer = meta.errorMap.onServer !== undefined;
  const visible = meta.isTouched || fromServer;
  const messages = visible
    ? [
        ...new Set(
          meta.errors
            .map(messageOf)
            .filter((message): message is string => !!message)
            .map((message) => (i18n.exists(message) ? String(t(message as never)) : message)),
        ),
      ]
    : [];

  const change = (value: TValue) => {
    if (fromServer) {
      field.setMeta((prev) => ({ ...prev, errorMap: { ...prev.errorMap, onServer: undefined } }));
    }
    field.handleChange(value as never);
  };

  return {
    field,
    id,
    errorId: `${id}-error`,
    descriptionId: `${id}-description`,
    messages,
    invalid: messages.length > 0,
    change,
  };
}
