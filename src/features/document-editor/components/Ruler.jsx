import { buildRulerTicks } from "../lib/pageGeometry";

export function Ruler({ axis, lengthMm, startMarginMm, endMarginMm }) {
  const ticks = buildRulerTicks(lengthMm);
  const style = {
    "--margin-start-mm": startMarginMm,
    "--margin-end-mm": endMarginMm,
  };

  return (
    <div className={`ruler ruler--${axis}`} style={style} aria-hidden="true">
      <div className="ruler__margin-band" />
      {ticks.map((tick) => (
        <span
          key={`${axis}-${tick.value}`}
          className={`ruler__tick ${tick.major ? "ruler__tick--major" : ""}`}
          style={{ "--tick-mm": tick.value }}
        >
          {tick.major && tick.value > 0 ? (
            <span className="ruler__label">{tick.value}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
