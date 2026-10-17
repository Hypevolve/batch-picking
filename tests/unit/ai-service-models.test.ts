import { describe, expect, it } from "vitest";
import { activeModel, RETIRED_MODELS } from "@/server/services/ai-service";

// gemini-2.5-flash se na OpenRouteru gasi 20.10.2026. Na starom kodu ovaj test pada:
// activeModel i RETIRED_MODELS nisu postojali, a ugašeni model se slao kakav jest.
describe("activeModel", () => {
  it("ugašeni gemini-2.5-flash zamjenjuje s gemini-3.5-flash-lite", () => {
    expect(activeModel("google/gemini-2.5-flash")).toBe("google/gemini-3.5-flash-lite");
    expect(activeModel("google/gemini-2.5-flash-lite")).toBe("google/gemini-3.5-flash-lite");
  });

  it("model koji nije ugašen ostaje isti", () => {
    expect(activeModel("openai/gpt-4.1-mini")).toBe("openai/gpt-4.1-mini");
  });

  it("nijedna zamjena nije i sama na popisu ugašenih", () => {
    for (const replacement of Object.values(RETIRED_MODELS)) {
      expect(RETIRED_MODELS[replacement]).toBeUndefined();
    }
  });
});
