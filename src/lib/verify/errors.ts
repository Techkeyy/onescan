import type { VerifyFailureReason } from "../types";

/** A definite, user-facing outcome (maps onto VerifyResult.failure). */
export class VerifyFailure extends Error {
  constructor(
    public readonly reason: VerifyFailureReason,
    public readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = "VerifyFailure";
  }
}

/**
 * The RPC or GitHub could not be reached or answered with a server error.
 * This is NOT a verdict about the contract, so verify() throws instead of returning a failure.
 * (types.ts has no failure reason for it; see the report.)
 */
export class VerifyUnavailableError extends Error {
  constructor(
    public readonly service: "rpc" | "github" | "solc" | "npm",
    message: string,
  ) {
    super(`${service} unavailable: ${message}`);
    this.name = "VerifyUnavailableError";
  }
}
