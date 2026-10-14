import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function HomeStack() {
  return (
    <SectionStack
      screens={{
        offers: 'offers.title',
        balance: 'balance.title',
        progress: 'progress.title',
        documents: 'documents.title',
        'contracts/[id]': 'contract.title',
      }}
    />
  );
}
