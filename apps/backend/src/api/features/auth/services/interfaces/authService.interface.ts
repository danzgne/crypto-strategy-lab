import { User } from '@crypto-strategy-lab/shared';

/**
 * Password-based authentication provider.
 *
 * This interface is intentionally scoped to email+password credentials.
 * If a hosted provider (OAuth, SSO, etc.) is added in the future, introduce
 * a broader `AuthProvider` interface and implement it as a separate adapter —
 * this class stays as the password-based implementation. See ADR-0005.
 */
export interface PasswordAuthServiceInterface {
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
  ensureAdmin(email: string, defaultPassword: string): Promise<boolean>;
}
