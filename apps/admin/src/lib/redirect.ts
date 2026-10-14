export function safeRedirect(target: string | undefined): string {
  if (
    !target ||
    !target.startsWith('/') ||
    target.startsWith('//') ||
    target.startsWith('/login')
  ) {
    return '/';
  }
  return target;
}
