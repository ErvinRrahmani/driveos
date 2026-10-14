import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function LessonsStack() {
  return <SectionStack screens={{ book: 'booking.title', '[id]': 'lesson.title' }} />;
}
