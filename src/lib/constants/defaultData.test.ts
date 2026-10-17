import { describe, expect, it } from "vitest";
import { toDecimal } from "@/lib/finance/money";
import { quantityAfterActions } from "@/lib/finance/portfolio";
import { DEFAULT_ACTIONS, DEFAULT_POSITIONS } from "./defaultData";

describe("guest demo data", () => {
  it("has valid chronological actions that reconcile to the demo holdings", () => {
    const orderedActions = [...DEFAULT_ACTIONS].sort((left, right) => left.timestamp - right.timestamp);
    expect(DEFAULT_ACTIONS).toEqual(orderedActions);

    for (const action of DEFAULT_ACTIONS) {
      expect(toDecimal(action.quantity).isPositive()).toBe(true);
      expect(toDecimal(action.price).isPositive()).toBe(true);
    }

    for (const holding of DEFAULT_POSITIONS) {
      expect(quantityAfterActions(DEFAULT_ACTIONS, holding.symbol).equals(holding.quantity)).toBe(true);
    }
  });
});