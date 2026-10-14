import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function ParentHomeStack() {
  return (
    <SectionStack
      screens={{
        progress: 'progress.title',
        documents: 'documents.title',
        'consent/[linkId]': 'consent.title',
        'contracts/[id]': 'contract.title',
      }}
    />
  );
}
