import { afterEach, describe, expect, it } from "vitest";
import { clientAddress, liveStatus, normaliseAddress, normaliseRepo } from "./util";

const ADDR = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";
const saved = process.env.EVM_RPC_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.EVM_RPC_URL;
  else process.env.EVM_RPC_URL = saved;
});

describe("api util", () => {
  it("RPC failure gives live unknown, never current", async () => {
    process.env.EVM_RPC_URL = "http://127.0.0.1:1";
    const r = await liveStatus(ADDR, "0x" + "00".repeat(32));
    expect(r.live).toBe("unknown");
  });

  it("live bytecode is compared against the stored hash (live RPC)", async () => {
    expect((await liveStatus(ADDR, "0x" + "00".repeat(32))).live).toBe("changed");
  });

  it("validates repo and address", () => {
    expect(normaliseRepo("Firzadf/nodescope")).toBe("Firzadf/nodescope");
    expect(normaliseRepo("https://github.com/Firzadf/nodescope.git")).toBe("Firzadf/nodescope");
    expect(normaliseRepo("https://github.com/Firzadf/nodescope/")).toBe("Firzadf/nodescope");
    expect(normaliseRepo("https://evil.com/a/b")).toBeNull();
    expect(normaliseRepo("a/b/c")).toBeNull();
    expect(normaliseRepo("../x")).toBeNull();
    expect(normaliseAddress(ADDR)).toBe(ADDR);
    expect(normaliseAddress("0x12")).toBeNull();
    expect(normaliseAddress("5DcritAN6VxWuzBKX7VoLqy8yotyyCA1AX1cSpH63So9tm8z")).toBeNull();
  });
});

describe("clientAddress", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("believes the front door only with the right secret", () => {
    const named = { "x-onescan-client": "1.1.1.1", "x-forwarded-for": "9.9.9.9" };
    expect(clientAddress(h({ ...named, "x-onescan-proxy": "s3cret" }), "s3cret")).toBe("1.1.1.1");
    expect(clientAddress(h({ ...named, "x-onescan-proxy": "wrong" }), "s3cret")).toBe("9.9.9.9");
    expect(clientAddress(h(named), "s3cret")).toBe("9.9.9.9");
  });
  it("never trusts the header when no secret is configured", () => {
    expect(clientAddress(h({ "x-onescan-client": "1.1.1.1", "x-onescan-proxy": "", "x-forwarded-for": "9.9.9.9" }), undefined)).toBe("9.9.9.9");
    expect(clientAddress(h({ "x-onescan-client": "1.1.1.1", "x-onescan-proxy": "" }), "")).toBe("local");
  });
});
