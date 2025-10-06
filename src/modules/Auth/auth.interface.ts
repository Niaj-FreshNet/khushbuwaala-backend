import { Role } from '@prisma/client';

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface IUserPayload {
  name: string;
  email: string;
  password: string;
  state?: string;
  phone?: string;
  address?: string;
  imageUrl?: string;
}

export type TRole = 'USER' | 'SALESMAN' | 'ADMIN' | 'SUPER_ADMIN';

export interface ILoginUser {
  email: string;
  password: string;
}
