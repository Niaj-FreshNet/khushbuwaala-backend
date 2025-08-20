export interface IUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
}

export type TuserRole = 'USER' | 'SALESMAN' | 'ADMIN';
