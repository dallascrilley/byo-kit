// Theme with CSS custom properties (--byo-*) or with ::part().
// Parts: box, dropzone, button, primary, input, textarea, label, link,
//        privacy, status, errors, route, choice

export const BASE_CSS = `
:host{
  display:block;
  --byo-bg:#ffffff;--byo-soft:#f6f8fb;--byo-ink:#17212c;--byo-muted:#526175;--byo-line:#d9e0ea;
  --byo-accent:#2457d6;--byo-accent-soft:#e8eefc;--byo-on-accent:#ffffff;
  --byo-good:#17745a;--byo-good-soft:#e5f4ee;--byo-warn:#8a5410;--byo-warn-soft:#fdf3e3;
  --byo-danger:#b42318;--byo-danger-soft:#fdecea;
  --byo-radius:14px;
  --byo-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  --byo-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font:14px/1.45 var(--byo-font);color:var(--byo-ink);
}
@media (prefers-color-scheme:dark){:host{
  --byo-bg:#151b23;--byo-soft:#1a222c;--byo-ink:#e6ebf1;--byo-muted:#9aa8b8;--byo-line:#2c3846;
  --byo-accent:#6c97ff;--byo-accent-soft:#1d2a45;--byo-on-accent:#0f141a;
  --byo-good:#43c597;--byo-good-soft:#173328;--byo-warn:#e0a35a;--byo-warn-soft:#33260f;
  --byo-danger:#ff8b7f;--byo-danger-soft:#3a1a17;
}}
*{box-sizing:border-box}
.box{background:var(--byo-bg);border:1px solid var(--byo-line);border-radius:var(--byo-radius);padding:14px 16px}
.eyebrow{font-size:10.5px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:var(--byo-muted);margin:0 0 8px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.grow{flex:1 1 220px;min-width:0}
button{font:inherit;font-weight:700;border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid var(--byo-line);background:var(--byo-bg);color:var(--byo-ink);transition:border-color .2s,background .2s}
button:hover:not(:disabled){border-color:var(--byo-accent)}
button.primary{background:var(--byo-accent);border-color:var(--byo-accent);color:var(--byo-on-accent)}
button.primary:hover:not(:disabled){filter:brightness(1.06)}
button.link{border:0;background:none;color:var(--byo-accent);text-decoration:underline;padding:6px 4px;font-weight:650}
button:disabled{opacity:.5;cursor:not-allowed}
input[type=text],input[type=password],textarea{font:inherit;color:var(--byo-ink);background:var(--byo-soft);border:1px solid var(--byo-line);border-radius:9px;padding:9px 11px;width:100%}
textarea{font-family:var(--byo-mono);font-size:12.5px;resize:vertical;min-height:60px}
label,legend{font-weight:700;font-size:13px}
a{color:var(--byo-accent);font-weight:650}
:focus-visible{outline:2px solid var(--byo-accent);outline-offset:2px}
.privacy{display:flex;gap:8px;align-items:center;margin:10px 0 0;color:var(--byo-muted);font-size:12.5px}
.privacy::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--byo-good);flex:none}
.status{margin:6px 0 0;font-size:12.5px;color:var(--byo-muted);min-height:1.45em}
.status[data-tone=good]{color:var(--byo-good)}
.status[data-tone=warn]{color:var(--byo-warn)}
.status[data-tone=bad]{color:var(--byo-danger)}
.errors{margin:10px 0 0;padding:10px 12px 10px 28px;border-radius:9px;background:var(--byo-danger-soft);color:var(--byo-danger);font-size:12.5px}
.errors[hidden]{display:none}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

export const DATA_CSS = `
.dz{border:1.5px dashed var(--byo-line);border-radius:12px;padding:14px;text-align:center;background:var(--byo-soft);transition:border-color .2s,background .2s}
:host([dragging]) .dz{border-color:var(--byo-accent);background:var(--byo-accent-soft)}
.dz strong{display:block;font-size:15px;letter-spacing:-.2px}
.dz .row{justify-content:center;margin-top:10px}
.paste{margin-top:10px}
.paste label{display:block;margin-bottom:4px}
.pr{display:flex;gap:8px;align-items:flex-end}
.pr textarea{flex:1 1 auto;min-width:0}
.pr button{flex:none;white-space:nowrap}
`;

export const KEY_CSS = `
.head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px}
.field{position:relative}
.field .row{flex-wrap:nowrap}
.keep{display:flex;flex-wrap:wrap;gap:2px 14px;align-items:center;margin-top:10px}
.keep .lead{color:var(--byo-muted);font-size:12.5px;font-weight:700}
.choice{display:flex;gap:6px;align-items:center;font-weight:500;font-size:13px;margin:2px 0}
.choice input{accent-color:var(--byo-accent);margin:0}
.route{margin:10px 0 0;padding:9px 12px;border-radius:10px;background:var(--byo-accent-soft);font-size:12.5px}
.route code{font-family:var(--byo-mono);font-size:12px}
.note{display:block;margin-top:4px;color:var(--byo-muted)}
.actions{margin-top:8px}
`;
