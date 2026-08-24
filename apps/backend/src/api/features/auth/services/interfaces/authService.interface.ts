import { User } from '@crypto-strategy-lab/shared';

export interface AuthServiceInterface {
  /**
   * Authenticate a user by email and password.
   * Throws an error if authentication fails.
   */
  authenticate(email: string, password: string): Promise<User>;

  /**
   * Register a new user.
   */
  register(email: string, password: string): Promise<User>;

  /**
   * Validate a user by their ID (e.g. from session).
   */
  validateUser(userId: string): Promise<User | null>;

  /**
   * Ensure a user with the given email exists and has the ADMIN role.
   * Returns true if the user was promoted to ADMIN during this call.
   */
  ensureAdmin(email: string, defaultPassword?: string): Promise<boolean>;
}
