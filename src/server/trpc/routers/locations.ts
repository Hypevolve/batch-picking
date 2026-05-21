import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";

export const locationsRouter = router({
  list: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from("product_locations")
      .select("*")
      .order("route_position", { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }),

  upsert: adminProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        zoneCode: z.string().min(1),
        shelfCode: z.string().min(1),
        routePosition: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from("product_locations")
        .select("id")
        .eq("sku", input.sku)
        .limit(1)
        .single();

      if (existing) {
        await supabaseAdmin
          .from("product_locations")
          .update({
            zone_code: input.zoneCode,
            shelf_code: input.shelfCode,
            route_position: input.routePosition,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        return { action: "updated" as const };
      }

      await supabaseAdmin.from("product_locations").insert({
        sku: input.sku,
        zone_code: input.zoneCode,
        shelf_code: input.shelfCode,
        route_position: input.routePosition,
      });
      return { action: "created" as const };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await supabaseAdmin
        .from("product_locations")
        .delete()
        .eq("id", input.id);
      return { success: true };
    }),

  bulkImport: adminProcedure
    .input(
      z.array(
        z.object({
          sku: z.string().min(1),
          zoneCode: z.string().min(1),
          shelfCode: z.string().min(1),
          routePosition: z.number().int().min(0),
        })
      )
    )
    .mutation(async ({ input }) => {
      let created = 0;
      let updated = 0;

      for (const location of input) {
        const { data: existing } = await supabaseAdmin
          .from("product_locations")
          .select("id")
          .eq("sku", location.sku)
          .limit(1)
          .single();

        if (existing) {
          await supabaseAdmin
            .from("product_locations")
            .update({
              zone_code: location.zoneCode,
              shelf_code: location.shelfCode,
              route_position: location.routePosition,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          updated++;
        } else {
          await supabaseAdmin.from("product_locations").insert({
            sku: location.sku,
            zone_code: location.zoneCode,
            shelf_code: location.shelfCode,
            route_position: location.routePosition,
          });
          created++;
        }
      }

      return { created, updated };
    }),

  listRoutes: protectedProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from("picking_routes")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  }),

  upsertRoute: adminProcedure
    .input(
      z.object({
        zoneCode: z.string().min(1),
        zoneName: z.string().min(1),
        sortOrder: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const { data: existing } = await supabaseAdmin
        .from("picking_routes")
        .select("id")
        .eq("zone_code", input.zoneCode)
        .limit(1)
        .single();

      if (existing) {
        await supabaseAdmin
          .from("picking_routes")
          .update({ zone_name: input.zoneName, sort_order: input.sortOrder })
          .eq("id", existing.id);
        return { action: "updated" as const };
      }

      await supabaseAdmin.from("picking_routes").insert({
        zone_code: input.zoneCode,
        zone_name: input.zoneName,
        sort_order: input.sortOrder,
      });
      return { action: "created" as const };
    }),
});
