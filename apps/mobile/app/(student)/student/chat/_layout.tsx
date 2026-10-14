import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function ChatStack() {
  return <SectionStack screens={{ '[id]': 'chat.threadTitle' }} />;
}
