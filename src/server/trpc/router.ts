import { router } from "./init";
import { batchesRouter } from "./routers/batches";
import { ordersRouter } from "./routers/orders";
import { locationsRouter } from "./routers/locations";
import { aiRouter } from "./routers/ai";

export const appRouter = router({
  batches: batchesRouter,
  orders: ordersRouter,
  locations: locationsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
