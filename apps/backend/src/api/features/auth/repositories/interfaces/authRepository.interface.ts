import { Role } from '@crypto-strategy-lab/shared';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
  create(email: string, passwordHash: string): Promise<AuthUserRecord>;
  updateRole(id: string, role: Role): Promise<void>;
}
