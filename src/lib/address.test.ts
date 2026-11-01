import { describe, expect, it } from "vitest";
import { encodeAddress } from "@polkadot/util-crypto";
import { decodeAddress } from "@polkadot/util-crypto";
import { parseAddress, toTwin } from "./address";

const NATIVE = "5DcritAN6VxWuzBKX7VoLqy8yotyyCA1AX1cSpH63So9tm8z";
const NATIVE_H160 = "0x71da9ed9cebfaf7c8719667180fc8978db3be821";
const ETH = "0x586992529e9612533a4efbaf22e65341ea5e6c44";
const ETH_TWIN = "5E4dS2avdMeTL2exX7L9K1h9AFrsD5MCQDdJHW1WtTmBmyBR";

describe("address", () => {
  it("native 5... -> keccak H160, origin native", () => {
    const p = parseAddress(NATIVE)!;
    expect(p.h160).toBe(NATIVE_H160);
    expect(p.origin).toBe("native");
    expect(p.native).toBe(NATIVE);
  });
  it("0x -> twin with 0xEE padding, origin eth", () => {
    const p = parseAddress(ETH)!;
    expect(p.native).toBe(ETH_TWIN);
    expect(p.origin).toBe("eth");
    expect(toTwin(ETH)).toBe(ETH_TWIN);
  });
  it("5... twin -> origin eth and the original H160", () => {
    const p = parseAddress(ETH_TWIN)!;
    expect(p.h160).toBe(ETH);
    expect(p.origin).toBe("eth");
  });
  it("accepts another SS58 prefix and normalises to 42", () => {
    const other = encodeAddress(decodeAddress(NATIVE), 0);
    expect(other).not.toBe(NATIVE);
    expect(parseAddress(other)!.native).toBe(NATIVE);
  });
  it("rejects junk and bad checksums", () => {
    expect(parseAddress("hello")).toBeNull();
    expect(parseAddress("0x1234")).toBeNull();
    expect(parseAddress(NATIVE.slice(0, -1) + "A")).toBeNull();
  });
});
