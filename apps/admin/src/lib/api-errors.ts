import { errorResponseSchema } from '@driveos/shared';
import { z } from 'zod';

const issueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
const issuesSchema = z.union([
  z.array(issueSchema),
  z.object({ issues: z.array(issueSchema) }).transform((details) => details.issues),
]);

function parse(error: unknown) {
  const result = errorResponseSchema.safeParse(error);
  return result.success ? result.data.error : null;
}

export function apiErrorCode(error: unknown): string | null {
  return parse(error)?.code ?? null;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  return parse(error)?.message ?? fallback;
}

export function issuePath(path: readonly (string | number)[]): string {
  return path
    .map((segment, index) =>
      typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`,
    )
    .join('');
}

export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const parsed = parse(error);
  if (parsed?.code !== 'validation_error') return {};
  const issues = issuesSchema.safeParse(parsed.details);
  if (!issues.success) return {};
  const result: Record<string, string> = {};
  for (const issue of issues.data) {
    if (issue.path.length === 0) continue;
    result[issuePath(issue.path)] ??= issue.message;
  }
  return result;
}
