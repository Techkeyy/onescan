// Regression tests from the audit: a hostile repo file must not stall the server.
// The parsers below run on the main thread. With the old regexes each input took tens of seconds at this size.
import { describe, expect, it } from "vitest";
import { parseHardhatConfig } from "./config";
import { parseImports } from "./imports";
import { parsePragmas } from "./pragma";

const SIZE = 256 * 1024;
const big = (unit: string) => unit.repeat(Math.floor(SIZE / unit.length));
const timed = (f: () => unknown) => {
  const t = Date.now();
  f();
  return Date.now() - t;
};

describe("hostile source files are parsed in linear time", () => {
  it("imports: repeated import keywords", () => {
    expect(timed(() => parseImports(big("import ")))).toBeLessThan(3000);
    expect(timed(() => parseImports(big("import {") + ";"))).toBeLessThan(3000);
  });
  it("pragma: repeated pragma solidity", () => {
    expect(timed(() => parsePragmas(big("pragma solidity ")))).toBeLessThan(3000);
    expect(timed(() => parsePragmas(big("pragma solidity ") + ";"))).toBeLessThan(3000);
  });
  it("hardhat config: repeated optimizer blocks", () => {
    expect(timed(() => parseHardhatConfig(big("optimizer: {")))).toBeLessThan(3000);
  });
  it("still reads real imports, pragmas and settings", () => {
    expect(parseImports('import "./a.sol";\nimport {A as B} from "./b.sol";\nimport * as X from \'../c.sol\';')).toEqual([
      "./a.sol",
      "./b.sol",
      "../c.sol",
    ]);
    expect(parsePragmas("pragma solidity ^0.8.20;")).toEqual(["^0.8.20"]);
    expect(parseHardhatConfig("module.exports = { solidity: { settings: { optimizer: { enabled: true, runs: 1 } } } };")).toEqual({
      optimizer: true,
      runs: 1,
    });
  });
});
