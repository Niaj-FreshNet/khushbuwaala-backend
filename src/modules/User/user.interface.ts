export interface IUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  district?: string;
  imageUrl?: string;
  role: TuserRole;
  password?: string;
}

export type TuserRole = 'USER' | 'SALESMAN' | 'ADMIN' | 'SUPER_ADMIN';
