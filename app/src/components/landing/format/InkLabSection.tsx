import React, { useEffect, useState } from "react";

interface InkLabSectionProps {
  simpleMode?: boolean;
}

export const InkLabSection: React.FC<InkLabSectionProps> = ({ simpleMode }) => {
  const [density, setDensity] = useState(50);
  const [scale, setScale] = useState(40);
  const [softness, setSoftness] = useState(60);
  const [headline, setHeadline] = useState("Circuit");
  const [format, setFormat] = useState<"vertical" | "horizontal" | "circle" | "arch">("vertical");
  const [seed, setSeed] = useState(11);
  const [invert, setInvert] = useState(false);
  const [codeOutput, setCodeOutput] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const t = document.getElementById("lab-t");
    const m = document.getElementById("lab-m");

    const a0 = 0.68 - density * 0.0034; // alpha threshold: higher density = lower threshold
    const k = 6 + softness * 0.34; // slope: crisp edges at the high end
    const f = 0.004 + scale * 0.0003; // noise frequency: bigger value = smaller blobs
    const fx = f.toFixed(4);
    const fy = (f * 1.75).toFixed(4);
    const c = invert ? 1 : 0;
    const vals = `0 0 0 0 ${c}  0 0 0 0 ${c}  0 0 0 0 ${c}  0 0 0 ${k.toFixed(1)} ${(-k * a0).toFixed(2)}`;

    if (t) {
      t.setAttribute("baseFrequency", `${fx} ${fy}`);
      t.setAttribute("seed", `${seed}`);
    }
    if (m) {
      m.setAttribute("values", vals);
    }

    setCodeOutput(
`<filter id="ink" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="${fx} ${fy}" numOctaves="3" seed="${seed}"/>
  <feColorMatrix type="matrix" values="${vals}"/>
</filter>`
    );
  }, [density, scale, softness, invert, seed]);

  const handleCopy = () => {
    if (!navigator.clipboard) {
      setCopyStatus("Press Ctrl+C");
      return;
    }
    navigator.clipboard.writeText(codeOutput).then(
      () => {
        setCopyStatus("Copied");
        setTimeout(() => setCopyStatus(""), 1600);
      },
      () => setCopyStatus("Failed to copy")
    );
  };

  return (
    <section className="lab" data-note="Ink lab">
      <div className="lab-head">
        <h2>Ink lab</h2>
        <p>
          {simpleMode
            ? "A generative poster maker. Adjust density, scale, and softness to tune your own organic liquid filter."
            : "A generative poster maker. The sliders write directly into one SVG filter, and the filter markup you tuned is printed below so you can paste it into your own site."}
        </p>
      </div>
      <div className="stage ink-lab" data-note="Ink lab stage">
        <div className="lab-view">
          <div className="poster" id="poster" data-f={format} data-inv={invert ? "1" : "0"}>
            <i className="ink" />
            <div className="poster-txt">
              <small>(Circuit)</small>
              <strong id="poster-t">{headline || " "}</strong>
            </div>
          </div>
        </div>
        <div>
          <label className="ctl">
            <span>
              Density <span>{density}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={density}
              onChange={e => setDensity(Number(e.target.value))}
            />
          </label>
          <label className="ctl">
            <span>
              Scale <span>{scale}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={scale}
              onChange={e => setScale(Number(e.target.value))}
            />
          </label>
          <label className="ctl">
            <span>
              Edge softness <span>{softness}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={softness}
              onChange={e => setSoftness(Number(e.target.value))}
            />
          </label>
          <label className="ctl">
            <span>Headline</span>
            <input
              type="text"
              maxLength={14}
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="tools" role="group" aria-label="Poster format">
            {(["vertical", "horizontal", "circle", "arch"] as const).map(fmt => (
              <button
                key={fmt}
                type="button"
                className="lf-pill"
                aria-pressed={format === fmt}
                onClick={() => setFormat(fmt)}
              >
                {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
              </button>
            ))}
          </div>

          <div className="tools" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="lf-pill"
              onClick={() => setSeed(1 + Math.floor(Math.random() * 9999))}
            >
              Reroll
            </button>
            <button
              type="button"
              className="lf-pill"
              aria-pressed={invert}
              onClick={() => setInvert(v => !v)}
            >
              Invert
            </button>
            <button type="button" className="lf-pill" onClick={handleCopy}>
              Copy filter
            </button>
            {copyStatus && <output className="readout" aria-live="polite">{copyStatus}</output>}
          </div>

          <textarea
            className="code"
            value={codeOutput}
            readOnly
            spellCheck={false}
            aria-label="Generated SVG filter"
          />
        </div>
      </div>
    </section>
  );
};
