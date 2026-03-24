import { buildRulerTicks } from "../lib/pageGeometry";

export default function Ruler({
  axis,
  lengthMm,
  startMarginMm,
  endMarginMm,
}) {
  const ticks = buildRulerTicks(lengthMm);
  const style = {
    "--length-mm": lengthMm,
    "--margin-start-mm": startMarginMm,
    "--margin-end-mm": endMarginMm,
  };

  return (
    <div className={`ruler ruler--${axis}`} style={style} aria-hidden="true">
      <div
        className={`ruler__margin ruler__margin--${axis}-start`}
      />
      <div
        className={`ruler__margin ruler__margin--${axis}-end`}
      />
      {ticks.map((tick) => (
        <span
          key={`${axis}-${tick.value}`}
          className={`ruler__tick ${tick.major ? "ruler__tick--major" : ""}`}
          style={{ "--tick-mm": tick.value }}
        >
          {tick.major ? (
            <span className="ruler__label">{tick.value}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
