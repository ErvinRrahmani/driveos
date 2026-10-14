import type { Href } from 'expo-router';
import { createContext, type ReactNode, useContext } from 'react';

export interface StudentScope {
  self: boolean;
  studentId: string | undefined;
  signerRole: 'student' | 'guardian';
  links: {
    book: Href;
    shop: Href;
    lesson: (id: string) => Href;
    chat: (id: string) => Href;
  };
}

export const SELF_SCOPE: StudentScope = {
  self: true,
  studentId: undefined,
  signerRole: 'student',
  links: {
    book: '/student/lessons/book',
    shop: '/student/shop',
    lesson: (id) => `/student/lessons/${id}`,
    chat: (id) => `/student/chat/${id}`,
  },
};

export function parentScope(studentId: string | undefined): StudentScope {
  return {
    self: false,
    studentId,
    signerRole: 'guardian',
    links: {
      book: '/parent/lessons/book',
      shop: '/parent/money/shop',
      lesson: (id) => `/parent/lessons/${id}`,
      chat: (id) => `/parent/chat/${id}`,
    },
  };
}

const ScopeContext = createContext<StudentScope>(SELF_SCOPE);

export function StudentScopeProvider({
  scope,
  children,
}: {
  scope: StudentScope;
  children: ReactNode;
}) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

export function useStudentScope(): StudentScope {
  return useContext(ScopeContext);
}
