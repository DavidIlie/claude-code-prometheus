import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { fetchAndUpdatePricing } from "~/server/lib/pricing-fetcher";

export const pricingRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const pricing = await ctx.db.modelPricing.findMany({
      orderBy: { id: "asc" },
    });

    return pricing.map((p) => ({
      model: p.id,
      inputCostPerMillion: p.inputCostPerToken * 1_000_000,
      outputCostPerMillion: p.outputCostPerToken * 1_000_000,
      cacheCreationCostPerMillion: p.cacheCreationCostPerToken * 1_000_000,
      cacheReadCostPerMillion: p.cacheReadCostPerToken * 1_000_000,
      updatedAt: p.updatedAt,
    }));
  }),

  refresh: protectedProcedure.mutation(async () => {
    const result = await fetchAndUpdatePricing();
    return result;
  }),

  update: protectedProcedure
    .input(
      z.object({
        model: z.string(),
        inputCostPerMillion: z.number().nonnegative(),
        outputCostPerMillion: z.number().nonnegative(),
        cacheCreationCostPerMillion: z.number().nonnegative().optional(),
        cacheReadCostPerMillion: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const inputCostPerToken = input.inputCostPerMillion / 1_000_000;
      const outputCostPerToken = input.outputCostPerMillion / 1_000_000;
      const cacheCreationCostPerToken = input.cacheCreationCostPerMillion
        ? input.cacheCreationCostPerMillion / 1_000_000
        : inputCostPerToken * 1.25;
      const cacheReadCostPerToken = input.cacheReadCostPerMillion
        ? input.cacheReadCostPerMillion / 1_000_000
        : inputCostPerToken * 0.1;

      const pricing = await ctx.db.modelPricing.upsert({
        where: { id: input.model },
        update: {
          inputCostPerToken,
          outputCostPerToken,
          cacheCreationCostPerToken,
          cacheReadCostPerToken,
        },
        create: {
          id: input.model,
          inputCostPerToken,
          outputCostPerToken,
          cacheCreationCostPerToken,
          cacheReadCostPerToken,
        },
      });

      return {
        model: pricing.id,
        inputCostPerMillion: pricing.inputCostPerToken * 1_000_000,
        outputCostPerMillion: pricing.outputCostPerToken * 1_000_000,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ model: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.modelPricing.delete({
        where: { id: input.model },
      });
      return { success: true };
    }),
});
