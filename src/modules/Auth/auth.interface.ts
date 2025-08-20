import { Role } from '@prisma/client';

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export type TRole = 'ADMIN' | 'USER';

export interface ILoginUser {
  email: string;
  password: string;
}
