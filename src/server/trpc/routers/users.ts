import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../init";
import { usersRepo } from "@/server/db/users-repo";
import { hashPassword } from "@/server/auth/password";

export const MIN_PASSWORD_LENGTH = 8;

const role = z.enum(["admin", "picker"]);
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Lozinka mora imati barem ${MIN_PASSWORD_LENGTH} znakova`)
  .max(256);

/**
 * User administration. Passwords are hashed here, on the server, with scrypt;
 * the browser never sees or produces a password hash.
 */
export const usersRouter = router({
  list: adminProcedure.query(() => usersRepo.list()),

  create: adminProcedure
    .input(
      z.object({
        email: z.string().trim().min(3).max(254).email(),
        name: z.string().trim().min(1).max(200),
        role,
        password,
      })
    )
    .mutation(async ({ input }) => {
      const result = await usersRepo.create({
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      });
      if ("error" in result) {
        if (result.error?.code === "23505") {
          throw new TRPCError({ code: "CONFLICT", message: "Korisnik s tom email adresom već postoji" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Korisnik nije spremljen" });
      }
      return { id: result.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(200),
        role,
        // Empty string = keep the current password.
        password: z.union([z.literal(""), password]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await usersRepo.update(input.id, {
        name: input.name,
        role: input.role,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      });
      return { id: input.id };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await usersRepo.setActive(input.id, input.active);
      return { id: input.id, active: input.active };
    }),
});
