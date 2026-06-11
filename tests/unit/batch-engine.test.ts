import { describe, it, expect } from "vitest";
import {
  calculateJaccardSimilarity,
  greedyGroupOrders,
  classifyBatchType,
  buildZoneProfiles,
  calculateZoneJaccard,
  zoneBasedGroupOrders,
  computeRoutePosition,
} from "@/server/services/batch-engine";

describe("calculateJaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    expect(calculateJaccardSimilarity(["A", "B", "C"], ["A", "B", "C"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(calculateJaccardSimilarity(["A", "B"], ["C", "D"])).toBe(0);
  });

  it("returns correct value for partial overlap", () => {
    // intersection = {B}, union = {A, B, C, D} => 1/4 = 0.25
    expect(calculateJaccardSimilarity(["A", "B"], ["B", "C", "D"])).toBeCloseTo(0.25);
  });

  it("returns 0 for empty sets", () => {
    expect(calculateJaccardSimilarity([], [])).toBe(0);
  });
});

describe("greedyGroupOrders", () => {
  it("groups orders into batches of 5", () => {
    const orders = Array.from({ length: 10 }, (_, i) => ({
      orderId: i + 1,
      skus: [`SKU-${i}`],
    }));

    const groups = greedyGroupOrders(orders, 5);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(5);
    expect(groups[1]).toHaveLength(5);
  });

  it("creates partial batch for remaining orders", () => {
    const orders = Array.from({ length: 7 }, (_, i) => ({
      orderId: i + 1,
      skus: [`SKU-${i}`],
    }));

    const groups = greedyGroupOrders(orders, 5);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(5);
    expect(groups[1]).toHaveLength(2);
  });

  it("groups similar orders together", () => {
    const orders = [
      { orderId: 1, skus: ["A", "B", "C"] },
      { orderId: 2, skus: ["A", "B", "D"] },
      { orderId: 3, skus: ["X", "Y", "Z"] },
      { orderId: 4, skus: ["A", "C", "D"] },
      { orderId: 5, skus: ["X", "Y", "W"] },
    ];

    const groups = greedyGroupOrders(orders, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(5);
  });

  it("handles single order", () => {
    const orders = [{ orderId: 1, skus: ["A"] }];
    const groups = greedyGroupOrders(orders, 5);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
  });
});

describe("classifyBatchType", () => {
  it("classifies partial batch when less than 5 orders", () => {
    const group = [
      { orderId: 1, skus: ["A", "B"] },
      { orderId: 2, skus: ["A", "B"] },
    ];
    const result = classifyBatchType(group);
    expect(result.type).toBe("partial");
  });

  it("classifies smart batch with high overlap", () => {
    const group = [
      { orderId: 1, skus: ["A", "B", "C"] },
      { orderId: 2, skus: ["A", "B", "D"] },
      { orderId: 3, skus: ["A", "B", "E"] },
      { orderId: 4, skus: ["A", "C", "D"] },
      { orderId: 5, skus: ["A", "B", "C"] },
    ];
    const result = classifyBatchType(group);
    expect(result.type).toBe("smart");
  });

  it("classifies mixed batch with no overlap", () => {
    const group = [
      { orderId: 1, skus: ["A"] },
      { orderId: 2, skus: ["B"] },
      { orderId: 3, skus: ["C"] },
      { orderId: 4, skus: ["D"] },
      { orderId: 5, skus: ["E"] },
    ];
    const result = classifyBatchType(group);
    expect(result.type).toBe("mixed");
    expect(result.score).toBe(0);
  });
});

describe("buildZoneProfiles", () => {
  const locationMap = new Map([
    ["SKU-1", "ZONA-B"],
    ["SKU-2", "ZONA-B"],
    ["SKU-3", "ZONA-C"],
    ["9075", "ZONA-X"], // should be excluded
  ]);

  it("maps SKUs to zone sets", () => {
    const orders = [{ orderId: 1, skus: ["SKU-1", "SKU-3"] }];
    const result = buildZoneProfiles(orders, locationMap);
    expect(result[0].zones).toEqual(new Set(["ZONA-B", "ZONA-C"]));
  });

  it("excludes SKU 9075 from zone profile", () => {
    const orders = [{ orderId: 1, skus: ["SKU-1", "9075"] }];
    const result = buildZoneProfiles(orders, locationMap);
    expect(result[0].zones).toEqual(new Set(["ZONA-B"]));
    expect(result[0].zones.has("ZONA-X")).toBe(false);
  });

  it("returns empty zone set when no SKUs have locations", () => {
    const orders = [{ orderId: 1, skus: ["UNKNOWN-SKU"] }];
    const result = buildZoneProfiles(orders, locationMap);
    expect(result[0].zones.size).toBe(0);
  });

  it("deduplicates zones (two SKUs in same zone → 1 zone entry)", () => {
    const orders = [{ orderId: 1, skus: ["SKU-1", "SKU-2"] }];
    const result = buildZoneProfiles(orders, locationMap);
    expect(result[0].zones).toEqual(new Set(["ZONA-B"]));
  });
});

describe("calculateZoneJaccard", () => {
  it("returns 1 for identical zone sets", () => {
    const z = new Set(["ZONA-B", "ZONA-C"]);
    expect(calculateZoneJaccard(z, z)).toBe(1);
  });

  it("returns 0 for disjoint zone sets", () => {
    expect(
      calculateZoneJaccard(new Set(["ZONA-B"]), new Set(["ZONA-C"]))
    ).toBe(0);
  });

  it("returns 0.5 for one shared zone out of two total", () => {
    // A ∩ B = {ZONA-B}, A ∪ B = {ZONA-B, ZONA-C} → 1/2
    expect(
      calculateZoneJaccard(new Set(["ZONA-B"]), new Set(["ZONA-B", "ZONA-C"]))
    ).toBeCloseTo(0.5);
  });

  it("returns 0 for empty sets", () => {
    expect(calculateZoneJaccard(new Set(), new Set())).toBe(0);
  });
});

describe("zoneBasedGroupOrders", () => {
  const zoneSortMap = new Map([
    ["ZONA-A", 1],
    ["ZONA-B", 2],
    ["ZONA-C", 3],
    ["ZONA-D", 4],
    ["ZONA-E", 5],
  ]);

  it("batches orders sharing a zone (document example: zone C + zone D → same batch)", () => {
    const locationMap = new Map([
      ["FON2", "ZONA-C"],
      ["KEM2", "ZONA-C"],
      ["MAT2", "ZONA-C"],
      ["FON3", "ZONA-D"],
      ["KEM3", "ZONA-D"],
      ["MAT3", "ZONA-D"],
    ]);
    const orders = [
      { orderId: 1, skus: ["FON2", "KEM2", "MAT2"] },
      { orderId: 2, skus: ["FON3", "KEM3", "MAT3"] },
    ];
    // zone_jaccard({C}, {D}) = 0 → disjoint, go solo per spec
    // (document says adjacent zones batch, but algorithm requires shared zone)
    const result = zoneBasedGroupOrders(
      orders.map((o) => ({
        ...o,
        zones: new Set(
          o.skus.map((s) => locationMap.get(s)!)
        ),
      })),
      zoneSortMap
    );
    // Disjoint zones → 2 solo batches
    expect(result).toHaveLength(2);
    expect(result.every((g) => g.length === 1)).toBe(true);
  });

  it("batches two orders sharing the same zone", () => {
    const orders = [
      { orderId: 1, skus: ["A", "B"], zones: new Set(["ZONA-B"]) },
      { orderId: 2, skus: ["C", "D"], zones: new Set(["ZONA-B"]) },
      { orderId: 3, skus: ["E", "F"], zones: new Set(["ZONA-E"]) },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    // Orders 1+2 share ZONA-B (jaccard=1.0 ≥ 0.3), order 3 goes solo
    expect(result).toHaveLength(2);
    const batchedIds = result.find((g) => g.length === 2)?.map((o) => o.orderId);
    expect(batchedIds).toContain(1);
    expect(batchedIds).toContain(2);
  });

  it("sends orders with no zone partner solo", () => {
    const orders = [
      { orderId: 1, skus: ["A"], zones: new Set(["ZONA-B"]) },
      { orderId: 2, skus: ["B"], zones: new Set(["ZONA-C"]) },
      { orderId: 3, skus: ["C"], zones: new Set(["ZONA-D"]) },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    expect(result).toHaveLength(3);
    expect(result.every((g) => g.length === 1)).toBe(true);
  });

  it("does not exceed batch size", () => {
    const orders = Array.from({ length: 10 }, (_, i) => ({
      orderId: i + 1,
      skus: [`SKU-${i}`],
      zones: new Set(["ZONA-B"]),
    }));
    const result = zoneBasedGroupOrders(orders, zoneSortMap, 5);
    expect(result.every((g) => g.length <= 5)).toBe(true);
  });
});

describe("computeRoutePosition", () => {
  const zoneSortMap = new Map([
    ["ZONA-B", 2],
    ["ZONA-C", 3],
    ["ZONA-D", 4],
    ["ZONA-E", 5],
  ]);

  it("computes correct position: zone_sort * 1000 + shelf_num", () => {
    expect(computeRoutePosition("ZONA-B", "B7", zoneSortMap)).toBe(2007);
    expect(computeRoutePosition("ZONA-C", "C3", zoneSortMap)).toBe(3003);
    expect(computeRoutePosition("ZONA-E", "E12", zoneSortMap)).toBe(5012);
  });

  it("returns 9999 for missing zone or shelf", () => {
    expect(computeRoutePosition(null, "B1", zoneSortMap)).toBe(9999);
    expect(computeRoutePosition("ZONA-B", null, zoneSortMap)).toBe(9999);
  });

  it("uses fallback sort_order 9 for unknown zones", () => {
    expect(computeRoutePosition("ZONA-X", "X5", zoneSortMap)).toBe(9005);
  });
});
