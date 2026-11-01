import { describe, expect, it } from "vitest";
import { getCode, getCreation, vmKind } from "./chain";

const NODESCOPE = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";

describe("chain (live testnet)", () => {
  it("vmKind classifies code", () => {
    expect(vmKind("0x")).toBe("none");
    expect(vmKind("0x50564d00aa")).toBe("polkavm");
    expect(vmKind("0x6080")).toBe("evm");
  });

  it("getCreation finds block 216268 and the deploy tx", { timeout: 90_000 }, async () => {
    expect((await getCode(NODESCOPE)).startsWith("0x6080")).toBe(true);
    const c = await getCreation(NODESCOPE);
    expect(c).not.toBeNull();
    expect(c!.block).toBe(216268);
    expect(c!.txHash).toBe("0x1c2a055523a4cf8b73d771df4d3c54d21392a85f86a14a4d68213bf6db5f4904");
  });
});
