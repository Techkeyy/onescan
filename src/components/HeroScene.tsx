"use client";

// One illustration for the home page. It replays what the product does:
// a repo and an address go in, the stages run, the verdict is stamped.
// Built with Stageshow (Benji Taylor, MIT) from its payout-flow structure.
// The scene is not interactive: no cursor, no links, no focusable parts.

import { useSyncExternalStore } from "react";
import { Check, Field, Stage, Window, type Act } from "./stageshow-kit";
import "./hero-scene.css";

type S = { repo: string; addr: string; focus: "repo" | "addr" | null; step: number; stamp: boolean };

const REPO = "Firzadf/nodescope";
const ADDR = "0xd48da7eff3264bdd51a86b873da9ff6997aae99c";
const START: S = { repo: "", addr: "", focus: null, step: 0, stamp: false };
const POSTER: S = { repo: REPO, addr: ADDR, focus: null, step: 6, stamp: true };

const STAGES = [
  { label: "Bytecode", detail: "806 bytes" },
  { label: "Compiler", detail: "solc 0.8.24" },
  { label: "Repo", detail: "commit 319fe0a" },
  { label: "Compile", detail: "1 contract" },
  { label: "Compare", detail: "identical" },
];

const script = async (a: Act<S>) => {
  await a.wait(500);
  a.put({ focus: "repo" });
  await a.type("repo", REPO, { interval: 45 });
  await a.wait(300);
  a.put({ focus: "addr" });
  await a.type("addr", ADDR, { interval: 28 });
  await a.wait(500);
  a.put({ focus: null });
  for (let i = 1; i <= 5; i++) {
    a.put({ step: i });
    await a.wait(i === 4 ? 1800 : 1100);
  }
  a.put({ step: 6 });
  await a.wait(300);
  a.put({ stamp: true });
  await a.wait(2500);
};

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function HeroScene() {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return (
    <Stage<S>
      width={520}
      height={400}
      compact={{ below: 480, width: 358, height: 360 }}
      initial={START}
      poster={POSTER}
      script={script}
      play="once"
      theme={dark ? "dark" : "light"}
      className="os-hero"
    >
      {(s, _rect, layout) => {
        const compact = layout === "compact";
        return (
          <>
            <Window
              title="Check"
              className="os-window"
              style={{
                position: "absolute",
                left: compact ? 14 : 24,
                top: 24,
                width: compact ? 300 : 360,
                height: compact ? 360 : 400,
              }}
            >
              <div className="os-body">
                <Field label="GitHub repo" value={s.repo} focused={s.focus === "repo"} className="os-field" />
                <Field label="Contract address" value={s.addr} focused={s.focus === "addr"} className="os-field" />
                <ol className="os-stages">
                  {STAGES.map((st, i) => {
                    const done = s.step > i + 1;
                    const running = s.step === i + 1;
                    const started = s.step >= i + 1;
                    return (
                      <li key={st.label} className="os-stage" data-on={started || undefined}>
                        <Check on={done} pending={running} size={14} />
                        <span className="os-stage__label">{st.label}</span>
                        {!compact && (
                          <span className="os-stage__detail" data-in={done || undefined}>
                            {st.detail}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </Window>
            <div className="os-stamp" data-in={s.stamp || undefined} data-compact={compact || undefined}>
              <span className="os-stamp__kicker">Verdict</span>
              <span className="os-stamp__title">Exact match</span>
              <span className="os-stamp__meta">nodescope at 319fe0a</span>
            </div>
          </>
        );
      }}
    </Stage>
  );
}
