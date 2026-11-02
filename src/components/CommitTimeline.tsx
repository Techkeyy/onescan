/** Draws itself as it scrolls into view. Shows the shape of a real result, not invented data. */
export function CommitTimeline() {
  const x = [24, 124, 224, 324, 424, 524];
  const deployed = 2;
  const latest = x.length - 1;
  return (
    <figure>
      <svg
        viewBox="0 0 548 150"
        className="w-full"
        role="img"
        aria-label="A row of commits. The contract was deployed from an earlier commit, which matches. The latest commit came later and does not match."
      >
        <line x1={x[0]} x2={x[latest]} y1="70" y2="70" stroke="var(--rule)" strokeWidth="2" />
        <line
          className="draw-on-scroll"
          pathLength={1}
          x1={x[0]}
          x2={x[latest]}
          y1="70"
          y2="70"
          stroke="var(--muted)"
          strokeWidth="2"
        />

        {x.map((cx, i) => {
          if (i === deployed || i === latest) return null;
          return <circle key={cx} cx={cx} cy="70" r="7" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2" />;
        })}

        <g>
          <line x1={x[deployed]} x2={x[deployed]} y1="44" y2="56" stroke="var(--ok)" strokeWidth="2" />
          <text x={x[deployed]} y="34" textAnchor="middle" fontSize="15" fontWeight="500" fill="var(--ink)">
            Deployed from here
          </text>
          <circle cx={x[deployed]} cy="70" r="14" fill="var(--ok)" />
          <path
            d={`M${x[deployed] - 6} 70.5l4 4 8-9`}
            fill="none"
            stroke="var(--paper)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x={x[deployed]} y="112" textAnchor="middle" fontSize="15" fill="var(--ok)">
            Exact match
          </text>
        </g>

        <g>
          <circle cx={x[latest]} cy="70" r="14" fill="var(--surface)" stroke="var(--bad)" strokeWidth="2" />
          <path
            d={`M${x[latest] - 5} 65l10 10m0-10l-10 10`}
            fill="none"
            stroke="var(--bad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <text x={x[latest] + 14} y="34" textAnchor="end" fontSize="15" fontWeight="500" fill="var(--ink)">
            Latest commit
          </text>
          <text x={x[latest] + 14} y="112" textAnchor="end" fontSize="15" fill="var(--bad)">
            Does not match
          </text>
        </g>

        <text x={x[0] - 10} y="140" fontSize="13" fill="var(--muted)">
          Older
        </text>
        <text x={x[latest] + 14} y="140" textAnchor="end" fontSize="13" fill="var(--muted)">
          Newer
        </text>
      </svg>
    </figure>
  );
}
