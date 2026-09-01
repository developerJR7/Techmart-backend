import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      isActive: boolean;
    }
  }
}

export type RequestUser = Express.User;
