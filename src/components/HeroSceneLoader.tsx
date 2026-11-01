"use client";

import dynamic from "next/dynamic";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

/** The only illustration on the site. Loaded in the browser after first paint; the figure reserves its space. */
export function HeroSceneLoader() {
  return (
    <figure
      className="mt-10 lg:mt-0"
      aria-label="Illustration: a repo and a contract address go in, the stages run, the verdict is stamped"
    >
      <div className="aspect-[358/360] w-full min-[480px]:aspect-[520/400]" aria-hidden="true">
        <HeroScene />
      </div>
      <figcaption className="mt-2 text-sm text-muted">Illustration of a check, sped up</figcaption>
    </figure>
  );
}
