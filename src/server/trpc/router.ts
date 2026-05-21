import { router } from "./init";
import { batchesRouter } from "./routers/batches";
import { ordersRouter } from "./routers/orders";
import { locationsRouter } from "./routers/locations";

export const appRouter = router({
  batches: batchesRouter,
  orders: ordersRouter,
  locations: locationsRouter,
});

export type AppRouter = typeof appRouter;
