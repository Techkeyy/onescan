// Server-only (do not import from client code). One shared lazily-created @polkadot/api connection.
// Every read has a timeout and returns null on any failure: the public node rejects when overloaded.
import { ApiPromise, WsProvider } from "@polkadot/api";

export const NATIVE_WS_URL = () => process.env.NATIVE_WS_URL || "wss://test-node-v3.portaldot.dev";
const CONNECT_MS = 10_000;
const READ_MS = 8_000;
const RETRY_AFTER_FAIL_MS = 10_000;

const g = globalThis as unknown as { __onescanNative?: { api?: Promise<ApiPromise>; failedAt?: number } };
const state = (g.__onescanNative ??= {});

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error("timeout")), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

async function getApi(): Promise<ApiPromise | null> {
  if (!state.api) {
    if (state.failedAt && Date.now() - state.failedAt < RETRY_AFTER_FAIL_MS) return null;
    const provider = new WsProvider(NATIVE_WS_URL());
    const created = ApiPromise.create({ provider, noInitWarn: true });
    created.catch(() => {});
    state.api = withTimeout(created, CONNECT_MS).catch(async (e) => {
      state.api = undefined;
      state.failedAt = Date.now();
      try {
        await provider.disconnect();
      } catch {}
      throw e;
    });
  }
  try {
    return await state.api;
  } catch {
    return null;
  }
}

/** Free native balance in base units (14 decimals), or null when unreadable. */
export async function getNativeFree(account: string): Promise<string | null> {
  try {
    const api = await getApi();
    if (!api) return null;
    const info = (await withTimeout(api.query.system.account(account), READ_MS)) as unknown as {
      data: { free: { toString(): string } };
    };
    return info.data.free.toString();
  } catch {
    return null;
  }
}

/**
 * revive.originalAccount(h160): `{ account }` with the 32-byte AccountId when set,
 * `{ account: null }` when the chain says it is not set, or null when the read failed.
 */
export async function getOriginalAccount(h160: string): Promise<{ account: Uint8Array | null } | null> {
  try {
    const api = await getApi();
    if (!api) return null;
    const q = api.query.revive?.originalAccount;
    if (!q) return null;
    const opt = (await withTimeout(q(h160), READ_MS)) as unknown as {
      isSome: boolean;
      unwrap(): { toU8a(): Uint8Array };
    };
    return { account: opt.isSome ? opt.unwrap().toU8a() : null };
  } catch {
    return null;
  }
}
