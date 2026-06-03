import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { generateAIReply } from "@/server/services/ai-service";

export const aiRouter = router({
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .max(10)
          .default([]),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateAIReply(input.message, input.history);
      return result;
    }),
});
