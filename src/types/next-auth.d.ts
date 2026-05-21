import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "picker";
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: "admin" | "picker";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "picker";
  }
}
