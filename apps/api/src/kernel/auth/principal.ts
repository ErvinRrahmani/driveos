export type TokenType = 'access' | 'support';

export interface Principal {
  userId: string;
  schoolId: string | null;
  membershipId: string | null;
  roles: string[];
  tokenType: TokenType;
  sessionId: string | null;
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}
