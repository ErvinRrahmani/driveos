import type { AuthRequest, Principal } from './principal.js';

export interface Authenticator {
  authenticate(request: Pick<AuthRequest, 'headers'>): Promise<Principal | null> | Principal | null;
}

export const AUTHENTICATORS = Symbol('AUTHENTICATORS');
