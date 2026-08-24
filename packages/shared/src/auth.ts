export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthProvider {
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
}
