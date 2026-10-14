export function normalizePingMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}
