import { useEffect, useEffectEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LEAD_TABS } from '@/lib/leads';

const SEARCH_DEBOUNCE_MS = 300;

/** The status tabs; render inside the page's `Tabs`. */
export function LeadStatusTabs() {
  const { t } = useTranslation();
  return (
    <TabsList aria-label={t('leads.statusTabs')}>
      {LEAD_TABS.map((tab) => (
        <TabsTrigger key={tab} value={tab}>
          {tab === 'all' ? t('leads.all') : t(`leads.statuses.${tab}`)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

export function LeadSearch({
  q,
  onChange,
}: {
  q: string | undefined;
  onChange: (q: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState(q ?? '');
  const commit = useEffectEvent((next: string | undefined) => onChange(next));

  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === q) return;
    const timer = setTimeout(() => commit(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);

  return (
    <div className="grid w-64 gap-2">
      <Label htmlFor={id}>{t('leads.search')}</Label>
      <Input
        id={id}
        type="search"
        value={text}
        placeholder={t('leads.searchPlaceholder')}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}
