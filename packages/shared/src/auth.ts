export enum Role {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface User {
  id: string;
  email: string;
  role: Role;
}


