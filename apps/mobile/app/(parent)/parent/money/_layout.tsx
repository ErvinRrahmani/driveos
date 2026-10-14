import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function ParentMoneyStack() {
  return <SectionStack screens={{ shop: 'shop.title' }} />;
}
