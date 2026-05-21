import { describe, it, expect } from "vitest";
import {
  calculateJaccardSimilarity,
  greedyGroupOrders,
  classifyBatchType,
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
