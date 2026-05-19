"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CreateStrings } from "./create-strings";
import { FORMATS, type FormatKey, IcArrowL, IcArrowR, IcUpload, IcX } from "./create-primitives";

export function CreateMediaCanvas({
  previews,
  activeIdx,
  setActiveIdx,
  isVideoAt,
  format,
  setFormat,
  activeRatio,
  fileRef,
  removeFile,
  dragging,
  cs,
}: {
  previews: string[];
  activeIdx: number;
  setActiveIdx: Dispatch<SetStateAction<number>>;
  isVideoAt: (i: number) => boolean;
  format: FormatKey;
  setFormat: (f: FormatKey) => void;
  activeRatio: string;
  fileRef: RefObject<HTMLInputElement | null>;
  removeFile: (i: number) => void;
  dragging: boolean;
  cs: CreateStrings;
}) {
  const activeSrc = previews[activeIdx];
  return (
    <div className="st-canvas">
      <div
        className="st-viewer"
        style={{ aspectRatio: activeRatio }}
        onClick={() => !previews.length && fileRef.current?.click()}
      >
        {previews.length > 0 && activeSrc ? (
          <>
            {isVideoAt(activeIdx) ? (
              <video src={activeSrc} className="st-media" controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeSrc} className="st-media" alt="preview" />
            )}
            {previews.length > 1 ? (
              <>
                {activeIdx > 0 ? (
                  <button className="st-nav st-nav--l" onClick={e => { e.stopPropagation(); setActiveIdx(i => i - 1); }}>
                    <IcArrowL />
                  </button>
                ) : null}
                {activeIdx < previews.length - 1 ? (
                  <button className="st-nav st-nav--r" onClick={e => { e.stopPropagation(); setActiveIdx(i => i + 1); }}>
                    <IcArrowR />
                  </button>
                ) : null}
                <div className="st-pips">
                  {previews.map((_, i) => (
                    <span key={i} className={`st-pip${i === activeIdx ? " st-pip--on" : ""}`} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="st-empty" onClick={() => fileRef.current?.click()}>
            <div className="st-empty-icon">
              <IcUpload />
            </div>
            <p className="st-empty-title">{cs.dropMedia}</p>
            <p className="st-empty-sub">{cs.dropMediaSub}</p>
            <p className="st-empty-note">{cs.dropMediaNote}</p>
          </div>
        )}
      </div>

      <div className="st-format-bar">
        {FORMATS.map(f => (
          <button
            key={f.key}
            className={`st-fmt${format === f.key ? " st-fmt--on" : ""}`}
            onClick={() => setFormat(f.key)}
          >
            <div className="st-fmt-box" style={{ aspectRatio: `${f.w}/${f.h}`, width: f.key === "landscape" ? 20 : f.key === "portrait" ? 11 : 14 }} />
            {f.label}
          </button>
        ))}
      </div>

      <div className="st-filmstrip">
        {previews.map((p, i) => (
          <div key={`${i}-${p.slice(0, 48)}`} className={`st-thumb${i === activeIdx ? " st-thumb--on" : ""}`}>
            <button className="st-thumb-btn" type="button" onClick={() => setActiveIdx(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" />
              {isVideoAt(i) ? <span className="st-thumb-vid">▶</span> : null}
            </button>
            <button className="st-thumb-del" type="button" onClick={() => removeFile(i)} aria-label={cs.remove}>
              <IcX />
            </button>
          </div>
        ))}
        <button className="st-add-btn" onClick={() => fileRef.current?.click()} title={cs.addMedia}>
          <IcUpload />
          <span>{cs.addLabel}</span>
        </button>
      </div>

      {dragging ? (
        <div className="st-drop-overlay">
          <IcUpload />
          <span>Drop to add</span>
        </div>
      ) : null}
    </div>
  );
}
