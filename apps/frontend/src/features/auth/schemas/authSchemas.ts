export interface LoginCredentials {
  email: string;
  password?: string; // Optional if we just want a simple form, but usually required
}

export interface RegisterCredentials {
  email: string;
  password?: string;
}
