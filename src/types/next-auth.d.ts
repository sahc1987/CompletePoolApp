import { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    /** Epoch ms of the last database re-check of `role`/`active`. */
    checkedAt?: number;
    /** The account no longer exists or is inactive — treat as signed out. */
    revoked?: boolean;
  }
}
