export function CreateScreenStyles() {
  return (
    <style>{`
        /* root */
        .st-root { display:flex; flex-direction:column; height:calc(100vh - 60px); background:var(--app-background); overflow:hidden; }

        /* header */
        .st-header { display:flex; align-items:center; gap:.75rem; padding:.7rem 1.25rem; border-bottom:1px solid var(--app-border); background:var(--app-card); flex-shrink:0; }
        .st-back { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; border:1.5px solid var(--app-border); background:transparent; color:var(--muted); cursor:pointer; transition:border-color .15s,color .15s; flex-shrink:0; }
        .st-back:hover { border-color:var(--text); color:var(--text); }
        .st-back svg { width:17px; height:17px; }
        .st-title { font-size:.92rem; font-weight:700; color:var(--text); letter-spacing:-.01em; }
        .st-header-spacer { flex:1; }

        /* studio 2-col */
        .st-studio { display:grid; grid-template-columns:1fr 360px; flex:1; overflow:hidden; position:relative; }
        .st-studio--over .st-canvas { outline:2.5px dashed var(--app-accent); outline-offset:-4px; }

        /* ── LEFT canvas ── */
        .st-canvas { background:#09090b; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; overflow:hidden; gap:0; }

        /* viewer */
        .st-viewer { position:relative; max-width:min(480px, 90%); width:100%; border-radius:12px; overflow:hidden; background:#111; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 8px 48px rgba(0,0,0,.7); flex-shrink:0; }

        /* nav arrows */
        .st-nav { position:absolute; top:50%; transform:translateY(-50%); width:32px; height:32px; border-radius:50%; background:rgba(0,0,0,.55); backdrop-filter:blur(4px); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:2; transition:background .15s; }
        .st-nav:hover { background:rgba(0,0,0,.8); }
        .st-nav svg { width:16px; height:16px; }
        .st-nav--l { left:8px; }
        .st-nav--r { right:8px; }
        .st-pips { position:absolute; bottom:8px; left:50%; transform:translateX(-50%); display:flex; gap:4px; }
        .st-pip { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.35); transition:all .2s; }
        .st-pip--on { background:#fff; width:16px; border-radius:3px; }

        /* empty state */
        .st-empty { display:flex; flex-direction:column; align-items:center; gap:.55rem; padding:3rem 2rem; text-align:center; color:#fff; cursor:pointer; }
        .st-empty-icon { width:60px; height:60px; border-radius:50%; border:1.5px dashed rgba(255,255,255,.18); display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.3); margin-bottom:.35rem; }
        .st-empty-icon svg { width:24px; height:24px; }
        .st-empty-title { font-size:.95rem; font-weight:700; color:rgba(255,255,255,.85); margin:0; }
        .st-empty-sub { font-size:.8rem; color:rgba(255,255,255,.35); margin:0; }
        .st-empty-note { font-size:.68rem; color:rgba(255,255,255,.2); margin:0; }

        /* format bar */
        .st-format-bar { display:flex; gap:.4rem; margin-top:.9rem; flex-shrink:0; }
        .st-fmt { display:inline-flex; align-items:center; gap:.45rem; padding:.3rem .75rem; border-radius:999px; border:1.5px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); color:rgba(255,255,255,.45); font-size:.75rem; font-weight:600; cursor:pointer; transition:all .15s; }
        .st-fmt:hover { border-color:rgba(255,255,255,.3); color:rgba(255,255,255,.7); }
        .st-fmt--on { border-color:var(--app-accent); background:rgba(var(--app-accent-rgb),.18); color:var(--app-accent); }
        .st-fmt-box { border-radius:2px; border:1.5px solid currentColor; flex-shrink:0; height:auto; }

        /* filmstrip */
        .st-filmstrip { display:flex; align-items:center; gap:.45rem; margin-top:.75rem; padding:.5rem .75rem; background:rgba(255,255,255,.04); border-radius:12px; max-width:min(480px, 90%); width:100%; overflow-x:auto; flex-shrink:0; }
        .st-filmstrip::-webkit-scrollbar { height:3px; }
        .st-filmstrip::-webkit-scrollbar-thumb { background:rgba(255,255,255,.15); border-radius:2px; }
        .st-thumb { position:relative; flex-shrink:0; }
        .st-thumb-btn { width:52px; height:52px; border-radius:8px; overflow:hidden; border:2px solid transparent; padding:0; background:none; cursor:pointer; display:block; transition:border-color .15s; }
        .st-thumb-btn img { width:100%; height:100%; object-fit:cover; display:block; }
        .st-thumb--on .st-thumb-btn { border-color:var(--app-accent); }
        .st-thumb-vid { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:.6rem; color:#fff; pointer-events:none; }
        .st-thumb-del { position:absolute; top:-5px; right:-5px; width:17px; height:17px; border-radius:50%; background:#ef4444; border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; }
        .st-thumb-del svg { width:8px; height:8px; }
        .st-add-btn { width:52px; height:52px; border-radius:8px; border:1.5px dashed rgba(255,255,255,.18); background:transparent; color:rgba(255,255,255,.35); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; font-size:.58rem; font-weight:600; transition:border-color .15s,color .15s; flex-shrink:0; }
        .st-add-btn svg { width:14px; height:14px; }
        .st-add-btn:hover { border-color:var(--app-accent); color:var(--app-accent); }

        /* drag overlay */
        .st-drop-overlay { position:absolute; inset:0; background:rgba(var(--app-accent-rgb),.12); border:3px dashed var(--app-accent); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; color:var(--app-accent); font-weight:700; font-size:1rem; pointer-events:none; z-index:10; }
        .st-drop-overlay svg { width:28px; height:28px; }

        /* media fill */
        .st-media { width:100%; height:100%; object-fit:contain; display:block; background:#111; }

        /* ── RIGHT form pane ── */
        .st-form-pane { background:var(--app-card); border-left:1px solid var(--app-border); overflow-y:auto; display:flex; flex-direction:column; gap:0; }
        .st-form-pane::-webkit-scrollbar { width:4px; }
        .st-form-pane::-webkit-scrollbar-thumb { background:var(--app-border); border-radius:2px; }

        /* ── Chronicle post card preview ── */
        .st-cprev { background:var(--feed-surface, var(--app-background)); border-bottom:1px solid var(--app-border); flex-shrink:0; overflow:hidden; }
        .st-cprev-bar { height:4px; background:var(--app-accent); flex-shrink:0; }
        .st-cprev-img { position:relative; width:100%; overflow:hidden; background:#111; }
        .st-cprev-img img,.st-cprev-img video { width:100%; height:100%; object-fit:contain; display:block; background:#111; }
        .st-cprev-count { position:absolute; top:6px; right:7px; background:rgba(0,0,0,.55); color:#fff; font-size:.6rem; font-weight:700; padding:.16rem .44rem; border-radius:999px; }
        .st-cprev-placeholder { height:80px; display:flex; align-items:center; justify-content:center; background:var(--app-border); }
        .st-cprev-placeholder span { font-size:.75rem; color:var(--muted); }
        .st-cprev-body { padding:.6rem .85rem .1rem; }
        .st-cprev-caption { font-size:.78rem; color:var(--text); line-height:1.5; margin:0 0 .2rem; }
        .st-cprev-cat { display:inline-flex; margin:.05rem 0 .2rem; padding:.18rem .5rem; border-radius:999px; background:rgba(var(--app-accent-rgb),.14); color:var(--app-accent); font-size:.62rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
        .st-cprev-loc { display:flex; align-items:center; gap:.3rem; font-size:.68rem; color:var(--muted); margin:0; }
        .st-cprev-loc svg { width:11px; height:11px; flex-shrink:0; }
        .st-cprev-footer { display:flex; align-items:center; justify-content:space-between; padding:.55rem .85rem .65rem; border-top:1px solid var(--app-border); margin-top:.55rem; }
        .st-cprev-author { display:flex; align-items:center; gap:.5rem; }
        .st-cprev-av { width:28px; height:28px; border-radius:50%; background:var(--app-accent); color:#fff; font-size:.62rem; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .st-cprev-name { font-size:.78rem; font-weight:700; color:var(--text); line-height:1.1; }
        .st-cprev-uname { font-size:.66rem; color:var(--muted); }
        .st-cprev-actions { display:flex; gap:.5rem; }
        .st-cprev-ic { width:16px; height:16px; color:var(--muted); display:inline-flex; }

        /* caption */
        .st-caption-wrap { border-bottom:1px solid var(--app-border); }
        .st-caption { width:100%; background:transparent; border:none; outline:none; resize:none; font-size:.875rem; color:var(--text); font-family:inherit; line-height:1.65; padding:.9rem 1rem .4rem; box-sizing:border-box; }
        .st-caption::placeholder { color:var(--muted); }
        .st-caption-bar { display:flex; align-items:center; justify-content:space-between; padding:.35rem .75rem .55rem; }
        .st-emojis { display:flex; gap:.15rem; flex-wrap:wrap; }
        .st-emoji { background:transparent; border:none; cursor:pointer; font-size:.88rem; padding:.12rem .18rem; border-radius:5px; transition:background .12s; line-height:1; }
        .st-emoji:hover { background:var(--app-background); }
        .st-emoji--ic { display:flex; align-items:center; color:var(--muted); }
        .st-emoji--ic svg { width:13px; height:13px; }
        .st-charcount { font-size:.68rem; color:var(--muted); flex-shrink:0; }

        /* fields */
        .st-fields { display:flex; flex-direction:column; border-bottom:1px solid var(--app-border); }
        .st-field { display:flex; align-items:center; gap:.6rem; padding:.65rem 1rem; border-bottom:1px solid var(--app-border); }
        .st-field:last-child { border-bottom:none; }
        .st-field-ic { width:16px; height:16px; color:var(--muted); flex-shrink:0; }
        .st-field-in { flex:1; background:transparent; border:none; outline:none; font-size:.85rem; color:var(--text); font-family:inherit; }
        .st-field-in::placeholder { color:var(--muted); }
        .st-tag-field { align-items:flex-start; }
        .st-tag-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:.5rem; }
        .st-tag-trigger { width:100%; border:0; background:transparent; color:var(--text); padding:0; display:flex; align-items:center; justify-content:space-between; gap:.75rem; cursor:pointer; text-align:left; font-family:inherit; }
        .st-tag-trigger span { font-size:.85rem; font-weight:650; }
        .st-tag-trigger small { color:var(--muted); font-size:.68rem; font-weight:800; }
        .st-tag-chips { display:flex; flex-wrap:wrap; gap:.38rem; }
        .st-tag-chip { display:inline-flex; align-items:center; gap:.36rem; max-width:100%; min-height:1.9rem; border:1px solid rgba(var(--app-accent-rgb),.24); background:rgba(var(--app-accent-rgb),.1); color:var(--text); border-radius:999px; padding:.18rem .24rem .18rem .24rem; font-size:.72rem; font-weight:750; }
        .st-tag-chip-avatar,.st-tag-option-avatar { width:1.42rem; height:1.42rem; border-radius:50%; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; background:linear-gradient(135deg,var(--app-accent),#a78bfa); color:#fff; font-size:.62rem; font-weight:900; }
        .st-tag-chip-avatar img,.st-tag-option-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .st-tag-chip button { width:1.25rem; height:1.25rem; border:0; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:rgba(255,255,255,.08); color:var(--muted); cursor:pointer; padding:0; }
        .st-tag-chip button:hover { color:#ef4444; background:rgba(239,68,68,.12); }
        .st-tag-chip button svg { width:.72rem; height:.72rem; }
        .st-tag-picker { border:1px solid var(--app-border); background:var(--app-background); border-radius:12px; overflow:hidden; box-shadow:0 18px 42px -32px rgba(0,0,0,.82); }
        .st-tag-search { width:100%; box-sizing:border-box; padding:.62rem .72rem; border-bottom:1px solid var(--app-border); }
        .st-tag-results { max-height:13rem; overflow-y:auto; padding:.35rem; display:flex; flex-direction:column; gap:.22rem; }
        .st-tag-empty { color:var(--muted); font-size:.74rem; line-height:1.45; padding:.55rem .6rem; }
        .st-tag-option { width:100%; border:0; border-radius:10px; background:transparent; color:var(--text); display:flex; align-items:center; gap:.55rem; padding:.48rem .52rem; text-align:left; cursor:pointer; font-family:inherit; }
        .st-tag-option:hover { background:rgba(var(--app-accent-rgb),.1); }
        .st-tag-option span:last-child { min-width:0; display:flex; flex-direction:column; gap:.04rem; }
        .st-tag-option strong { font-size:.78rem; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .st-tag-option small { color:var(--muted); font-size:.68rem; }

        /* audience */
        .st-audience { padding:.75rem 1rem; border-bottom:1px solid var(--app-border); display:flex; flex-direction:column; gap:.55rem; }
        .st-field-label { font-size:.72rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:0; }
        .st-field-label .st-field-label-note { display:block; margin-top:.28rem; font-size:.65rem; font-weight:600; letter-spacing:0; text-transform:none; line-height:1.35; opacity:.9; }
        .st-audience-pills { display:flex; gap:.4rem; flex-wrap:wrap; }
        .st-aud-pill { display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .8rem; border-radius:999px; border:1.5px solid var(--app-border); background:transparent; color:var(--muted); font-size:.78rem; font-weight:600; cursor:pointer; transition:all .15s; }
        .st-aud-pill:hover { border-color:var(--app-accent); color:var(--app-accent); }
        .st-aud-pill--on { background:var(--app-accent); border-color:var(--app-accent); color:#fff; }

        .st-poll { padding:.75rem 1rem; border-bottom:1px solid var(--app-border); display:flex; flex-direction:column; gap:.6rem; }
        .st-poll-head { display:flex; align-items:center; justify-content:space-between; gap:.6rem; }
        .st-poll-toggle { border:1.5px solid var(--app-border); background:transparent; color:var(--muted); border-radius:999px; padding:.18rem .62rem; font-size:.72rem; font-weight:700; cursor:pointer; }
        .st-poll-toggle--on { border-color:var(--app-accent); color:var(--app-accent); background:rgba(var(--app-accent-rgb),.12); }
        .st-poll-fields { display:flex; flex-direction:column; gap:.42rem; }
        .st-poll-actions { display:flex; align-items:center; gap:.42rem; flex-wrap:wrap; }
        .st-poll-btn { border:1.5px solid var(--app-border); background:transparent; color:var(--muted); border-radius:999px; padding:.2rem .62rem; font-size:.7rem; font-weight:700; cursor:pointer; }
        .st-poll-btn--danger { color:#ef4444; border-color:rgba(239,68,68,.45); }
        .st-poll-duration { margin-left:auto; display:flex; align-items:center; gap:.38rem; color:var(--muted); font-size:.72rem; font-weight:600; }
        .st-poll-duration select { border:1.5px solid var(--app-border); background:transparent; color:var(--text); border-radius:8px; padding:.2rem .45rem; font-size:.72rem; }

        .st-cat-pill { display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .72rem; border-radius:999px; border:1.5px solid var(--app-border); background:transparent; color:var(--muted); font-size:.76rem; font-weight:700; cursor:pointer; transition:all .15s; }
        .st-cat-pill span { padding:.08rem .32rem; border-radius:999px; background:rgba(var(--app-accent-rgb),.12); color:var(--app-accent); font-size:.56rem; text-transform:uppercase; letter-spacing:.06em; }
        .st-cat-pill:hover { border-color:var(--app-accent); color:var(--app-accent); }
        .st-cat-pill--on { background:rgba(var(--app-accent-rgb),.16); border-color:var(--app-accent); color:var(--app-accent); }

        .st-album { padding:.75rem 1rem; border-bottom:1px solid var(--app-border); display:flex; flex-direction:column; gap:.5rem; }
        .st-album-select { width:100%; border:1.5px solid var(--app-border); background:transparent; color:var(--text); border-radius:10px; padding:.45rem .6rem; font-size:.82rem; font-family:inherit; }
        .st-album-new { width:100%; box-sizing:border-box; border:1px solid var(--app-border); border-radius:10px; padding:.5rem .65rem; margin-top:.15rem; }

        /* toggles */
        .st-toggles { display:flex; flex-direction:column; border-bottom:1px solid var(--app-border); }
        .st-toggle { display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.7rem 1rem; background:transparent; border:none; border-bottom:1px solid var(--app-border); cursor:pointer; text-align:left; }
        .st-toggle:last-child { border-bottom:none; }
        .st-toggle-text { display:flex; flex-direction:column; gap:.1rem; }
        .st-toggle-label { font-size:.84rem; font-weight:600; color:var(--text); }
        .st-toggle-desc { font-size:.72rem; color:var(--muted); }
        .st-pill { width:40px; height:22px; border-radius:11px; background:var(--app-border); position:relative; transition:background .2s; flex-shrink:0; }
        .st-pill-dot { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .2s; }
        .st-toggle--on .st-pill { background:var(--app-accent); }
        .st-toggle--on .st-pill-dot { transform:translateX(18px); }
        .st-toggle--disabled { opacity:.45; cursor:not-allowed; }

        /* publish area */
        .st-publish-area { padding:1rem; display:flex; flex-direction:column; gap:.6rem; margin-top:auto; }
        .st-post-meta { font-size:.72rem; color:var(--muted); text-align:center; }
        .st-publish-row { display:flex; flex-direction:column; gap:.5rem; }
        .st-save-draft { width:100%; padding:.72rem 1rem; border-radius:12px; border:1.5px solid var(--app-border); background:var(--app-card-soft); color:var(--text); font-size:.88rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.5rem; transition:border-color .15s, opacity .15s; }
        .st-save-draft:not(:disabled):hover { border-color:var(--app-accent); color:var(--app-accent); }
        .st-save-draft:disabled { opacity:.38; cursor:not-allowed; }
        .st-publish { width:100%; padding:.75rem 1rem; border-radius:12px; border:none; background:var(--app-accent); color:#fff; font-size:.9rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.5rem; transition:filter .15s, opacity .15s; }
        .st-publish:not(:disabled):hover { filter:brightness(1.08); }
        .st-publish:disabled { opacity:.38; cursor:not-allowed; }
        .st-spin { display:flex; animation:st-spin 1s linear infinite; }
        @keyframes st-spin { to { transform:rotate(360deg); } }

        /* toast */
        .st-toast { position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); display:inline-flex; align-items:center; gap:.55rem; padding:.65rem 1.2rem; border-radius:12px; font-size:.875rem; font-weight:600; z-index:9999; box-shadow:0 8px 32px rgba(0,0,0,.4); animation:st-in .25s ease; white-space:nowrap; }
        .st-toast svg { width:15px; height:15px; flex-shrink:0; }
        .st-toast--ok { background:#16a34a; color:#fff; }
        .st-toast--err { background:#dc2626; color:#fff; }
        @keyframes st-in { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }

        /* responsive */
        @media (max-width:800px) {
          .st-root { height:auto; overflow:auto; }
          .st-studio { grid-template-columns:1fr; overflow:visible; }
          .st-canvas { min-height:360px; padding:1.25rem 1rem .75rem; }
          .st-form-pane { border-left:none; border-top:1px solid var(--app-border); }
        }

        /* Phone refinements (≤480px) — the 800px breakpoint above only
           collapses the studio to a single column. On a 360-400px phone the
           caption / location / album inputs still inherit a sub-16px font
           that triggers iOS auto-zoom, and the publish row buttons fall just
           under the touch-target minimum. Pin both here. */
        @media (max-width: 480px) {
          .st-canvas { padding: 0.85rem 0.7rem 0.6rem; min-height: 280px; }
          .st-viewer { max-width: 100%; }
          .st-filmstrip { padding: 0.4rem 0.55rem; gap: 0.35rem; }
          .st-format-bar { margin-top: 0.6rem; gap: 0.3rem; }
          .st-fmt { padding: 0.3rem 0.55rem; font-size: 0.7rem; }

          /* iOS auto-zoom kicks in for inputs <16px. Pin caption / metadata
             / album fields explicitly. */
          .st-caption,
          .st-field-in,
          .st-album-select,
          .st-album-new {
            font-size: 16px;
          }

          .st-caption-bar { padding: 0.3rem 0.6rem 0.45rem; }
          .st-emoji { font-size: 0.95rem; padding: 0.18rem 0.22rem; }
          .st-field { padding: 0.6rem 0.85rem; }
          .st-album,
          .st-poll,
          .st-audience { padding: 0.65rem 0.85rem; }

          .st-publish-area { padding: 0.85rem 0.85rem 1rem; }
        }

        /* Touch-device tap targets — WCAG 2.5.5. The viewer nav arrows
           (32×32), thumbnail delete (17×17), and quick-emoji buttons all
           fail the 44×44 floor on coarse pointers. */
        @media (pointer: coarse) {
          .st-nav { width: 44px; height: 44px; }
          .st-thumb-del { width: 22px; height: 22px; }
          .st-emoji { min-width: 32px; min-height: 32px; }
          .st-publish,
          .st-save-draft { min-height: 48px; }
          .st-tag-trigger { min-height: 44px; }
          .st-aud-pill { min-height: 38px; }
        }

        /* Reduce hover transitions + toggle slide for prefers-reduced-motion. */
        @media (prefers-reduced-motion: reduce) {
          .st-toggle .st-pill,
          .st-toggle .st-pill-dot,
          .st-nav,
          .st-fmt,
          .st-thumb-btn,
          .st-emoji,
          .st-add-btn,
          .st-spin {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
  );
}
