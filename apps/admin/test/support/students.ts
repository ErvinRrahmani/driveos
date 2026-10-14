import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { server } from './app';
import { StatusCodes } from 'http-status-codes';

export const STUDENTS = {
  stella: '0192f000-0007-7000-8000-000000000001',
  sam: '0192f000-0007-7000-8000-000000000002',
  mia: '0192f000-0007-7000-8000-000000000005',
  ingo: '0192f000-0003-7000-8000-000000000003',
  ines: '0192f000-0003-7000-8000-000000000004',
  stellaUser: '0192f000-0002-7000-8000-000000000006',
  gustavUser: '0192f000-0002-7000-8000-00000000000b',
  contractTemplate: '0192f000-0117-7000-8000-000000000001',
  contract: '0192f000-0118-7000-8000-000000000001',
  document: '0192f000-0116-7000-8000-000000000001',
};

export interface CapturedRequest {
  url: URL;
  body: unknown;
  headers: Headers;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function capture(
  method: Method,
  path: string,
  response: JsonBodyType | null,
  status = StatusCodes.OK,
): CapturedRequest[] {
  const calls: CapturedRequest[] = [];
  server.use(
    http[method](path, async ({ request }) => {
      const text = method === 'get' || method === 'delete' ? '' : await request.text();
      calls.push({ url: new URL(request.url), body: parseBody(text), headers: request.headers });
      return response === null
        ? new HttpResponse(null, { status })
        : HttpResponse.json(response, { status });
    }),
  );
  return calls;
}

export async function openTab(name: string) {
  await userEvent.click(await screen.findByRole('tab', { name }));
}
