"use client";

// Client-only. Loaded with dynamic(..., { ssr: false }); the wallet libraries are imported inside handlers,
// so they never load on the server or before the user presses Connect.
// UNTESTED with a real wallet and real tokens. Do not claim it works until the owner has tried it.

import { useRef, useState } from "react";
import { parseAddress, toTwin } from "@/lib/address";
import type { AddressView } from "@/lib/types";
import { apiGet } from "./api";
import { ADDRESS_0X, formatUnits, parseUnits, shorten } from "./format";
import { Notice, btnPrimary, btnSecondary, inputCls } from "./ui";

const NATIVE_DECIMALS = 14;
const WS_URL = process.env.NEXT_PUBLIC_NATIVE_WS_URL || "wss://test-node-v3.portaldot.dev";
const NODE_TIMEOUT_MS = 12_000;
const CONFIRM_TRIES = 8;
const CONFIRM_EVERY_MS = 2_500;

type Account = { address: string; name: string };
type Balances = { free: bigint | null; evm: bigint | null };

type Phase =
  | { k: "start" }
  | { k: "connecting" }
  | { k: "noext" }
  | { k: "noaccounts" }
  | { k: "ready" }
  | { k: "node" } // opening the connection to the node
  | { k: "wallet" } // wallet is open, waiting for the user
  | { k: "submitted" }
  | { k: "inblock"; hash: string }
  | { k: "confirming"; hash: string }
  | { k: "confirmed"; hash: string; before: Balances; after: Balances }
  | { k: "unconfirmed"; hash: string; before: Balances }
  | { k: "cancelled" }
  | { k: "mapped"; h160: string; already: boolean }
  | { k: "error"; kind: "insufficient" | "node" | "failed" | "input"; message: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function big(s: string | null): bigint | null {
  return s === null ? null : BigInt(s);
}

async function readBalances(target: string): Promise<Balances | null> {
  const r = await apiGet<AddressView>(`/api/address/${target}`);
  if (!r.ok) return null;
  return { free: big(r.data.nativeFree), evm: big(r.data.evmBalance) };
}

function rose(before: Balances, after: Balances): boolean {
  return (
    (before.free !== null && after.free !== null && after.free > before.free) ||
    (before.evm !== null && after.evm !== null && after.evm > before.evm)
  );
}

type OptionalAccount = { isSome: boolean; unwrap(): { toString(): string } };

function fmt(v: bigint | null, decimals: number) {
  return v === null ? "Could not read" : `${formatUnits(v.toString(), decimals).full} tPOT`;
}

export default function FundPanel({ target: initialTarget, onChanged }: { target: string; onChanged?: () => void }) {
  const [phase, setPhase] = useState<Phase>({ k: "start" });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [from, setFrom] = useState("");
  const [target, setTarget] = useState(initialTarget);
  const [amount, setAmount] = useState("");
  const busy = useRef(false);

  async function connect() {
    if (busy.current) return;
    busy.current = true;
    setPhase({ k: "connecting" });
    try {
      const dapp = await import("@polkadot/extension-dapp");
      const exts = await dapp.web3Enable("OneScan");
      if (exts.length === 0) {
        setPhase({ k: "noext" });
        return;
      }
      const found = (await dapp.web3Accounts({ ss58Format: 42 })).filter((a) => a.type !== "ethereum");
      if (found.length === 0) {
        setPhase({ k: "noaccounts" });
        return;
      }
      setAccounts(found.map((a) => ({ address: a.address, name: a.meta.name ?? "Account" })));
      setFrom(found[0].address);
      setPhase({ k: "ready" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/reject|cancel|denied|not allowed/i.test(msg)) {
        setPhase({ k: "cancelled" });
      } else {
        setPhase({ k: "error", kind: "failed", message: "The wallet did not connect. Reload the page and try again." });
      }
    } finally {
      busy.current = false;
    }
  }

  async function readEvmAddress() {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } })
      .ethereum;
    if (!eth) {
      setPhase({ k: "error", kind: "input", message: "No browser wallet with an 0x account was found. Paste the address instead." });
      return;
    }
    try {
      const list = await eth.request({ method: "eth_requestAccounts" });
      if (list[0]) {
        setTarget(list[0]);
        setPhase({ k: "ready" });
      }
    } catch {
      setPhase({ k: "error", kind: "input", message: "The browser wallet did not share an address. Paste it instead." });
    }
  }

  async function send() {
    if (busy.current) return;
    const value = parseUnits(amount, NATIVE_DECIMALS);
    if (!ADDRESS_0X.test(target.trim())) {
      setPhase({ k: "error", kind: "input", message: "The target must be an 0x address with 40 characters." });
      return;
    }
    if (value === null || value === BigInt(0)) {
      setPhase({
        k: "error",
        kind: "input",
        message: "Enter an amount in tPOT greater than 0, with at most 14 decimal places.",
      });
      return;
    }
    if (!from) return;
    busy.current = true;
    const to = target.trim().toLowerCase();

    setPhase({ k: "node" });
    let api: import("@polkadot/api").ApiPromise | null = null;
    try {
      const [{ ApiPromise, WsProvider }, dapp] = await Promise.all([
        import("@polkadot/api"),
        import("@polkadot/extension-dapp"),
      ]);
      const provider = new WsProvider(WS_URL);
      try {
        api = await Promise.race([
          ApiPromise.create({ provider, noInitWarn: true }),
          sleep(NODE_TIMEOUT_MS).then(() => {
            throw new Error("node-timeout");
          }),
        ]);
      } catch {
        try {
          await provider.disconnect();
        } catch {}
        setPhase({
          k: "error",
          kind: "node",
          message: "Could not reach the Portaldot node. Nothing was sent. Try again in a moment.",
        });
        return;
      }

      if (to === parseAddress(from)?.h160.toLowerCase()) {
        setPhase({
          k: "error",
          kind: "input",
          message: "That is the 0x address of this same account, so there is nothing to send. Use Map this account instead.",
        });
        return;
      }
      // A mapped 0x address belongs to its original account. Anything else is a key like MetaMask's.
      const owner = (await api.query.revive.originalAccount(to)) as unknown as OptionalAccount;
      const dest = owner.isSome ? owner.unwrap().toString() : toTwin(to);
      const tx = api.tx.balances.transferKeepAlive(dest, value.toString());

      // Specific insufficient-balance check before the wallet opens.
      try {
        const acct = (await api.query.system.account(from)) as unknown as { data: { free: { toString(): string } } };
        const free = BigInt(acct.data.free.toString());
        let fee = BigInt(0);
        try {
          const info = await tx.paymentInfo(from);
          fee = BigInt(info.partialFee.toString());
        } catch {}
        if (free < value + fee) {
          setPhase({
            k: "error",
            kind: "insufficient",
            message: `This wallet account has ${fmt(free, NATIVE_DECIMALS)}. Sending ${formatUnits(value.toString(), NATIVE_DECIMALS).full} tPOT plus the network fee needs more. Nothing was sent.`,
          });
          return;
        }
      } catch {
        setPhase({
          k: "error",
          kind: "node",
          message: "Could not read your balance from the node. Nothing was sent. Try again.",
        });
        return;
      }

      const before = (await readBalances(to)) ?? { free: null, evm: null };
      const injector = await dapp.web3FromAddress(from);

      setPhase({ k: "wallet" });
      const hash = await new Promise<string>((resolve, reject) => {
        const a = api!;
        tx.signAndSend(from, { signer: injector.signer }, (res) => {
          if (res.dispatchError) {
            let text = res.dispatchError.toString();
            if (res.dispatchError.isModule) {
              const m = a.registry.findMetaError(res.dispatchError.asModule);
              text = `${m.section}.${m.name}`;
            }
            reject(new Error(`dispatch:${text}`));
            return;
          }
          if (res.status.isReady || res.status.isBroadcast) setPhase({ k: "submitted" });
          if (res.status.isInBlock) resolve(res.status.asInBlock.toHex());
        }).catch(reject);
      });

      setPhase({ k: "confirming", hash });
      for (let i = 0; i < CONFIRM_TRIES; i++) {
        await sleep(CONFIRM_EVERY_MS);
        const after = await readBalances(to);
        if (after && rose(before, after)) {
          setPhase({ k: "confirmed", hash, before, after });
          onChanged?.();
          return;
        }
      }
      setPhase({ k: "unconfirmed", hash, before });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|reject|denied/i.test(msg)) {
        setPhase({ k: "cancelled" });
      } else if (msg.startsWith("dispatch:")) {
        const name = msg.slice(9);
        if (/InsufficientBalance|FundsUnavailable/.test(name)) {
          setPhase({ k: "error", kind: "insufficient", message: "The chain refused the transfer: not enough balance. Nothing moved." });
        } else if (/Expendability|KeepAlive/.test(name)) {
          setPhase({
            k: "error",
            kind: "failed",
            message: "The chain refused the transfer because it would leave your account below the minimum balance. Send a smaller amount. Nothing moved.",
          });
        } else {
          setPhase({ k: "error", kind: "failed", message: `The chain refused the transfer (${name}). Nothing moved.` });
        }
      } else if (/1010|Priority|balance|funds/i.test(msg)) {
        setPhase({ k: "error", kind: "insufficient", message: "The node says this account cannot pay for the transfer. Nothing was sent." });
      } else {
        setPhase({ k: "error", kind: "failed", message: `The transfer failed: ${msg}. Nothing was confirmed.` });
      }
    } finally {
      busy.current = false;
      try {
        await api?.disconnect();
      } catch {}
    }
  }

  async function mapAccount() {
    if (busy.current || !from) return;
    const h160 = parseAddress(from)?.h160.toLowerCase();
    if (!h160) return;
    busy.current = true;
    setPhase({ k: "node" });
    let api: import("@polkadot/api").ApiPromise | null = null;
    try {
      const [{ ApiPromise, WsProvider }, dapp] = await Promise.all([
        import("@polkadot/api"),
        import("@polkadot/extension-dapp"),
      ]);
      const provider = new WsProvider(WS_URL);
      try {
        api = await Promise.race([
          ApiPromise.create({ provider, noInitWarn: true }),
          sleep(NODE_TIMEOUT_MS).then(() => {
            throw new Error("node-timeout");
          }),
        ]);
      } catch {
        try {
          await provider.disconnect();
        } catch {}
        setPhase({ k: "error", kind: "node", message: "Could not reach the Portaldot node. Nothing changed. Try again in a moment." });
        return;
      }
      const isMapped = async () => ((await api!.query.revive.originalAccount(h160)) as unknown as OptionalAccount).isSome;
      if (await isMapped()) {
        setPhase({ k: "mapped", h160, already: true });
        onChanged?.();
        return;
      }
      const injector = await dapp.web3FromAddress(from);
      setPhase({ k: "wallet" });
      await new Promise<void>((resolve, reject) => {
        const a = api!;
        a.tx.revive
          .mapAccount()
          .signAndSend(from, { signer: injector.signer }, (res) => {
            if (res.dispatchError) {
              let text = res.dispatchError.toString();
              if (res.dispatchError.isModule) {
                const m = a.registry.findMetaError(res.dispatchError.asModule);
                text = `${m.section}.${m.name}`;
              }
              reject(new Error(`dispatch:${text}`));
              return;
            }
            if (res.status.isReady || res.status.isBroadcast) setPhase({ k: "submitted" });
            if (res.status.isInBlock) resolve();
          })
          .catch(reject);
      });
      setPhase({ k: "inblock", hash: "" });
      if (await isMapped()) {
        setPhase({ k: "mapped", h160, already: false });
        onChanged?.();
      } else {
        setPhase({ k: "error", kind: "failed", message: "The request reached a block, but the chain does not show this account as mapped." });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|reject|denied/i.test(msg)) {
        setPhase({ k: "cancelled" });
      } else if (/1010|Priority|balance|funds|InsufficientBalance|FundsUnavailable|StorageDepositNotEnoughFunds/i.test(msg)) {
        setPhase({ k: "error", kind: "insufficient", message: "This account does not hold enough tPOT to pay the fee and the refundable deposit. Nothing changed." });
      } else {
        setPhase({ k: "error", kind: "failed", message: `Mapping failed: ${msg.replace("dispatch:", "")}. Nothing changed.` });
      }
    } finally {
      busy.current = false;
      try {
        await api?.disconnect();
      } catch {}
    }
  }

  async function checkAgain(before: Balances, hash: string) {
    if (busy.current) return;
    busy.current = true;
    setPhase({ k: "confirming", hash });
    const after = await readBalances(target.trim().toLowerCase());
    busy.current = false;
    if (after && rose(before, after)) {
      setPhase({ k: "confirmed", hash, before, after });
      onChanged?.();
    } else {
      setPhase({ k: "unconfirmed", hash, before });
    }
  }

  const working = ["connecting", "node", "wallet", "submitted", "inblock", "confirming"].includes(phase.k);
  const showForm =
    ["ready", "cancelled", "confirmed", "unconfirmed", "mapped"].includes(phase.k) ||
    phase.k === "error" ||
    (working && phase.k !== "connecting");
  const locked = working;

  return (
    <section aria-labelledby="fund-title" className="mt-10 border-t-2 border-ink pt-5">
      <h2 id="fund-title" className="font-serif text-2xl font-medium">
        Use your tPOT on the EVM side
      </h2>
      <p className="mt-2 max-w-2xl">
        Your 5... account already has a 0x address. Map it once and the same balance is usable on the EVM side. Your
        wallet asks you to approve each step. OneScan never sees your keys and never asks for a seed phrase.
      </p>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        These tools have not yet been tested with a real wallet and real tokens. Try a small amount first.
      </p>

      <div className="mt-4 space-y-4" aria-live="polite">
        {phase.k === "start" && (
          <button type="button" onClick={connect} className={btnPrimary}>
            Connect wallet
          </button>
        )}
        {phase.k === "connecting" && <Notice title="Looking for your wallet">Approve the connection in the wallet window if it opens.</Notice>}
        {phase.k === "noext" && (
          <Notice tone="warn" title="No wallet found in this browser">
            <p>
              Install the SubWallet browser extension, create or import an account in it, then reload this page and
              press Connect again.
            </p>
            <button type="button" onClick={() => setPhase({ k: "start" })} className={`${btnSecondary} mt-3`}>
              Try again
            </button>
          </Notice>
        )}
        {phase.k === "noaccounts" && (
          <Notice tone="warn" title="The wallet shared no accounts">
            <p>Open your wallet, allow OneScan to see at least one 5... account, then try again.</p>
            <button type="button" onClick={() => setPhase({ k: "start" })} className={`${btnSecondary} mt-3`}>
              Try again
            </button>
          </Notice>
        )}

        {phase.k === "mapped" && (
          <Notice tone="ok" title={phase.already ? "This account is already mapped" : "Confirmed: this account is mapped"} role="status">
            <p className="break-all">
              Its 0x address is <code className="font-mono text-sm">{phase.h160}</code>, and it uses the same balance.
            </p>
          </Notice>
        )}

        {showForm && (
          <div className="border border-rule bg-surface p-4">
            <h3 className="font-medium">Map this account</h3>
            <p className="mt-1 text-muted">
              Registers your account for contract use. It costs a small fee and a deposit you can get back by unmapping.
              MetaMask cannot sign for this 0x address, because its key is your 5... wallet.
            </p>
            <button type="button" onClick={mapAccount} disabled={locked} className={`${btnPrimary} mt-3`}>
              {working ? "Working" : "Map this account"}
            </button>
          </div>
        )}

        {showForm && <h3 className="font-medium">Or send tPOT to a MetaMask address</h3>}

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            noValidate
            className="space-y-4"
          >
            <div>
              <label htmlFor="fund-from" className="block font-medium">
                From your wallet account
              </label>
              <select
                id="fund-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={locked}
                className={`${inputCls} mt-1`}
              >
                {accounts.map((a) => (
                  <option key={a.address} value={a.address}>
                    {a.name} ({shorten(a.address, 6, 6)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fund-target" className="block font-medium">
                To this 0x address
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <input
                  id="fund-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  disabled={locked}
                  placeholder="0x..."
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputCls} font-mono text-sm`}
                />
                <button type="button" onClick={readEvmAddress} disabled={locked} className={`${btnSecondary} sm:shrink-0`}>
                  Read from browser wallet
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="fund-amount" className="block font-medium">
                Amount (tPOT)
              </label>
              <input
                id="fund-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={locked}
                inputMode="decimal"
                placeholder="1.5"
                autoComplete="off"
                className={`${inputCls} mt-1 sm:max-w-48`}
              />
            </div>
            <p className="text-sm text-muted">Your wallet will open to approve this.</p>
            <button type="submit" disabled={locked} className={btnPrimary}>
              {working ? "Working" : "Send tPOT"}
            </button>
          </form>
        )}

        {phase.k === "node" && <Notice title="Connecting to the Portaldot node">Checking your balance before the wallet opens.</Notice>}
        {phase.k === "wallet" && <Notice title="Waiting for your approval">Approve or reject in your wallet window. Nothing has been sent yet.</Notice>}
        {phase.k === "submitted" && <Notice title="Submitted">The transfer was sent to the network and is waiting for a block.</Notice>}
        {phase.k === "inblock" && <Notice title="In a block">Included in a block. Checking that the balance rose.</Notice>}
        {phase.k === "confirming" && (
          <Notice title="In a block, checking the balance">
            Waiting for the new balance to show up. This can take about 20 seconds.
          </Notice>
        )}
        {phase.k === "confirmed" && (
          <Notice tone="ok" title="Confirmed: the balance rose" role="status">
            <p>
              Native balance {fmt(phase.before.free, NATIVE_DECIMALS)} became {fmt(phase.after.free, NATIVE_DECIMALS)}.
              EVM balance {fmt(phase.before.evm, 18)} became {fmt(phase.after.evm, 18)}.
            </p>
            <p className="mt-1 break-all font-mono text-sm">Block {phase.hash}</p>
          </Notice>
        )}
        {phase.k === "unconfirmed" && (
          <Notice tone="warn" title="In a block, but the balance has not risen yet" role="status">
            <p>
              The transfer was included in a block. The new balance is not visible yet, or could not be read. Nothing
              is confirmed until the balance rises.
            </p>
            <p className="mt-1 break-all font-mono text-sm">Block {phase.hash}</p>
            <button type="button" onClick={() => checkAgain(phase.before, phase.hash)} className={`${btnSecondary} mt-3`}>
              Check the balance again
            </button>
          </Notice>
        )}
        {phase.k === "cancelled" && (
          <Notice title="Nothing changed" role="status">
            You closed or rejected the request in your wallet. No tokens moved. You can try again.
          </Notice>
        )}
        {phase.k === "error" && (
          <Notice
            tone="bad"
            role="alert"
            title={
              phase.kind === "insufficient"
                ? "Not enough balance"
                : phase.kind === "node"
                  ? "Could not reach the node"
                  : phase.kind === "input"
                    ? "Check the form"
                    : "The transfer failed"
            }
          >
            {phase.message}
          </Notice>
        )}
      </div>
    </section>
  );
}
