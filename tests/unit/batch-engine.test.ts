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

  it("never exceeds 60 books per batch", () => {
    const orders = Array.from({ length: 4 }, (_, i) => ({
      orderId: i + 1,
      skus: ["A", "B"],
      bookCount: 25,
    }));
    const groups = greedyGroupOrders(orders, 5);
    for (const g of groups) {
      const books = g.reduce((s, o) => s + (o.bookCount ?? o.skus.length), 0);
      expect(books).toBeLessThanOrEqual(60);
    }
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

  it("treats zone codes case-insensitively (ZONA-b === ZONA-B)", () => {
    // Locations are typed by hand; a stray lowercase code must not split one zone into two.
    const mixedCaseMap = new Map([
      ["SKU-1", "ZONA-B"],
      ["SKU-2", "ZONA-b"],
    ]);
    const orders = [{ orderId: 1, skus: ["SKU-1", "SKU-2"] }];
    const result = buildZoneProfiles(orders, mixedCaseMap);
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

  it("batches orders from adjacent zones (C + D → same batch)", () => {
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
    const result = zoneBasedGroupOrders(
      orders.map((o) => ({
        ...o,
        zones: new Set(
          o.skus.map((s) => locationMap.get(s)!)
        ),
      })),
      zoneSortMap
    );
    // C(3) + D(4) are adjacent (span=1 < 2) → grouped together
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
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

  it("sends orders in non-adjacent zones solo", () => {
    const orders = [
      { orderId: 1, skus: ["A"], zones: new Set(["ZONA-A"]) },
      { orderId: 2, skus: ["B"], zones: new Set(["ZONA-C"]) },
      { orderId: 3, skus: ["C"], zones: new Set(["ZONA-E"]) },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    // A(1), C(3), E(5) — no pair is adjacent (all spans ≥ 2)
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

  // ─── A2 rule: identical / strongly overlapping orders merge regardless of zones ───

  it("merges two identical orders even when their books span far zones (A2)", () => {
    const orders = [
      { orderId: 1, skus: ["kA", "kE"], zones: new Set(["ZONA-A", "ZONA-E"]) },
      { orderId: 2, skus: ["kA", "kE"], zones: new Set(["ZONA-A", "ZONA-E"]) },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("merges identical orders spanning zones A + C (was split by MAX_ZONE_SPAN)", () => {
    const orders = [
      { orderId: 1, skus: ["kA", "kC"], zones: new Set(["ZONA-A", "ZONA-C"]) },
      { orderId: 2, skus: ["kA", "kC"], zones: new Set(["ZONA-A", "ZONA-C"]) },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("merges strongly overlapping orders across far zones, leaves unrelated ones solo", () => {
    const orders = [
      { orderId: 1, skus: ["a", "b", "c", "d"], zones: new Set(["ZONA-A"]) },
      { orderId: 2, skus: ["a", "b", "c", "e"], zones: new Set(["ZONA-E"]) }, // 3/5 overlap with #1
      { orderId: 3, skus: ["x", "y"], zones: new Set(["ZONA-C"]) }, // unrelated + far
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    expect(result).toHaveLength(2);
    const merged = result.find((g) => g.length === 2)?.map((o) => o.orderId).sort();
    expect(merged).toEqual([1, 2]);
  });

  // ─── Shared-title merge: big orders that share ≥3 titles but dilute below the Jaccard threshold ───

  it("merges big orders that share 3 titles despite low overlap % and far-zone stragglers", () => {
    // Real case (Bojan, 24.7.): ~15-book orders, mostly zone A, a couple books in far zones,
    // sharing 5-6 titles. Jaccard here ≈ 3/13 ≈ 0.23 (below STRONG_SKU_OVERLAP=0.5),
    // and combined zones A+F+G span far beyond MAX_ZONE_SPAN — so neither current path merges them.
    const farZoneSortMap = new Map([
      ["ZONA-A", 1],
      ["ZONA-F", 6],
      ["ZONA-G", 7],
    ]);
    const orders = [
      { orderId: 1, skus: ["s1", "s2", "s3", "a1", "a2", "a3", "a4", "a5"], zones: new Set(["ZONA-A", "ZONA-F"]) },
      { orderId: 2, skus: ["s1", "s2", "s3", "b1", "b2", "b3", "b4", "b5"], zones: new Set(["ZONA-A", "ZONA-G"]) },
    ];
    const result = zoneBasedGroupOrders(orders, farZoneSortMap);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("keeps orders apart when they share only 2 titles across far zones", () => {
    // Boundary: below the 3-shared-title rule, low Jaccard + far zones must still go solo.
    const farZoneSortMap = new Map([
      ["ZONA-A", 1],
      ["ZONA-F", 6],
      ["ZONA-G", 7],
    ]);
    const orders = [
      { orderId: 1, skus: ["s1", "s2", "a1", "a2", "a3", "a4", "a5"], zones: new Set(["ZONA-A", "ZONA-F"]) },
      { orderId: 2, skus: ["s1", "s2", "b1", "b2", "b3", "b4", "b5"], zones: new Set(["ZONA-A", "ZONA-G"]) },
    ];
    const result = zoneBasedGroupOrders(orders, farZoneSortMap);
    expect(result).toHaveLength(2);
  });

  it("keeps identical orders apart when combined books exceed cart capacity (60)", () => {
    const orders = [
      { orderId: 1, skus: ["kA"], zones: new Set(["ZONA-A"]), bookCount: 40 },
      { orderId: 2, skus: ["kA"], zones: new Set(["ZONA-A"]), bookCount: 40 },
    ];
    const result = zoneBasedGroupOrders(orders, zoneSortMap);
    expect(result).toHaveLength(2);
  });

  it("never exceeds 60 books per batch", () => {
    const orders = Array.from({ length: 4 }, (_, i) => ({
      orderId: i + 1,
      skus: ["A"],
      zones: new Set(["ZONA-B"]),
      bookCount: 25,
    }));
    const result = zoneBasedGroupOrders(orders, zoneSortMap, 5);
    for (const g of result) {
      const books = g.reduce((s, o) => s + (o.bookCount ?? o.skus.length), 0);
      expect(books).toBeLessThanOrEqual(60);
    }
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

  it("resolves zone sort order case-insensitively (ZONA-b uses ZONA-B's order)", () => {
    expect(computeRoutePosition("ZONA-b", "b7", zoneSortMap)).toBe(2007);
  });
});
