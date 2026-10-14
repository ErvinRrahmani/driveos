import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function TheoryStack() {
  return <SectionStack screens={{ 'session/[id]': 'theory.sessionTitle' }} />;
}
