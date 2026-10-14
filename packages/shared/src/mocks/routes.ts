export type MockMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface MockRoute {
  operationId: string;
  method: MockMethod;
  path: string;
  mswPath: string;
  status: number;
  response: string | null;
  request: string | null;
  produces: 'json' | 'pdf' | 'none';
  idempotent: boolean;
  public: boolean;
}
