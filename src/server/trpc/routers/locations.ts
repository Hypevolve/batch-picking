import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../init";
import { supabaseAdmin } from "@/server/db/supabase-admin";

const location = z.object({
  sku: z.string().trim().min(1),
  zoneCode: z.string().trim().min(1),
  shelfCode: z.string().trim().min(1),
  routePosition: z.number().int().min(0),
});

/** The database message goes back to the admin screen, as it did when the browser wrote directly. */
function dbError(error: { code?: string; message: string }): TRPCError {
  // 23503: SKU not in products (foreign key); 23505: unique violation.
  const code = error.code === "23503" || error.code === "23505" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR";
  return new TRPCError({ code, message: error.message });
}

export const locationsRouter = router({
  // Admin: Lokacije.
  list: adminProcedure.query(async () => {
    const { data, error } = await supabaseAdmin
      .from("product_locations")
      .select("*")
      .order("route_position", { ascending: true });

    if (error) throw dbError(error);
    return data ?? [];
  }),

  create: adminProcedure.input(location).mutation(async ({ input }) => {
    const { error } = await supabaseAdmin.from("product_locations").insert({
      sku: input.sku,
      zone_code: input.zoneCode,
      shelf_code: input.shelfCode,
      route_position: input.routePosition,
    });
    if (error) throw dbError(error);
    return { success: true };
  }),

  update: adminProcedure
    .input(location.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin
        .from("product_locations")
        .update({
          sku: input.sku,
          zone_code: input.zoneCode,
          shelf_code: input.shelfCode,
          route_position: input.routePosition,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw dbError(error);
      return { success: true };
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
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const { error } = await supabaseAdmin
        .from("product_locations")
        .delete()
        .eq("id", input.id);
      if (error) throw dbError(error);
      return { success: true };
    }),

  // CSV import: update the location of a known SKU, insert the rest. The screen sends
  // the file in chunks; `row` is the CSV line number, used in the error messages.
  bulkImport: adminProcedure
    .input(z.array(location.extend({ row: z.number().int().positive().optional() })).max(500))
    .mutation(async ({ input }) => {
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const [i, loc] of input.entries()) {
        const label = `Red ${loc.row ?? i + 1} (${loc.sku})`;
        const { data: existing } = await supabaseAdmin
          .from("product_locations")
          .select("id")
          .eq("sku", loc.sku)
          .limit(1)
          .maybeSingle();

        if (existing) {
          const { error } = await supabaseAdmin
            .from("product_locations")
            .update({
              zone_code: loc.zoneCode,
              shelf_code: loc.shelfCode,
              route_position: loc.routePosition,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (error) errors.push(`${label}: ${error.message}`);
          else updated++;
        } else {
          const { error } = await supabaseAdmin.from("product_locations").insert({
            sku: loc.sku,
            zone_code: loc.zoneCode,
            shelf_code: loc.shelfCode,
            route_position: loc.routePosition,
          });
          if (error) errors.push(`${label}: ${error.message}`);
          else created++;
        }
      }

      return { created, updated, errors };
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
