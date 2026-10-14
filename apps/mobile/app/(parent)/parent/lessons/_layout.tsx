import { SectionStack } from '../../../../src/components/stack';

export const unstable_settings = { initialRouteName: 'index' };

export default function ParentLessonsStack() {
  return <SectionStack screens={{ book: 'booking.title', '[id]': 'lesson.title' }} />;
}
