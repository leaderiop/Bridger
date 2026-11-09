/* PROTOTYPE — shell, store, primitives and shared screens. Throwaway code. */
(function () {
  const { useState, useEffect, useRef, useMemo, useSyncExternalStore } = React;
  const html = htm.bind(React.createElement);
  const D = window.APO_DATA;
  const APO = (window.APO = { html, screens: {}, advisors: { officine: [], para: [] }, commands: { officine: [], para: [] }, init: {}, onApprove: {}, homeTiles: {} });

  /* ---------------- store ---------------- */
  let state = null;
  const subs = new Set();
  APO.get = () => state;
  APO.set = (fn) => { const patch = typeof fn === "function" ? fn(state) : fn; state = { ...state, ...patch }; subs.forEach((s) => s()); };
  APO.setV = (fn) => APO.set((s) => { const v = s.variant; const cur = s[v]; const patch = typeof fn === "function" ? fn(cur, s) : fn; return { [v]: { ...cur, ...patch } }; });
  APO.use = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);
  APO.boot = (initial) => { state = initial; };

  /* ---------------- helpers ---------------- */
  const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  APO.dh = (n) => nf.format(n) + " DH";
  APO.n2 = (n) => nf.format(n);
  APO.int = (n) => new Intl.NumberFormat("fr-FR").format(n);
  APO.uid = () => Math.random().toString(36).slice(2, 8);
  APO.now = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  APO.toast = (title, sub, icon) => { const id = APO.uid(); APO.set((s) => ({ toasts: [...s.toasts, { id, title, sub, icon }].slice(-2) })); setTimeout(() => APO.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200); };
  APO.go = (screen) => APO.set((s) => ({ screen: { ...s.screen, [s.variant]: screen }, sideOpen: false, palette: false }));
  APO.pinnedIds = (v) => D.plugins[v].filter((p) => p.pinned).map((p) => p.id);
  APO.installed = (s, id) => !!s.installed[s.variant][id] && (!s.bare || APO.pinnedIds(s.variant).includes(id) || id.startsWith("core") || id.startsWith("ma."));
  APO.plugins = (s) => D.plugins[s.variant].map((p) => ({ ...p, installed: APO.installed(s, p.id) }));
  APO.log = (text, kind) => APO.set((s) => ({ events: [{ t: APO.now(), text, kind: kind || "info", v: s.variant }, ...s.events].slice(0, 60) }));
  /* plugin-contribution helpers: every advisory card carries its plugin; freshly installed plugins are flagged "Nouveau" */
  APO.installPlugin = (id, on = true) => APO.set((x) => { const v = x.variant; const p = D.plugins[v].find((q) => q.id === id); return { installed: { ...x.installed, [v]: { ...x.installed[v], [id]: on } }, newPlugins: { ...(x.newPlugins || {}), [v]: { ...((x.newPlugins || {})[v] || {}), [id]: on } }, fresh: on && p && p.nav[0] ? p.nav[0].id : x.fresh }; });
  APO.setBare = (on) => { APO.set({ bare: on, toasts: [] }); APO.toast(on ? "Noyau seul" : "Plugins réactivés", on ? "Il ne reste que le noyau, les plugins système et le pack Maroc. Tout le reste était un plugin." : "Le menu, la caisse et l'accueil se recomposent.", "puzzle"); };
  APO.isNew = (s, pluginId) => !!(s.newPlugins && s.newPlugins[s.variant] && s.newPlugins[s.variant][pluginId]);
  APO.cards = (s) => APO.advisors[s.variant].filter((a) => a.plugin.startsWith("core") || a.plugin.startsWith("ma.") || APO.installed(s, a.plugin)).flatMap((a) => (a.run(s[s.variant]) || []).map((c) => ({ ...c, plugin: a.plugin, fresh: APO.isNew(s, a.plugin) })));
  APO.hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ("00000000" + (h >>> 0).toString(16)).slice(-8); };

  /* ---------------- icons ---------------- */
  const P = {
    scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8M18 8v8",
    box: "M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
    truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6",
    book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM4 17a3 3 0 0 1 3-3h11",
    key: "M14 10a4 4 0 1 0-3.9 4H11l2 2h2v2h2v2h3v-3l-5.1-5.1A4 4 0 0 0 14 10z",
    card: "M3 6h18v12H3zM3 10h18M7 15h4",
    shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM9 12l2 2 4-4",
    alert: "M12 4 2.5 20h19L12 4zM12 10v4M12 17.5v.01",
    tag: "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3",
    lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
    check: "M5 12.5 10 17 19 7",
    spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
    mail: "M3 6h18v12H3zM3 7l9 6 9-6",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    copy: "M9 9h11v11H9zM5 15H4V4h11v1",
    bot: "M12 3v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9 13h.01M15 13h.01M9.5 17h5",
    bag: "M5 8h14l-1 13H6L5 8zM9 8V6a3 3 0 0 1 6 0v2",
    pill: "M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7l7-7zM7 10l7 7",
    flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3M7 15h10",
    wheel: "M10 16a5 5 0 1 0 0 0zM8 4a1.5 1.5 0 1 0 0 0zM9 7v5h6l3 6",
    snow: "M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 4l3 2 3-2M9 20l3-2 3 2",
    msg: "M4 5h16v11H9l-5 4V5z",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
    badge: "M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 13 7 21l5-3 5 3-1.5-8",
    building: "M4 21V5l8-2v18M12 7h8v14M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
    face: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 10h.01M15 10h.01M8.5 15a5 5 0 0 0 7 0",
    chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8",
    gift: "M4 10h16v11H4zM3 7h18v3H3zM12 7v14M12 7S10.5 3 8 3.5 8 7 12 7zM12 7s1.5-4 4-3.5S16 7 12 7z",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    menu: "M4 7h16M4 12h16M4 17h16",
    sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
    plus: "M12 5v14M5 12h14", minus: "M5 12h14", x: "M6 6l12 12M18 6 6 18",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    home: "M3 11 12 4l9 7M5 10v10h14V10",
    puzzle: "M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7z",
    download: "M12 4v12M7 11l5 5 5-5M5 20h14",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    zap: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
    qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01",
    wifi: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01",
    store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6",
    send: "M21 3 10 14M21 3l-7 18-4-7-7-4 18-7z",
    arrow: "M5 12h14M13 6l6 6-6 6",
    refresh: "M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4",
    printer: "M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z",
    palette: "M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01M17 11.5h.01",
  };
  APO.Icon = ({ n, s = 18, w = 1.7 }) => html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[n] || P.puzzle} /></svg>`;
  const Icon = APO.Icon;

  /* ---------------- primitives ---------------- */
  APO.Badge = ({ tone, mono, children }) => html`<span className=${"badge " + (tone || "") + (mono ? " mono" : "")}>${children}</span>`;
  APO.Card = ({ title, sub, right, children, pad = true, style }) => html`<div className="card" style=${style}>
    ${title && html`<div className="card-h"><h3>${title}</h3>${sub && html`<span className="sub">${sub}</span>`}<div className="r">${right}</div></div>`}
    ${pad ? html`<div className="card-b">${children}</div>` : children}</div>`;
  APO.PageH = ({ title, sub, children }) => html`<div className="page-h"><div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div><div className="actions">${children}</div></div>`;
  APO.Tabs = ({ tabs, value, onChange }) => html`<div className="tabs" role="tablist">${tabs.map((t) => html`<button key=${t.id} role="tab" aria-selected=${value === t.id} className=${value === t.id ? "on" : ""} onClick=${() => onChange(t.id)}>${t.label}${t.count != null ? html` <span className="faint">${t.count}</span>` : null}</button>`)}</div>`;
  APO.Kpi = ({ label, value, delta, tone }) => html`<div className="card kpi"><span>${label}</span><b>${value}</b>${delta && html`<em className=${tone || ""}>${delta}</em>`}</div>`;
  APO.Spark = ({ data, h = 46 }) => {
    const w = 240, max = Math.max(...data), min = Math.min(...data) * 0.9;
    const pts = data.map((v, i) => [i * (w / (data.length - 1)), h - 4 - ((v - min) / (max - min)) * (h - 10)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const last = pts[pts.length - 1];
    return html`<svg className="spark" viewBox=${"0 0 " + w + " " + h} preserveAspectRatio="none" aria-hidden="true">
      <path d=${d + ` L${w} ${h} L0 ${h} Z`} fill="var(--accent-soft)" />
      <path d=${d} fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" />
      <circle cx=${last[0]} cy=${last[1]} r="3.5" fill="var(--accent)" /></svg>`;
  };
  APO.Drawer = ({ title, icon, onClose, children, footer }) => html`<div><div className="scrim" onClick=${onClose}></div>
    <aside className="drawer" role="dialog" aria-label=${title}><div className="drawer-h">${icon}<h3 style=${{ fontSize: "17px" }}>${title}</h3><span className="spacer"></span><button className="iconbtn" onClick=${onClose} aria-label="Fermer"><${Icon} n="x" /></button></div>
    <div className="drawer-b">${children}</div>${footer && html`<div className="drawer-f">${footer}</div>`}</aside></div>`;
  APO.Modal = ({ onClose, children }) => html`<div><div className="scrim" onClick=${onClose}></div><div className="modal" role="dialog">${children}</div></div>`;
  APO.tierBadge = (p) => ({ system: html`<${APO.Badge} tone="acc">Système</${APO.Badge}>`, ma: html`<${APO.Badge} tone="acc">Pack Maroc</${APO.Badge}>`, first: html`<${APO.Badge}>Apotheka</${APO.Badge}>`, partner: html`<${APO.Badge} tone="info">Partenaire</${APO.Badge}>`, private: html`<${APO.Badge} tone="warn">Privé</${APO.Badge}>` }[p.tier]);
  APO.resBadge = (p) => p.res === "MA" ? html`<${APO.Badge} mono>🇲🇦 MA</${APO.Badge}>` : html`<${APO.Badge} tone="warn" mono>EU</${APO.Badge}>`;
  APO.offBadge = (p) => ({ full: html`<${APO.Badge} tone="ok">Hors ligne OK</${APO.Badge}>`, degraded: html`<${APO.Badge}>Hors ligne : file</${APO.Badge}>`, cloud: html`<${APO.Badge}>En ligne</${APO.Badge}>` }[p.off]);
  const Badge = APO.Badge, Card = APO.Card;

  /* Advisory / veto card */
  APO.Adv = ({ c }) => html`<div className=${"adv " + c.tone + (c.fresh ? " fresh" : "")} title=${c.plugin ? "Fourni par le plugin " + c.plugin : ""}>
    <div className="ic"><${Icon} n=${c.icon || "info"} s=${16} /></div>
    <span className="src">${c.src}${c.fresh ? html` <span className="newtag">Nouveau</span>` : null}</span><b>${c.title}</b>${c.text && html`<p>${c.text}</p>`}
    ${c.actions && html`<div className="acts" style=${{ gridColumn: 2 }}>${c.actions.map((a) => html`<button key=${a.label} className=${"btn sm " + (a.pri ? "pri" : "")} onClick=${a.run}>${a.label}</button>`)}</div>`}</div>`;

  /* ---------------- theme engine: a theme is a signed data pack of tokens ---------------- */
  const FONT_PAIRS = {
    moderne: { label: "Moderne", hint: "Archivo + Plex", display: D.fonts.archivo, body: D.fonts.plex },
    chaleureux: { label: "Chaleureux", hint: "Bricolage + Plex", display: D.fonts.brico, body: D.fonts.plex },
    editorial: { label: "Éditorial", hint: "Literata + Plex", display: D.fonts.literata, body: D.fonts.plex },
    lisibilite: { label: "Lisibilité", hint: "Atkinson", display: D.fonts.atkinson, body: D.fonts.atkinson },
  };
  const DENSITY = { compacte: { label: "Compacte", fs: 13, zoom: 0.94 }, standard: { label: "Standard", fs: 14, zoom: 1 }, confort: { label: "Confort", fs: 15, zoom: 1.08 } };
  const VARIANT_ACCENT = { officine: ["#0d7457", "#43bf93"], para: ["#9a3566", "#e07aab"] };
  APO.FONT_PAIRS = FONT_PAIRS; APO.DENSITY = DENSITY; APO.VARIANT_ACCENT = VARIANT_ACCENT;
  const rgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = (a) => "#" + a.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
  APO.mixHex = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(x.map((c, i) => c * (1 - k) + y[i] * k)); };
  const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  APO.fgFor = (h) => (lum(h) > 0.18 ? "#111614" : "#ffffff");
  APO.fontName = (f) => (f || "").split(",")[0].replace(/"/g, "");
  APO.appearance = (s, v) => (s.appearance && s.appearance[v || s.variant]) || { themeId: "theme.classique", overrides: {}, scope: "site" };
  APO.setAppearance = (patch) => APO.set((x) => { const v = x.variant; return { appearance: { ...(x.appearance || {}), [v]: { ...APO.appearance(x, v), ...patch } } }; });
  APO.setOverride = (patch) => APO.set((x) => { const v = x.variant; const a = APO.appearance(x, v); return { appearance: { ...(x.appearance || {}), [v]: { ...a, overrides: { ...(a.overrides || {}), ...patch } } } }; });
  APO.activeThemePlugin = (s) => { const all = D.plugins[s.variant]; let p = all.find((x) => x.id === APO.appearance(s).themeId && x.theme); if (!p || !APO.installed(s, p.id)) p = all.find((x) => x.id === "theme.classique"); return p; };
  APO.effectiveTheme = (s) => {
    const p = APO.activeThemePlugin(s); const t = { ...p.theme }; const o = APO.appearance(s).overrides || {};
    if (o.accent) { t.accent = o.accent; t.accentDark = APO.mixHex(o.accent, "#ffffff", 0.42); t.accentFg = null; t.accentFgDark = null; }
    if (o.radius != null) t.radius = o.radius;
    if (o.density) t.density = o.density;
    if (o.fontPair) { t.display = FONT_PAIRS[o.fontPair].display; t.body = FONT_PAIRS[o.fontPair].body; }
    t.mode = o.mode || t.mode || "auto";
    const b = t.brand || {};
    t.brandName = o.brandName || b.name || "Apotheka"; t.brandInitials = (o.brandInitials || b.initials || "A").slice(0, 3);
    t.whiteLabel = !!(o.brandName || b.name);
    t.shownAccent = t.accent || VARIANT_ACCENT[s.variant][0]; t.shownAccentDark = t.accentDark || (t.accent ? APO.mixHex(t.accent, "#ffffff", 0.42) : VARIANT_ACCENT[s.variant][1]);
    t.pluginId = p.id; t.plugin = p; return t;
  };
  /* Never emits ok / warn / bad / info: alert colours are not themable. */
  APO.themeCss = (t) => {
    const S = ":root[data-variant][data-apo-theme]";
    const dz = DENSITY[t.density] || DENSITY.standard;
    const common = `--r:${t.radius}px;--display:${t.display};--body:${t.body};--fs:${dz.fs}px;--zoom:${dz.zoom};`;
    const block = (dark) => {
      let c = ""; const bg = dark ? t.bgDark : t.bg, panel = dark ? t.panelDark : t.panel;
      if (t.accent) {
        const A = dark ? t.accentDark || APO.mixHex(t.accent, "#ffffff", 0.42) : t.accent;
        const base = panel || (dark ? "#151d1a" : "#ffffff");
        const fg = (dark ? t.accentFgDark : t.accentFg) || APO.fgFor(A);
        c += `--accent:${A};--accent-fg:${fg};--accent-soft:color-mix(in srgb, ${A} ${dark ? 20 : 11}%, ${base});--accent-line:color-mix(in srgb, ${A} ${dark ? 46 : 34}%, ${base});`;
      }
      if (bg) c += `--bg:${bg};--line:color-mix(in srgb, ${bg}, ${dark ? "#fff 10%" : "#000 9%"});--line-2:color-mix(in srgb, ${bg}, ${dark ? "#fff 18%" : "#000 16%"});`;
      if (panel) c += `--panel:${panel};--panel-2:color-mix(in srgb, ${panel} 45%, ${bg || panel});`;
      if (t.touch) c += `--touch:${dark && t.touch === t.accent ? t.accentDark || t.touch : t.touch};--touch-fg:${t.touchFg || APO.fgFor(dark && t.touch === t.accent ? t.accentDark || t.touch : t.touch)};`;
      if (t.contrast) c += dark ? "--fg:#f6f8f7;--muted:#d3ddd9;--faint:#a5b5ae;--line-2:#5d6e68;" : "--fg:#080d0b;--muted:#2c3934;--faint:#52605a;--line-2:#95a39d;";
      return c;
    };
    return `${S}{${common}${block(false)}}\n${S}[data-theme="dark"]{${block(true)}}\n@media (prefers-color-scheme: dark){${S}:not([data-theme="light"]){${block(true)}}}`;
  };
  APO.applyTheme = (s) => {
    const t = APO.effectiveTheme(s); const css = APO.themeCss(t);
    let el = document.getElementById("apo-theme");
    if (!el) { el = document.createElement("style"); el.id = "apo-theme"; document.head.appendChild(el); }
    if (el.textContent !== css) el.textContent = css;
    const r = document.documentElement;
    if (r.dataset.apoTheme !== t.pluginId) r.dataset.apoTheme = t.pluginId;
    if (t.mode === "auto") { if (r.dataset.theme) delete r.dataset.theme; } else if (r.dataset.theme !== t.mode) r.dataset.theme = t.mode;
  };
  APO.themeStrip = (t) => t.sample || (t.mode === "dark" ? [t.bgDark || "#0e1412", t.panelDark || "#151d1a", t.accentDark || t.accent, t.accent] : [t.bg || "#f3f6f5", t.panel || "#ffffff", t.accent, t.touch && t.touch !== t.accent ? t.touch : t.accentDark || t.accent]);
  APO.ThemeStrip = ({ t, h = 28 }) => html`<span className="th-strip" style=${{ height: h }}>${APO.themeStrip(t).map((c, i) => html`<i key=${i} style=${{ background: c }}></i>`)}</span>`;
  APO.themeManifest = (p, t) => {
    const fn = APO.fontName;
    return JSON.stringify({
      id: p.id, name: p.name, version: "1.0.0", kind: "theme", engines: { apotheka: "^1" }, tier: p.tier, publisher: p.pub,
      contributes: { theme: {
        tokens: { light: { accent: t.shownAccent, "accent-fg": t.accentFg || APO.fgFor(t.shownAccent), bg: t.bg || "noyau", panel: t.panel || "noyau" }, dark: { accent: t.shownAccentDark, "accent-fg": t.accentFgDark || APO.fgFor(t.shownAccentDark), bg: t.bgDark || "noyau", panel: t.panelDark || "noyau" } },
        typography: { display: fn(t.display), body: fn(t.body), source: "Google Fonts (OFL)" },
        shape: { radius: t.radius + "px" }, density: t.density, mode: t.mode || "auto",
        brand: t.brandName && t.brandName !== "Apotheka" ? { name: t.brandName, initials: t.brandInitials, logo: "logo.svg" } : null } },
      locked: ["mentions-legales", "numerotation-fiscale", "prix", "couleurs-alerte"],
      code: null, permissions: [], egress: [], signatures: ["publisher", "apotheka-review"],
    }, null, 2);
  };

  /* ---------------- shell ---------------- */
  const GROUPS = ["Quotidien", "Commerce", "Gestion", "Canaux", "Services", "Conformité", "Plateforme"];
  APO.navItems = (s) => {
    const items = [{ id: "home", label: "Accueil", icon: "home", group: "Quotidien", plugin: "core" }];
    APO.plugins(s).filter((p) => p.installed).forEach((p) => p.nav.forEach((n) => items.push({ ...n, plugin: p.id })));
    items.push({ id: "appearance", label: "Apparence", icon: "palette", group: "Plateforme", plugin: "core" });
    items.push({ id: "market", label: "Marketplace", icon: "puzzle", group: "Plateforme", plugin: "core" });
    return items;
  };

  function Sidebar() {
    const s = APO.use(); const v = s.variant; const org = D.org[v];
    const items = APO.navItems(s); const cur = s.screen[v];
    const waiting = s[v].tasks.filter((t) => t.state === "approval").length;
    const count = APO.plugins(s).filter((p) => p.installed).length; const th = APO.effectiveTheme(s);
    return html`<aside className=${"side" + (s.sideOpen ? " open" : "")}>
      <div className="brand"><div className="logo" style=${{ fontSize: th.brandInitials.length > 1 ? 12.5 : 15 }}>${th.brandInitials}</div><div style=${{ minWidth: 0 }}><b>${th.brandName}</b><small>${th.whiteLabel ? "propulsé par Apotheka" : (v === "officine" ? "Officine" : "Parapharmacie") + " · prototype"}</small></div></div>
      <div className="site"><b>${org.name}</b><span className="faint">${org.city}</span><div className="row" style=${{ marginTop: 4, gap: 6 }}><${Badge} mono>${org.site}·${org.terminal}</${Badge}><span key=${count} className="pulse"><${Badge} tone="ok">${s.bare ? "noyau seul" : count + " plugins"}</${Badge}></span></div></div>
      <nav className="nav" aria-label="Navigation générée par les plugins">
        ${GROUPS.map((g) => { const its = items.filter((i) => i.group === g); if (!its.length) return null; return html`<div key=${g}><h6>${g}</h6>${its.map((i) => html`<button key=${i.id} className=${(cur === i.id ? "on " : "") + (s.fresh === i.id ? "fresh" : "")} onClick=${() => APO.go(i.id)} title=${"Fourni par " + i.plugin}><${Icon} n=${i.icon} />${i.label}${i.id === "agent" && waiting ? html`<span className="cnt">${waiting}</span>` : i.plugin !== "core" && !i.plugin.startsWith("core.") && !i.plugin.startsWith("ma.") ? html`<span className="tag">plugin</span>` : null}</button>`)}</div>`; })}
      </nav>
      <div className="side-foot"><span>Ce menu est composé par les plugins installés.</span><span>Version 1.0 · périmètre certifié</span><button className=${"btn sm" + (s.bare ? " pri" : "")} style=${{ marginTop: 4, justifyContent: "center" }} onClick=${() => APO.setBare(!s.bare)}>${s.bare ? "Réactiver les plugins" : "Voir le noyau seul"}</button></div>
    </aside>`;
  }

  function Topbar() {
    const s = APO.use(); const v = s.variant;
    const item = APO.navItems(s).find((i) => i.id === s.screen[v]) || { label: "Accueil" };
    const waiting = s[v].tasks.filter((t) => t.state === "approval").length;
    return html`<header className="top">
      <button className="iconbtn burger" onClick=${() => APO.set((x) => ({ sideOpen: !x.sideOpen }))} aria-label="Menu"><${Icon} n="menu" /></button>
      <div className="crumb">${item.label}<small>${D.org[v].name}</small></div>
      <span className="spacer"></span>
      <div className="search" role="button" tabIndex="0" onClick=${() => APO.set({ palette: true })}><${Icon} n="search" s=${16} /><span>Rechercher une commande…</span><kbd>⌘K</kbd></div>
      <button className=${"net" + (s.offline ? " off" : "")} onClick=${toggleOffline} title="Simuler une coupure internet"><i></i><span>${s.offline ? "Hors ligne" : "En ligne"}</span></button>
      <button className="iconbtn" onClick=${() => APO.go("agent")} aria-label="Assistant"><${Icon} n="bot" />${waiting ? html`<span className="dot">${waiting}</span>` : null}</button>
      <button className="iconbtn" onClick=${() => { const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches); APO.setOverride({ mode: dark ? "light" : "dark" }); }} aria-label="Mode clair ou sombre"><${Icon} n="moon" /></button>
    </header>`;
  }

  function toggleOffline() {
    const s = APO.get();
    if (!s.offline) { APO.set({ offline: true }); APO.toast("Connexion coupée (simulation)", "La caisse continue : ventes enregistrées localement, numérotation de la série du terminal.", "wifi"); APO.log("Réseau coupé : mode hors ligne", "warn"); return; }
    const q = s.queue; APO.set({ offline: false, queue: [] });
    if (!q.length) { APO.toast("De retour en ligne", "Aucun fait à synchroniser."); return; }
    const exc = q.filter((f) => f.exception);
    APO.set((x) => ({ [x.variant]: { ...x[x.variant], exceptions: [...exc.map((f) => ({ id: APO.uid(), t: APO.now(), text: f.exception, ref: f.n })), ...x[x.variant].exceptions] } }));
    APO.toast(`Synchronisé : ${q.length} fait(s) accepté(s)`, exc.length ? `${exc.length} exception(s) à revoir dans l'accueil. Aucune vente rejetée.` : "Séries contiguës vérifiées par l'autorité.", "refresh");
    APO.log(`Synchronisation : ${q.length} faits acceptés, ${exc.length} exception(s)`, exc.length ? "warn" : "ok");
  }
  APO.toggleOffline = toggleOffline;

  function OfflineBar() {
    const s = APO.use(); if (!s.offline) return null; const org = D.org[s.variant];
    return html`<div className="offbar" role="status"><${Icon} n="wifi" s=${16} /><b>Hors ligne</b> La caisse continue. Numéros fiscaux définitifs de la série ${org.site}-${org.terminal}. <span>${s.queue.length} vente(s) en attente de synchronisation</span><span className="spacer"></span><span>Assistant et connexions en ligne en pause, reprise automatique</span></div>`;
  }

  function Toasts() { const s = APO.use(); return html`<div className="toasts" aria-live="polite">${s.toasts.map((t) => html`<div key=${t.id} className="toast"><${Icon} n=${t.icon || "check"} s=${16} /><div><b>${t.title}</b>${t.sub && html`<small>${t.sub}</small>`}</div></div>`)}</div>`; }

  function VariantBar() {
    const s = APO.use();
    const sw = (v) => { document.documentElement.dataset.variant = v; APO.set({ variant: v, palette: false }); try { history.replaceState(null, "", "#" + v); } catch (e) {} };
    return html`<div className="vbar" role="group" aria-label="Choisir le prototype"><span>Prototype</span><button className=${s.variant === "officine" ? "on" : ""} onClick=${() => sw("officine")}>Officine</button><button className=${s.variant === "para" ? "on" : ""} onClick=${() => sw("para")}>Parapharmacie</button><button className=${s.tour ? "on" : ""} onClick=${() => { if (s.tour) APO.set({ tour: null }); else APO.tourGo(0); }} title="Visite guidée de la démo">${s.tour ? "Quitter la visite" : "▶ Visite guidée"}</button></div>`;
  }

  /* ---------------- guided tour (presentation mode) ---------------- */
  APO.tour = { officine: [], para: [] };
  APO.optionalIds = (v) => D.plugins[v].filter((p) => !p.pinned).map((p) => p.id);
  const applyInstalls = (v, ids, freshIds) => {
    const inst = {}; D.plugins[v].forEach((p) => { inst[p.id] = p.pinned || p.themeBase || ids.includes(p.id); });
    const fresh = {}; (freshIds || []).forEach((id) => (fresh[id] = true));
    const first = (freshIds || []).map((id) => D.plugins[v].find((p) => p.id === id)).find((p) => p && p.nav[0]);
    APO.set((x) => ({ bare: false, installed: { ...x.installed, [v]: inst }, newPlugins: { ...(x.newPlugins || {}), [v]: fresh }, fresh: first ? first.nav[0].id : null }));
    if (first) setTimeout(() => APO.set({ fresh: null }), 1800);
  };
  /* A build step with plugins to add first shows the app WITHOUT them (same screen, same ticket),
     then opens the install modal; confirming installs them in place so before/after is visible. */
  APO.tourGo = (i) => { const s = APO.get(); const v = s.variant; const steps = APO.tour[v]; if (!steps[i]) { APO.set({ tour: null, preinstall: null }); return; }
    const st = steps[i]; const adds = st.add || [];
    const pending = !!(steps.build && adds.length);
    if (steps.build) { const prev = steps.slice(0, i).flatMap((x) => x.add || []); applyInstalls(v, pending ? prev : prev.concat(adds), []); }
    APO.set({ tour: { i, pending }, palette: false, toasts: [], preinstall: pending ? { ids: adds, step: i, source: "tour" } : null });
    if (st.go) APO.go(st.go); if (st.run) setTimeout(st.run, 60); };
  APO.askInstall = (ids, source) => APO.set({ preinstall: { ids, source: source || "market" } });
  APO.confirmInstall = () => { const s = APO.get(); const pi = s.preinstall; if (!pi) return; const v = s.variant;
    if (pi.source === "tour") { const steps = APO.tour[v]; const prev = steps.slice(0, pi.step).flatMap((x) => x.add || []); applyInstalls(v, prev.concat(pi.ids), pi.ids); APO.set((x) => ({ preinstall: null, tour: x.tour ? { ...x.tour, pending: false } : null })); const st = steps[pi.step]; if (st.after_run) setTimeout(st.after_run, 60); }
    else { pi.ids.forEach((id) => APO.installPlugin(id)); setTimeout(() => APO.set({ fresh: null }), 1800); APO.set({ preinstall: null }); }
    const th = pi.ids.map((id) => D.plugins[v].find((p) => p.id === id)).find((p) => p && p.theme);
    if (th) APO.setAppearance({ themeId: th.id, overrides: {} });
    const names = pi.ids.map((id) => (D.plugins[v].find((p) => p.id === id) || { name: id }).name).join(", ");
    APO.toast(names + " installé" + (pi.ids.length > 1 ? "s" : ""), "Les changements sont surlignés « Nouveau ».", "puzzle"); APO.log(`Plugin installé : ${pi.ids.join(", ")}`, "ok");
  };
  APO.contribOf = (s, p) => { const c = [];
    p.nav.forEach((n) => c.push(["Menu", n.label, "menu"]));
    APO.advisors[s.variant].filter((a) => a.plugin === p.id).forEach((a) => c.push(["Carte conseil", a.label, "card"]));
    APO.commands[s.variant].filter((x) => x.plugin === p.id).forEach((x) => c.push(["Commande ⌘K", x.label, "zap"]));
    (APO.homeTiles[s.variant] || []).filter((t) => t.plugin === p.id).forEach((t) => c.push(["Tuile d'accueil", t.label, "home"]));
    if (p.doc) c.push(["Type de document", p.doc.title + " · écran généré", "grid"]);
    if (p.theme) { c.push(["Thème", p.theme.label + " · couleurs, typographie, formes", "palette"]); if (p.theme.brand) c.push(["Marque blanche", p.theme.brand.name + " · nom et monogramme dans le menu", "badge"]); }
    return c; };
  function Tour() {
    const s = APO.use(); if (!s.tour) return null; const steps = APO.tour[s.variant]; const st = steps[s.tour.i]; if (!st) return null;
    return html`<section className="tour" role="region" aria-label="Visite guidée">
      <div className="tour-steps" aria-hidden="true">${steps.map((x, k) => html`<i key=${k} className=${k < s.tour.i ? "done" : k === s.tour.i ? "cur" : ""} onClick=${() => APO.tourGo(k)}></i>`)}</div>
      <div className="tour-body"><div className="tour-k">${st.kicker || "Visite guidée"} · étape ${s.tour.i + 1} sur ${steps.length}</div><h3>${st.title}</h3><p>${st.text}</p>
        ${steps.build && html`<${BuildProgress} s=${s} st=${st} />`}
        ${st.try && html`<p className="tour-try">À essayer : ${st.try}</p>`}</div>
      <div className="tour-acts">${st.action && html`<button className="btn sm" onClick=${st.action.run}>${st.action.label}</button>`}
        <button className="btn sm" disabled=${s.tour.i === 0} onClick=${() => APO.tourGo(s.tour.i - 1)}>Précédent</button>
        ${s.tour.pending ? html`<button className="btn sm pri" onClick=${() => APO.set({ preinstall: { ids: st.add, step: s.tour.i, source: "tour" } })}><${Icon} n="puzzle" s=${14} />Installer</button>`
          : html`<button className="btn sm pri" onClick=${() => APO.tourGo(s.tour.i + 1)}>${s.tour.i === steps.length - 1 ? "Terminer la visite" : "Suivant"}</button>`}
        <button className="btn ghost sm" onClick=${() => APO.set({ tour: null })} aria-label="Fermer la visite">Fermer</button></div></section>`;
  }
  function BuildProgress({ s, st }) {
    const v = s.variant; const opt = D.plugins[v].filter((p) => !p.pinned && !p.blocked && !p.themeBase); const on = opt.filter((p) => s.installed[v][p.id]).length;
    const names = (st.add || []).map((id) => (D.plugins[v].find((p) => p.id === id) || { name: id }).name);
    return html`<div className="build">
      ${names.length ? html`<span className="build-add">${names.map((n) => html`<span key=${n} className="badge acc">+ ${n}</span>`)}</span>` : html`<span className="badge">Noyau + plugins épinglés uniquement</span>`}
      <span className="build-meter"><span className="bar"><i style=${{ width: (on / opt.length) * 100 + "%" }}></i></span><span className="small muted">${on} / ${opt.length} plugins optionnels</span></span></div>`;
  }
  APO.Tour = Tour;

  /* ---------------- command palette ---------------- */
  function Palette() {
    const s = APO.use(); const [q, setQ] = useState(""); const [i, setI] = useState(0); const ref = useRef();
    useEffect(() => { if (s.palette) { setQ(""); setI(0); setTimeout(() => ref.current && ref.current.focus(), 10); } }, [s.palette]);
    if (!s.palette) return null;
    const v = s.variant;
    const nav = APO.navItems(s).map((n) => ({ label: "Aller à · " + n.label, plugin: n.plugin, icon: n.icon, run: () => APO.go(n.id) }));
    const cmds = APO.commands[v].filter((c) => c.plugin.startsWith("core") || c.plugin.startsWith("ma.") || APO.installed(s, c.plugin)).map((c) => ({ ...c, icon: c.icon || "zap" }));
    const glob = [
      { label: s.offline ? "Revenir en ligne (synchroniser)" : "Simuler une coupure internet", plugin: "kernel", icon: "wifi", run: toggleOffline },
      { label: "Parcourir le marketplace", plugin: "kernel", icon: "puzzle", run: () => APO.go("market") },
    ];
    const all = [...cmds, ...nav, ...glob].filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
    const run = (c) => { APO.set({ palette: false }); c.run(); };
    const key = (e) => { if (e.key === "ArrowDown") { setI(Math.min(i + 1, all.length - 1)); e.preventDefault(); } if (e.key === "ArrowUp") { setI(Math.max(i - 1, 0)); e.preventDefault(); } if (e.key === "Enter" && all[i]) run(all[i]); if (e.key === "Escape") APO.set({ palette: false }); };
    return html`<div><div className="scrim" onClick=${() => APO.set({ palette: false })}></div><div className="palette" role="dialog" aria-label="Palette de commandes">
      <input ref=${ref} id="palette-q" value=${q} onInput=${(e) => { setQ(e.target.value); setI(0); }} onKeyDown=${key} placeholder="Tapez une commande : commander, rejets, inventaire, promo…" />
      <ul>${all.slice(0, 40).map((c, k) => html`<li key=${c.label} className=${k === i ? "on" : ""} onMouseEnter=${() => setI(k)} onClick=${() => run(c)}><${Icon} n=${c.icon} s=${16} />${c.label}<span className="p">${c.plugin}</span></li>`)}
      ${!all.length && html`<li className="faint">Aucune commande. Installez un plugin pour en ajouter.</li>`}</ul>
      <div className="foot"><span>↑↓ naviguer · ↵ exécuter · Échap fermer</span><span className="spacer"></span><span>${cmds.length} commandes fournies par les plugins</span></div></div></div>`;
  }

  /* ---------------- marketplace ---------------- */
  APO.screens.market = function Market() {
    const s = APO.use(); const v = s.variant; const [tab, setTab] = useState("discover"); const [kind, setKind] = useState(s.marketKind || "Tous");
    useEffect(() => { if (s.marketKind) APO.set({ marketKind: null }); }, []); const [q, setQ] = useState(""); const [open, setOpen] = useState(null);
    const all = APO.plugins(s);
    const kinds = ["Tous", ...Array.from(new Set(all.filter((p) => !p.pinned).map((p) => p.kind)))];
    let list = tab === "installed" ? all.filter((p) => p.installed) : tab === "pinned" ? all.filter((p) => p.pinned) : all.filter((p) => !p.pinned);
    if (kind !== "Tous" && tab === "discover") list = list.filter((p) => p.kind === kind);
    if (q) list = list.filter((p) => (p.name + p.desc + p.pub).toLowerCase().includes(q.toLowerCase()));
    const featured = all.filter((p) => p.featured && !p.installed);
    const sel = open && all.find((p) => p.id === open);
    return html`<div>
      <${APO.PageH} title="Marketplace" sub="Chaque fonction d'Apotheka est un plugin. Installez, essayez, retirez : le menu, la caisse et la palette de commandes s'adaptent immédiatement.">
        <div className="search" style=${{ cursor: "text", minWidth: 260 }}><${Icon} n="search" s=${16} /><input id="mk-q" className="" style=${{ border: 0, outline: 0, background: "none", flex: 1 }} placeholder="Rechercher un plugin" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      </${APO.PageH}>
      ${featured.length > 0 && tab === "discover" && html`<div className="card" style=${{ marginBottom: 16, background: "linear-gradient(120deg,var(--accent-soft),var(--panel) 70%)" }}><div className="card-b row" style=${{ gap: 16 }}>
        <div className="mk-ic" style=${{ width: 48, height: 48 }}><${Icon} n=${featured[0].icon} s=${24} /></div>
        <div style=${{ flex: 1, minWidth: 220 }}><span className="faint small">À essayer pendant la démo</span><h3 style=${{ fontSize: 18 }}>${featured[0].name}</h3><p className="muted">${featured[0].desc}</p></div>
        <button className="btn pri" onClick=${() => setOpen(featured[0].id)}>Voir et installer</button></div></div>`}
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "discover", label: "Découvrir", count: all.filter((p) => !p.pinned).length }, { id: "installed", label: "Installés", count: all.filter((p) => p.installed).length }, { id: "pinned", label: "Épinglés (légal)", count: all.filter((p) => p.pinned).length }, { id: "log", label: "Journal d'accès" }, ...(v === "officine" ? [{ id: "contracts", label: "Contrats & grossistes" }] : [])]} />
      ${tab === "discover" && html`<div className="row" style=${{ marginBottom: 14 }}>${kinds.map((k) => html`<button key=${k} className=${"btn sm " + (k === kind ? "pri" : "")} onClick=${() => setKind(k)}>${k}</button>`)}</div>`}
      ${tab === "log" ? html`<${AccessLog} />` : tab === "contracts" ? html`<${Contracts} />` : html`<div className="grid g3">${list.map((p) => html`<${PluginCard} key=${p.id} p=${p} onOpen=${() => setOpen(p.id)} />`)}</div>`}
      ${sel && html`<${PluginDrawer} p=${sel} onClose=${() => setOpen(null)} />`}
    </div>`;
  };

  function PluginCard({ p, onOpen }) {
    return html`<div className="mk-card" role="button" tabIndex="0" onClick=${onOpen} onKeyDown=${(e) => e.key === "Enter" && onOpen()}>
      <div className="h"><div className="mk-ic"><${Icon} n=${p.icon} s=${20} /></div><div style=${{ minWidth: 0 }}><b>${p.name}</b><div className="pub">${p.pub}</div></div>
        <span style=${{ marginLeft: "auto" }}>${p.installed ? html`<${Badge} tone="ok">${p.pinned ? "Épinglé" : "Installé"}</${Badge}>` : p.blocked ? html`<${Badge} tone="warn">Bloqué</${Badge}>` : html`<span className="small faint">${p.price}</span>`}</span></div>
      <p>${p.desc}</p>
      <div className="f">${APO.tierBadge(p)}<${Badge}>${p.kind}</${Badge}>${APO.resBadge(p)}${APO.offBadge(p)}</div></div>`;
  }

  function PluginDrawer({ p, onClose }) {
    const s = APO.use(); const [view, setView] = useState("overview");
    const contrib = APO.contribOf(s, p);
    const manifest = p.theme ? APO.themeManifest(p, { ...p.theme, brandName: p.theme.brand && p.theme.brand.name, brandInitials: p.theme.brand && p.theme.brand.initials, shownAccent: p.theme.accent || APO.VARIANT_ACCENT[s.variant][0], shownAccentDark: p.theme.accentDark || APO.VARIANT_ACCENT[s.variant][1] }) : JSON.stringify({ id: p.id, version: "1.0.0", engines: { apotheka: "^1" }, tier: p.tier, kind: p.kind, residency: p.res === "MA" ? "personal→MA sandbox" : "non-personal", offline: p.off, contributes: { nav: p.nav.map((n) => n.id), advisory: APO.advisors[s.variant].filter((a) => a.plugin === p.id).map((a) => a.id), commands: APO.commands[s.variant].filter((c) => c.plugin === p.id).map((c) => c.id || c.label) }, permissions: p.perms, egress: p.egress || [], signatures: ["publisher", "apotheka-review"] }, null, 2);
    const install = () => { onClose(); APO.askInstall([p.id], "market"); };
    const useTheme = () => { APO.setAppearance({ themeId: p.id, overrides: {} }); onClose(); APO.go("appearance"); };
    const installNow = () => {
      APO.installPlugin(p.id);
      setTimeout(() => APO.set({ fresh: null }), 1800);
      const what = [p.nav.length ? "menu « " + p.nav.map((n) => n.label).join(", ") + " »" : null, contrib.some((c) => c[0] === "Carte conseil") ? "carte conseil au comptoir" : null, contrib.some((c) => c[0] === "Commande ⌘K") ? "commandes ⌘K" : null].filter(Boolean).join(" · ");
      APO.toast(p.name + " installé", what ? "Ajouté : " + what : "Prêt à l'emploi.", "puzzle"); APO.log(`Plugin installé : ${p.id} (${p.pub})`, "ok"); onClose();
    };
    const remove = () => { if (p.theme && APO.appearance(s).themeId === p.id) { APO.setAppearance({ themeId: "theme.classique", overrides: {} }); } APO.set((x) => ({ installed: { ...x.installed, [x.variant]: { ...x.installed[x.variant], [p.id]: false } } })); APO.toast(p.name + " retiré", "Ses données restent consultables et exportables (rétention légale)."); APO.log(`Plugin retiré : ${p.id}`, "warn"); onClose(); };
    return html`<${APO.Drawer} title=${p.name} icon=${html`<div className="mk-ic"><${Icon} n=${p.icon} /></div>`} onClose=${onClose}
      footer=${p.themeBase ? html`<span className="row muted small"><${Icon} n="palette" s=${15} /> Thème de base : toujours disponible, sert de repli si un thème est retiré.</span>` : p.pinned ? html`<span className="row muted small"><${Icon} n="lock" s=${15} /> Épinglé : obligation légale, ne peut pas être retiré ni remplacé.</span>` : p.blocked ? html`<span className="row small" style=${{ color: "var(--warn)" }}><${Icon} n="alert" s=${15} /> ${p.blocked}</span>` : p.installed ? html`${p.theme ? html`<button className="btn" onClick=${useTheme}><${Icon} n="palette" s=${15} />Appliquer</button>` : null}<button className="btn danger" onClick=${remove}><${Icon} n="trash" s=${15} />Retirer</button>` : html`<button className="btn ghost" onClick=${onClose}>Annuler</button><button className="btn pri" onClick=${install}><${Icon} n="check" s=${15} />Autoriser et installer</button>`}>
      <div className="row" style=${{ marginBottom: 12 }}>${APO.tierBadge(p)}<${Badge}>${p.kind}</${Badge}>${APO.resBadge(p)}${APO.offBadge(p)}<${Badge}>${p.price}</${Badge}></div>
      <p className="muted" style=${{ marginBottom: 14 }}>${p.desc}</p>
      <${APO.Tabs} value=${view} onChange=${setView} tabs=${[{ id: "overview", label: "Ce qu'il ajoute" }, { id: "perms", label: "Autorisations" }, { id: "manifest", label: "Manifeste" }]} />
      ${view === "overview" && html`<div className="col"><${Anatomy} p=${p} contrib=${contrib} />
        ${contrib.length ? html`<table className="tbl"><tbody>${contrib.map((c, i) => html`<tr key=${i}><td className="muted" style=${{ width: 140 }}>${c[0]}</td><td>${c[1]}</td></tr>`)}</tbody></table>` : html`<p className="faint">Service d'arrière-plan : aucun écran ajouté.</p>`}
        <div className="adv info"><div className="ic"><${Icon} n="info" s=${16} /></div><span className="src">Où il fonctionne</span><b>${p.tier === "system" || p.tier === "ma" || p.tier === "first" ? "Dans le noyau (code Apotheka)" : p.res === "MA" ? "Bac à sable marocain" : "Bac à sable Cloudflare (données non personnelles)"}</b><p>${p.tier === "partner" || p.tier === "private" ? "Isolé du reste du logiciel : il n'accède qu'à ce que vous avez autorisé, et ne peut jamais bloquer une vente." : "Fait partie du périmètre certifié ou des plugins Apotheka."}</p></div></div>`}
      ${view === "perms" && html`<div><p className="small muted" style=${{ marginBottom: 8 }}>Écran de consentement généré depuis le manifeste :</p>
        ${p.perms.map((x) => html`<div className="perm" key=${x}><${Icon} n="check" s=${16} /><span>${x}</span></div>`)}
        <div className="perm"><${Icon} n="globe" s=${16} /><span>Sorties réseau : ${p.egress && p.egress.length ? html`<code>${p.egress.join(", ")}</code> via le proxy (journalisé)` : "aucune"}</span></div>
        <div className="perm"><${Icon} n="lock" s=${16} /><span>Résidence : ${p.res === "MA" ? "données personnelles traitées au Maroc" : "hors Maroc : aucune donnée personnelle autorisée"}</span></div>
        <div className="perm"><${Icon} n="shield" s=${16} /><span>Signatures : éditeur + revue Apotheka · interrupteur d'arrêt par version</span></div></div>`}
      ${view === "manifest" && html`<div className="manifest">${manifest}</div>`}
    </${APO.Drawer}>`;
  }


  /* plugin anatomy: where in the app a plugin shows up, and what it may touch */
  function Anatomy({ p, contrib }) {
    const th = contrib.some((c) => c[0] === "Thème");
    const has = (k) => th || contrib.some((c) => c[0] === k);
    const perms = p.perms.join(" ");
    const personal = /client|patient|profil/i.test(perms) && !/aucune donnée patient|jamais de données clientes|jamais les achats/i.test(perms);
    const net = p.egress && p.egress.length;
    const blocks = p.tier === "ma" || p.tier === "system";
    const zone = (on, label, style) => html`<div className=${"az" + (on ? " on" : "")} style=${style}>${label}</div>`;
    return html`<div className="anat">
      <div className="anat-shell" aria-label="Zones de l'application modifiées par ce plugin">
        ${zone(has("Menu"), "Menu", { gridArea: "m" })}${zone(has("Commande ⌘K"), "⌘K", { gridArea: "k" })}
        ${zone(has("Tuile d'accueil"), "Accueil", { gridArea: "t" })}${zone(has("Carte conseil"), "Carte au comptoir", { gridArea: "c" })}
        ${zone(has("Type de document") || has("Menu"), th ? "Tous les écrans" : has("Type de document") ? "Écran généré" : "Écran", { gridArea: "s" })}</div>
      <div className="anat-facts">
        <div><span className=${personal ? "yes" : "no"}>${personal ? "Oui" : "Non"}</span> Données personnelles${personal ? " (traitées au Maroc)" : ""}</div>
        <div><span className=${net ? "yes" : "no"}>${net ? "Oui" : "Non"}</span> Accès réseau${net ? " : " + p.egress.join(", ") : ""}</div>
        <div><span className=${blocks ? "yes" : "no"}>${blocks ? "Oui" : "Non"}</span> Peut bloquer une vente${blocks ? " (obligation légale)" : ""}</div>
        <div><span className=${p.off === "full" ? "no" : "yes"}>${p.off === "full" ? "Non" : "Oui"}</span> A besoin d'internet</div></div></div>`;
  }
  function AccessLog() {
    return html`<${Card} title="Journal d'accès par plugin" sub="Ce que chaque plugin a lu et envoyé, consultable par le pharmacien" pad=${false}><div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Heure</th><th>Plugin</th><th>Accès</th><th>Résidence</th><th>Destination</th></tr></thead>
      <tbody>${D.accessLog.map((r, i) => html`<tr key=${i}><td className="mono">${r.t}</td><td><code>${r.plugin}</code></td><td>${r.what}</td><td><${Badge} mono>${r.res}</${Badge}></td><td className="mono small">${r.dest}</td></tr>`)}</tbody></table></div></${Card}>`;
  }

  function Contracts() {
    const s = APO.use(); const whs = D.wholesalers.filter((w) => !w.plugin || APO.installed(s, w.plugin));
    const rows = [["contract-wholesaler", "v1 · HTTP ouvert", "Dawa Maghreb, Grossiste Atlas", "ok"], ["contract-insurer", "v1", "CNSS FSE, AMO, Mutuelle FAR", "ok"], ["contract-payment", "v1", "1 acquéreur (objectif ≥ 2)", "warn"], ["contract-messaging", "v1", "SMS marocain · WhatsApp en attente juridique", "warn"], ["contract-clinical-db", "v1", "MedRef Maroc", "ok"], ["contract-iot-sensor", "v1", "FrigoSense", "ok"], ["contract-accounting-export", "v1", "Sage 100 Maroc, Odoo, CSV", "ok"], ["contract-webhook", "noyau", "Liaisons privées validées par l'admin", "ok"]];
    return html`<div className="grid g2">
      <${Card} title="Grossistes connectés" sub="Chaque grossiste publie son API ; Apotheka fournit l'adaptateur" pad=${false}><table className="tbl"><tbody>${whs.map((w) => html`<tr key=${w.id}><td><b>${w.name}</b><div className="faint small">${w.round}</div></td><td><${Badge} tone=${w.mode.startsWith("Whole") ? "ok" : "warn"}>${w.mode.startsWith("Whole") ? "Connexion directe" : w.mode}</${Badge}></td><td className="small muted">Crédit ${w.credit}</td></tr>`)}</tbody></table></${Card}>
      <${Card} title="Contrats publics" sub="Implémenter une fois, atteindre toutes les pharmacies" pad=${false}><table className="tbl"><tbody>${rows.map((r) => html`<tr key=${r[0]}><td><code>${r[0]}</code><div className="faint small">${r[1]}</div></td><td className="small">${r[2]}</td><td><${Badge} tone=${r[3]}>${r[3] === "ok" ? "≥ 2 ou conforme" : "à compléter"}</${Badge}></td></tr>`)}</tbody></table></${Card}></div>`;
  }

  /* ---------------- agent ---------------- */
  const ST = { queued: ["En file", "var(--faint)"], working: ["En cours", "var(--info)"], input: ["Besoin d'info", "var(--warn)"], approval: ["À valider", "var(--accent)"], stale: ["Obsolète · replanification", "var(--warn)"], done: ["Terminé", "var(--ok)"], failed: ["Échec", "var(--bad)"], cancelled: ["Annulé", "var(--faint)"] };
  APO.screens.agent = function Agent() {
    const s = APO.use(); const v = s.variant; const tasks = s[v].tasks; const [sel, setSel] = useState(tasks[0] && tasks[0].id);
    const t = tasks.find((x) => x.id === sel) || tasks[0];
    const upd = (id, patch) => APO.setV((cur) => ({ tasks: cur.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    const start = (prompt) => {
      if (s.offline) { APO.toast("Assistant en pause hors ligne", "La tâche sera lancée au retour du réseau. La caisse n'attend jamais l'assistant.", "wifi"); return; }
      const id = APO.uid(); APO.setV((cur) => ({ tasks: [{ id, title: prompt.title, state: "working", skill: prompt.skill, tools: prompt.tools, cost: "—", tainted: !!prompt.tainted, summary: "Analyse en cours…", lines: prompt.lines || [], kind: prompt.kind }, ...cur.tasks] })); setSel(id);
      setTimeout(() => upd(id, { state: prompt.lines && prompt.lines.length ? "approval" : "done", summary: prompt.summary, cost: prompt.cost }), 1600);
    };
    const approve = () => {
      const ok = t.lines.filter((l) => !l.rej);
      upd(t.id, { state: "done", summary: `${ok.length} ligne(s) validée(s) par ${D.org[v].pharmacist}. Commandes exécutées via le bus, journalisées.` });
      const fn = APO.onApprove[v]; fn && fn(t, ok);
      APO.toast("Brouillon validé", `${ok.length} commande(s) exécutée(s) sous votre nom. L'assistant n'agit jamais seul.`, "check");
    };
    const prompts = (APO.agentPrompts && APO.agentPrompts[v]) || [];
    return html`<div>
      <${APO.PageH} title="Assistant" sub="L'assistant lit les données agrégées et propose des brouillons. Il ne voit aucune donnée patient et ne touche jamais aux prix, à la dispensation, au carnet, aux registres ni à la fiscalité.">
        ${prompts.map((p) => html`<button key=${p.title} className="btn" onClick=${() => start(p)}><${Icon} n="spark" s=${15} />${p.title}</button>`)}
      </${APO.PageH}>
      <div className="split">
        <div className="col">${tasks.map((x) => html`<div key=${x.id} className="task" style=${{ cursor: "pointer", borderColor: x.id === (t && t.id) ? "var(--accent)" : "" }} onClick=${() => setSel(x.id)}>
          <div className="h"><b style=${{ fontSize: 13.5 }}>${x.title}</b></div>
          <div className="row"><span className="state">${x.state === "working" ? html`<span className="spin"></span>` : html`<i style=${{ background: ST[x.state][1] }}></i>`}${ST[x.state][0]}</span>${x.tainted && html`<${Badge} tone="warn">texte tiers lu</${Badge}>`}<span className="faint small" style=${{ marginLeft: "auto" }}>${x.cost}</span></div></div>`)}</div>
        ${t && html`<${Card} title=${t.title} sub=${"compétence " + t.skill} right=${html`<span className="state">${t.state === "working" ? html`<span className="spin"></span>` : html`<i style=${{ background: ST[t.state][1] }}></i>`}${ST[t.state][0]}</span>`}>
          <div className="col">
            <p>${t.summary}</p>
            <div className="row">${t.tools.map((x) => html`<${Badge} key=${x} mono>${x}</${Badge}>`)}${t.tainted && html`<${Badge} tone="warn">Contenu tiers lu : auto-validation impossible</${Badge}>`}<${Badge}>Coût ${t.cost}</${Badge}><${Badge} tone="ok">0 donnée patient envoyée</${Badge}></div>
            ${t.lines.length > 0 && html`<div><div className="row" style=${{ marginBottom: 8 }}><b>Brouillon de commandes</b><span className="faint small">validation ligne par ligne</span></div>
              <div className="draft">${t.lines.map((l, i) => html`<div key=${i} className=${"dl" + (l.rej ? " rej" : "")}><div><b>${l.label}</b><div className="faint small">${l.why}</div></div><span className="mono">${l.amount || ""}</span>
                ${t.state === "approval" ? html`<button className="btn sm" onClick=${() => upd(t.id, { lines: t.lines.map((y, k) => (k === i ? { ...y, rej: !y.rej } : y)) })}>${l.rej ? "Rétablir" : "Rejeter"}</button>` : html`<span></span>`}</div>`)}</div></div>`}
            ${t.state === "approval" && html`<div className="row"><button className="btn pri" onClick=${approve}><${Icon} n="check" s=${15} />Valider ${t.lines.filter((l) => !l.rej).length} ligne(s)</button><button className="btn ghost" onClick=${() => upd(t.id, { state: "cancelled", summary: "Annulé par l'utilisateur." })}>Annuler</button><span className="faint small" style=${{ marginLeft: "auto" }}>Exécuté sous votre identité · réversible</span></div>`}
          </div></${Card}>`}
      </div></div>`;
  };

  /* ---------------- conformity ---------------- */
  APO.screens.conformity = function Conformity() {
    const s = APO.use(); const v = s.variant; const org = D.org[v]; const [ver, setVer] = useState(null);
    const pinned = APO.plugins(s).filter((p) => p.pinned);
    const seq = s[v].series;
    const verify = () => { setVer("run"); setTimeout(() => setVer("ok"), 1300); };
    const rules = v === "officine" ? [["Décret PPV 2.25.631", "en vigueur 01/08/2026", "signé"], ["Liste rappels AMMPS", "v2026.11.07", "signé"], ["Conventions mutuelles", "FAR, MGPAP, MODEP · v14", "signé"], ["Barème timbre & TVA", "LF 2026", "signé"]] : [["Liste interdictions cosmétiques AMMPS", "v2026.11.02 (TPO)", "signé"], ["Barème TVA 20 %", "LF 2026", "signé"], ["Mentions loi 31-08", "v3", "signé"]];
    return html`<div>
      <${APO.PageH} title="Conformité" sub="Le noyau, les plugins système et le pack Maroc forment un périmètre certifié unique. Les règles (prix, rappels, conventions) sont des données signées et datées.">
        <button className="btn pri" onClick=${verify}><${Icon} n="shield" s=${15} />${ver === "run" ? "Vérification…" : "Vérifier la chaîne d'intégrité"}</button></${APO.PageH}>
      ${ver === "ok" && html`<div className="adv good" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="check" s=${16} /></div><span className="src">Chaîne de hachage</span><b>Intégrité vérifiée · ${APO.int(12482 + seq)} événements · racine ancrée ${new Date().toLocaleDateString("fr-FR")}</b><p>Aucune modification détectée sur les registres fiscaux, l'ordonnancier et le registre des stupéfiants.</p></div>`}
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Version du périmètre" value="1.4.2" delta=${"empreinte " + APO.hash("perimeter" + v).slice(0, 8)} />
        <${APO.Kpi} label=${"Série " + org.site + "-" + org.terminal} value=${String(seq).padStart(6, "0")} delta="contiguë · aucun trou" tone="up" />
        <${APO.Kpi} label="Plugins épinglés" value=${pinned.length} delta="non retirables" />
        <${APO.Kpi} label="Déclaration CNDP" value=${org.cndp.split("-").slice(-1)[0]} delta=${org.cndp} />
      </div>
      <div className="grid g2">
        <${Card} title="Périmètre certifié" pad=${false}><table className="tbl"><tbody>${pinned.map((p) => html`<tr key=${p.id}><td><code>${p.id}</code></td><td className="small muted">${p.desc}</td><td><${Icon} n="lock" s=${14} /></td></tr>`)}</tbody></table></${Card}>
        <div className="col">
          <${Card} title="Données de règles signées" sub="hors empreinte du code · datées" pad=${false}><table className="tbl"><tbody>${rules.map((r) => html`<tr key=${r[0]}><td>${r[0]}</td><td className="small muted">${r[1]}</td><td><${Badge} tone="ok">${r[2]}</${Badge}></td></tr>`)}</tbody></table></${Card}>
          <${Card} title="Mentions légales verrouillées"><div className="row small"><${Badge} mono>ICE ${org.ice}</${Badge}><${Badge} mono>IF ${org.if}</${Badge}><${Badge} mono>RC ${org.rc}</${Badge}><${Badge}>Détail TVA</${Badge}><${Badge}>Numérotation</${Badge}></div><p className="small faint" style=${{ marginTop: 8 }}>Les plugins peuvent enrichir un modèle de ticket, jamais modifier ces mentions.</p></${Card}>
        </div></div></div>`;
  };

  /* ---------------- generated document-type screen ---------------- */
  APO.DocScreen = function DocScreen({ pluginId }) {
    const s = APO.use(); const p = D.plugins[s.variant].find((x) => x.id === pluginId); const key = "doc_" + pluginId;
    const rows = (s[s.variant][key]) || p.doc.rows.map((r, i) => ({ n: `${p.doc.prefix}-2026-${String(41 - i).padStart(4, "0")}`, cells: r, st: Math.min(i + 1, p.doc.states.length - 1) }));
    const save = (next) => APO.setV({ [key]: next });
    const add = () => { save([{ n: `${p.doc.prefix}-2026-${String(42 + (rows.length - p.doc.rows.length)).padStart(4, "0")}`, cells: p.doc.cols.map((c, i) => (i === 0 ? "Nouveau document" : "—")), st: 0 }, ...rows]); APO.toast("Document créé", p.doc.title + " · numérotation non fiscale du plugin"); };
    const adv = (i) => save(rows.map((r, k) => (k === i ? { ...r, st: Math.min(r.st + 1, p.doc.states.length - 1) } : r)));
    const tones = ["", "info", "warn", "ok"];
    return html`<div>
      <${APO.PageH} title=${p.doc.title} sub=${"Fourni par le plugin « " + p.name + " » (" + p.pub + ")"}><button className="btn pri" onClick=${add}><${Icon} n="plus" s=${15} />Nouveau</button></${APO.PageH}>
      <div className="adv acc" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="puzzle" s=${16} /></div><span className="src">Écran fourni par Apotheka</span><b>Cet écran n'a pas été codé : il est généré depuis le type de document déclaré par le plugin.</b><p>Numérotation, états (${p.doc.states.join(" → ")}), pièces jointes, droits et journal d'audit sont fournis par le noyau. Chaque transition est une commande.</p></div>
      <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>N°</th>${p.doc.cols.map((c) => html`<th key=${c}>${c}</th>`)}<th>État</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => html`<tr key=${r.n}><td className="mono">${r.n}</td>${r.cells.map((c, k) => html`<td key=${k}>${c}</td>`)}<td><${Badge} tone=${tones[r.st]}>${p.doc.states[r.st]}</${Badge}></td><td className="r">${r.st < p.doc.states.length - 1 && html`<button className="btn sm" onClick=${() => adv(i)}>→ ${p.doc.states[r.st + 1]}</button>`}</td></tr>`)}</tbody></table></div></${Card}></div>`;
  };

  /* ---------------- events strip ---------------- */
  APO.Events = function Events({ limit = 8 }) {
    const s = APO.use(); const ev = s.events.filter((e) => e.v === s.variant).slice(0, limit);
    const tone = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--info)" };
    return html`<${Card} title="Journal en direct" sub="chaque action, au fil de la journée" pad=${false}>${ev.length ? html`<table className="tbl"><tbody>${ev.map((e, i) => html`<tr key=${i}><td className="mono faint" style=${{ width: 60 }}>${e.t}</td><td><span style=${{ display: "inline-block", width: 7, height: 7, borderRadius: 9, background: tone[e.kind], marginRight: 8 }}></span>${e.text}</td></tr>`)}</tbody></table>` : html`<div className="empty">Aucun événement pour l'instant. Faites une vente.</div>`}</${Card}>`;
  };


  /* ---------------- Apparence: themes are plugins, customisation is data ---------------- */
  const ACCENTS = ["#0d7457", "#2440c2", "#9c3768", "#7d5d26", "#0e5a64", "#5b4a9e", "#14213d", "#c2410c"];
  const SHOPS = ["Casablanca Maârif", "Rabat Agdal", "Marrakech Guéliz", "Casablanca Anfa"];
  APO.screens.appearance = function Appearance() {
    const s = APO.use(); const v = s.variant; const org = D.org[v];
    const a = APO.appearance(s); const o = a.overrides || {}; const t = APO.effectiveTheme(s);
    const themes = APO.plugins(s).filter((p) => p.theme && p.installed);
    const more = APO.plugins(s).filter((p) => p.theme && !p.installed).length;
    const [exp, setExp] = useState(false);
    const scope = a.scope || "site";
    const pick = (id) => APO.setAppearance({ themeId: id, overrides: {} });
    const isDark = t.mode === "dark" || (t.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    const curAccent = isDark ? t.shownAccentDark : t.shownAccent;
    const curPair = Object.keys(APO.FONT_PAIRS).find((k) => APO.FONT_PAIRS[k].display === t.display && APO.FONT_PAIRS[k].body === t.body);
    const reset = () => { APO.setAppearance({ overrides: {} }); APO.toast("Personnalisation effacée", "Retour aux valeurs du thème « " + t.plugin.name + " ».", "refresh"); };
    const savePrivate = () => {
      const n = D.plugins[v].filter((p) => p.theme && p.tier === "private" && p.id.startsWith("theme.prive")).length + 1;
      const id = "theme.prive-" + APO.uid(); const name = (o.brandName || org.name) + " · thème privé" + (n > 1 ? " " + n : "");
      const th = { label: name, accent: t.shownAccent, accentDark: t.shownAccentDark, accentFg: t.accentFg, accentFgDark: t.accentFgDark, bg: t.bg, panel: t.panel, bgDark: t.bgDark, panelDark: t.panelDark, radius: t.radius, display: t.display, body: t.body, density: t.density, touch: t.touch, touchFg: t.touchFg, contrast: t.contrast, mode: t.mode === "auto" ? undefined : t.mode, brand: t.whiteLabel ? { name: t.brandName, initials: t.brandInitials } : undefined };
      D.plugins[v].push({ id, name, desc: "Créé depuis l'écran Apparence. Valeurs déclaratives signées par l'administrateur, diffusées à " + (scope === "org" ? "toute l'organisation" : scope === "site" ? "ce site" : "ce poste") + ".", tier: "private", pub: org.name + " · privé", kind: "Thème", res: "MA", off: "full", installed: true, icon: "palette", nav: [], perms: ["Aucune donnée lue ni envoyée", "Aucun code exécuté : valeurs déclaratives signées"], price: "Privé", theme: th });
      APO.set((x) => ({ installed: { ...x.installed, [v]: { ...x.installed[v], [id]: true } }, appearance: { ...(x.appearance || {}), [v]: { ...APO.appearance(x, v), themeId: id, overrides: {} } } }));
      APO.toast("Thème privé enregistré", "« " + name + " » rejoint vos thèmes installés. Signé, versionné, retirable.", "palette"); APO.log("Thème privé créé : " + id, "ok");
    };
    const seg = (opts, val, set) => html`<div className="pill-toggle seg">${opts.map((x) => html`<button key=${x[0]} className=${val === x[0] ? "on" : ""} aria-pressed=${val === x[0]} onClick=${() => set(x[0])}>${x[2] ? html`<${Icon} n=${x[2]} s=${14} />` : null}${x[1]}</button>`)}</div>`;
    const lines = v === "officine"
      ? [["Doliprane 1000 mg", "boîte de 8 · lot DL2291", 2, 31.2], ["Smecta 3 g", "30 sachets · lot SM7710", 1, 33.1], ["Augmentin 1 g", "générique proposé", 1, 82.4]]
      : [["Anthelios UVmune 400", "50 ml · SPF 50+", 2, 398.0], ["Sensibio H2O", "250 ml", 1, 149.0], ["Cicalfate+ crème", "40 ml", 1, 129.0]];
    const total = lines.reduce((x, l) => x + l[3], 0);
    return html`<div>
      <${APO.PageH} title="Apparence" sub="Les thèmes sont des plugins : couleurs, typographie, formes et logo. Tout se voit en direct, dans l'aperçu comme dans toute l'application." >
        <button className="btn" onClick=${() => { APO.set({ marketKind: "Thème" }); APO.go("market"); }}><${Icon} n="puzzle" s=${15} />Plus de thèmes${more ? html` <span className="faint">${more}</span>` : null}</button>
      </${APO.PageH}>
      <div className="ap">
        <div className="ap-ctl">
          <section className="ap-sec"><div className="ap-h"><h3>Thèmes installés</h3><span className="faint small">${themes.length} · cliquer pour appliquer</span></div>
            <div className="th-grid">${themes.map((p) => { const on = t.pluginId === p.id; return html`<button key=${p.id} className=${"th-card" + (on ? " on" : "")} aria-pressed=${on} onClick=${() => pick(p.id)}>
              <${APO.ThemeStrip} t=${p.theme} h=${30} />
              <span className="th-meta"><span className="th-aa" style=${{ fontFamily: p.theme.display }}>Aa</span><span style=${{ minWidth: 0 }}><b>${p.name.replace(" · marque blanche", "")}</b><small>${p.pub}</small></span></span>
              <span className="th-tags">${on ? html`<${Badge} tone="acc"><${Icon} n="check" s=${11} w=${2.4} />Actif</${Badge}>` : null}${p.tier === "private" ? html`<${Badge} tone="warn">Privé</${Badge}>` : p.tier === "partner" ? html`<${Badge} tone="info">Partenaire</${Badge}>` : null}${p.theme.brand ? html`<${Badge}>Marque blanche</${Badge}>` : null}${p.theme.mode === "dark" ? html`<${Badge}>Sombre</${Badge}>` : null}</span></button>`; })}</div></section>

          <section className="ap-sec"><div className="ap-h"><h3>Personnaliser</h3><span className="faint small">par-dessus « ${t.plugin.name.replace(" · marque blanche", "")} »</span></div>
            <div className="ap-row"><label>Couleur d'accent</label><div className="row" style=${{ gap: 7 }}>
              ${ACCENTS.map((c) => html`<button key=${c} className=${"swatch" + ((o.accent || t.shownAccent).toLowerCase() === c ? " on" : "")} style=${{ background: c }} aria-label=${"Accent " + c} onClick=${() => APO.setOverride({ accent: c })}></button>`)}
              <label className="ap-color" title="Couleur libre"><input type="color" value=${o.accent || t.shownAccent} onInput=${(e) => APO.setOverride({ accent: e.target.value })} /><span className="mono small">${curAccent}</span></label></div></div>
            <div className="ap-row"><label>Arrondi des angles <span className="mono faint">${t.radius} px</span></label><div className="row" style=${{ gap: 10, flexWrap: "nowrap" }}>
              <span className="ap-corner" style=${{ borderRadius: 0 }}></span><input className="ap-range" type="range" min="0" max="22" step="1" value=${t.radius} onInput=${(e) => APO.setOverride({ radius: +e.target.value })} aria-label="Arrondi" /><span className="ap-corner" style=${{ borderTopLeftRadius: 22 }}></span></div></div>
            <div className="ap-row"><label>Densité</label>${seg(Object.entries(APO.DENSITY).map(([k, d]) => [k, d.label]), t.density, (k) => APO.setOverride({ density: k }))}</div>
            <div className="ap-row"><label>Typographie</label><div className="fp-grid">${Object.entries(APO.FONT_PAIRS).map(([k, f]) => html`<button key=${k} className=${"fp" + (curPair === k ? " on" : "")} aria-pressed=${curPair === k} onClick=${() => APO.setOverride({ fontPair: k })}><span className="fp-aa" style=${{ fontFamily: f.display }}>Ag</span><b style=${{ fontFamily: f.body }}>${f.label}</b><small>${f.hint}</small></button>`)}</div></div>
            <div className="ap-row"><label>Mode</label>${seg([["auto", "Auto", "refresh"], ["light", "Clair", "sun"], ["dark", "Sombre", "moon"]], o.mode || t.mode, (k) => APO.setOverride({ mode: k }))}</div>
            <div className="ap-row"><label>Marque affichée <span className="faint">(marque blanche)</span></label><div className="ap-brand">
              <span className="ap-logo">${t.brandInitials}</span>
              <input className="input" placeholder=${t.brand ? t.brand.name : "Apotheka"} value=${o.brandName || ""} onInput=${(e) => APO.setOverride({ brandName: e.target.value })} aria-label="Nom de marque" />
              <input className="input mono" style=${{ width: 74, textAlign: "center", textTransform: "uppercase" }} maxLength="3" placeholder=${t.brand ? t.brand.initials : "A"} value=${o.brandInitials || ""} onInput=${(e) => APO.setOverride({ brandInitials: e.target.value.toUpperCase() })} aria-label="Initiales" /></div></div>
          </section>

          <section className="ap-sec"><div className="ap-h"><h3>Appliquer à</h3></div>
            <div className="scope">${[["poste", "Ce poste", org.site + "·" + org.terminal + " uniquement", "card"], ["site", "Ce site", v === "para" ? "Boutique " + SHOPS[0] : org.name, "store"], ["org", "Toute l'organisation", v === "para" ? "Siège · " + SHOPS.length + " boutiques" : "Siège · toutes les officines", "building"]].map((x) => html`<button key=${x[0]} className=${"scope-o" + (scope === x[0] ? " on" : "")} aria-pressed=${scope === x[0]} onClick=${() => APO.setAppearance({ scope: x[0] })}><${Icon} n=${x[3]} s=${16} /><span><b>${x[1]}</b><small>${x[2]}</small></span><i></i></button>`)}</div>
            ${v === "para" && html`<div className="shops">${SHOPS.map((sh, i) => { const on = scope === "org" || (scope === "site" && i === 0) || (scope === "poste" && i === 0); return html`<span key=${sh} className=${"shop" + (on ? " on" : "")}><${Icon} n=${on ? "check" : "minus"} s=${12} w=${2.2} />${sh}${scope === "poste" && i === 0 ? html` <em>· C01</em>` : null}</span>`; })}</div>`}
          </section>

          <div className="ap-acts"><button className="btn pri" onClick=${savePrivate}><${Icon} n="palette" s=${15} />Enregistrer comme thème privé</button>
            <button className="btn" onClick=${() => setExp(true)}><${Icon} n="download" s=${15} />Exporter le manifeste</button>
            <button className="btn ghost" onClick=${reset}><${Icon} n="refresh" s=${15} />Réinitialiser</button></div>

          <div className="ap-note"><div className="ap-note-h"><${Icon} n="shield" s=${16} /><b>Un thème est un pack de données signé</b></div>
            <p>Il ne contient aucun code : seulement des valeurs déclaratives, signées par l'éditeur et revues par Apotheka.</p>
            <div className="ap-cando"><div><h6>Peut changer</h6><ul><li>Couleurs d'accent et fonds</li><li>Typographie</li><li>Formes et densité</li><li>Nom et logo affichés</li></ul></div>
              <div><h6>Ne peut jamais changer</h6><ul className="no"><li>Mentions légales du ticket</li><li>Numérotation fiscale</li><li>Prix et TVA</li><li>Couleurs d'alerte</li></ul></div></div></div>
        </div>

        <div className="ap-pv">
          <div className="pv-cap"><span className="small muted">Aperçu en direct</span><b>${t.label}</b><span className="spacer"></span><${Badge}>${isDark ? "Sombre" : "Clair"}</${Badge}><${Badge} mono>${APO.fontName(t.display)}</${Badge}></div>
          <div className="pv">
            <div className="pv-side"><div className="pv-brand"><span className="logo">${t.brandInitials}</span><span style=${{ minWidth: 0 }}><b>${t.brandName}</b><small>${t.whiteLabel ? "propulsé par Apotheka" : org.name}</small></span></div>
              ${[["scan", v === "officine" ? "Comptoir" : "Caisse", 1], ["box", "Stock"], ["truck", "Achats"], ["users", "Clients"], ["palette", "Apparence"]].map((n) => html`<span key=${n[1]} className=${"pv-nav" + (n[2] ? " on" : "")}><${Icon} n=${n[0]} s=${14} />${n[1]}</span>`)}</div>
            <div className="pv-main">
              <div className="pv-top"><b>${v === "officine" ? "Comptoir" : "Caisse"}</b><span className="pv-scan"><${Icon} n="scan" s=${14} />Scanner ou rechercher…</span></div>
              <div className="pv-body">
                <div className="pv-ticket"><div className="pv-th"><span>Ticket en cours</span><${Badge} tone="acc">${lines.length} lignes</${Badge}></div>
                  ${lines.map((l) => html`<div key=${l[0]} className="pv-line"><span><b>${l[0]}</b><small>${l[1]}</small></span><span className="pv-q">× ${l[2]}</span><span className="mono">${APO.n2(l[3])}</span></div>`)}
                  <div className="pv-tot"><span>Total TTC</span><b>${APO.dh(total)}</b></div>
                  <div className="row" style=${{ gap: 8 }}><button className="btn pri pv-pay"><${Icon} n="card" s=${15} />Encaisser</button><button className="btn">En attente</button></div></div>
                <div className="pv-aside">
                  <div className="adv acc"><div className="ic"><${Icon} n="spark" s=${16} /></div><span className="src">Conseil · plugin</span><b>${v === "officine" ? "Générique disponible : −34,10 DH" : "Routine peau sèche suggérée"}</b><p>${v === "officine" ? "Amoxicilline/ac. clav. Sandoz, même dosage." : "Ajouter Cicalfate mains au panier."}</p></div>
                  <div className="adv veto"><div className="ic"><${Icon} n="alert" s=${16} /></div><span className="src">Pack Maroc · couleur fixe</span><b>${v === "officine" ? "Tableau B : ordonnance requise" : "Produit interdit AMMPS : vente bloquée"}</b></div>
                  <div className="receipt pv-rc"><div className="c"><b>${t.whiteLabel ? t.brandName : org.name}</b></div><div className="c faint">${org.city}</div><hr />
                    ${lines.slice(0, 2).map((l) => html`<div key=${l[0]} className="rr"><span>${l[0].split(" ")[0]} ×${l[2]}</span><span>${APO.n2(l[3])}</span></div>`)}<hr />
                    <div className="rr"><b>TOTAL</b><b>${APO.n2(total)}</b></div><div className="pv-lock"><${Icon} n="lock" s=${11} />ICE ${org.ice} · N° ${org.site}-${org.terminal}-004182</div></div>
                </div></div></div></div>
          <div className="pv-fixed"><span className="small muted"><${Icon} n="lock" s=${13} /> Les couleurs d'alerte restent fixes pour la sécurité</span><span className="pv-sem"><i style=${{ background: "var(--ok)" }}></i>Conforme<i style=${{ background: "var(--warn)" }}></i>Attention<i style=${{ background: "var(--bad)" }}></i>Bloquant</span></div>
        </div>
      </div>
      ${exp && html`<${APO.Modal} onClose=${() => setExp(false)}><div className="drawer-h"><div className="mk-ic"><${Icon} n="palette" /></div><div><h3 style=${{ fontSize: 17 }}>Manifeste du thème</h3><span className="small faint">Valeurs déclaratives uniquement · aucun code</span></div><span className="spacer"></span><button className="iconbtn" onClick=${() => setExp(false)} aria-label="Fermer"><${Icon} n="x" /></button></div>
        <div className="drawer-b col"><div className="manifest" style=${{ maxHeight: "52vh" }}>${APO.themeManifest({ ...t.plugin, name: t.label }, t)}</div>
          <p className="small muted">Signé par l'éditeur puis revu par Apotheka. Le noyau refuse tout jeton hors liste : un thème ne peut ni exécuter de code, ni toucher aux mentions légales, à la numérotation, aux prix ou aux couleurs d'alerte.</p></div>
        <div className="drawer-f"><button className="btn" onClick=${() => { try { navigator.clipboard.writeText(APO.themeManifest({ ...t.plugin, name: t.label }, t)); } catch (e) {} APO.toast("Manifeste copié", "JSON prêt à être signé et publié."); }}><${Icon} n="copy" s=${15} />Copier</button><button className="btn pri" onClick=${() => setExp(false)}>Fermer</button></div></${APO.Modal}>`}
    </div>`;
  };

  /* ---------------- intro: the pharmacy drawer cabinet ---------------- */
  function Intro() {
    const s = APO.use();
    const drawers = [
      ["Comptoir", "sys"], ["Stock & lots", "sys"], ["Achats", "sys"], ["Carnet clients", "sys"],
      ["CNSS · FSE", "ma"], ["Tiers payant", "ma"], ["Registres", "ma"], ["Rappels de lots", "ma"],
      ["Dawa Maghreb", "plug"], ["Grossiste Atlas", "plug"], ["Smart-buy", "plug"], ["Assistant", "plug"],
      ["Interactions", "plug"], ["Préparations", "plug"], ["Promotions", "plug"], ["Fidélité", "plug"],
      ["E-shop", "plug"], ["Animatrices", "plug"], ["Chaîne du froid", "plug"], ["Votre plugin", "empty"],
    ];
    const open = (v, tour) => { document.documentElement.dataset.variant = v; APO.set({ intro: false, variant: v }); try { history.replaceState(null, "", "#" + v); } catch (e) {} if (tour) setTimeout(() => APO.tourGo(0), 50); };
    return html`<div className="intro">
      <div className="intro-text">
        <div className="brand" style=${{ padding: 0 }}><div className="logo">A</div><div><b>Apotheka</b><small>Prototype de présentation</small></div></div>
        <h1>Une officine se compose. Son logiciel aussi.</h1>
        <p className="lede">Apotheka gère une pharmacie ou une parapharmacie de bout en bout : comptoir, stock, achats, tiers payant, clients, comptabilité. Chaque fonction est un tiroir que l'on ajoute ou retire, sans changer de logiciel.</p>
        <div className="intro-points">
          <div><b>Un noyau certifié</b><span>Ventes, stock et registres infalsifiables, même sans internet.</span></div>
          <div><b>Le pack Maroc, scellé</b><span>FSE, tiers payant, registres et prix réglementés, toujours présents.</span></div>
          <div><b>Des plugins ouverts</b><span>Grossistes, partenaires et assistant s'installent en un clic.</span></div>
        </div>
        <div className="row" style=${{ gap: 10, marginTop: 6 }}>
          <button className="btn pri lg" onClick=${() => open(s.variant, true)}>Lancer la visite guidée</button>
          <button className="btn lg" onClick=${() => open("officine")}>Ouvrir l'officine</button>
          <button className="btn lg" onClick=${() => open("para")}>Ouvrir la parapharmacie</button>
        </div>
        <p className="small faint">Données d'exemple. Aucune donnée réelle de pharmacie.</p>
      </div>
      <div className="cabinet" aria-label="Armoire à tiroirs : chaque tiroir est un plugin">
        ${drawers.map((d, i) => html`<div key=${d[0]} className=${"tiroir " + d[1]} style=${{ animationDelay: 120 + i * 70 + "ms" }}>
          <span className="plate">${d[0]}</span><i className="knob"></i>${d[1] === "ma" ? html`<span className="seal" title="Scellé : obligation légale"><${Icon} n="lock" s=${11} w=${2.2} /></span>` : null}</div>`)}
        <div className="cabinet-legend"><span><i className="lg-sys"></i>Noyau</span><span><i className="lg-ma"></i>Pack Maroc, scellé</span><span><i className="lg-plug"></i>Plugins installables</span></div>
      </div>
    </div>`;
  }

  /* ---------------- install modal: what it is, what changes, before / after ---------------- */
  function InstallModal() {
    const s = APO.use(); const pi = s.preinstall; if (!pi) return null;
    const v = s.variant; const ps = pi.ids.map((id) => D.plugins[v].find((p) => p.id === id)).filter(Boolean);
    const step = pi.source === "tour" ? APO.tour[v][pi.step] : null;
    const contrib = ps.flatMap((p) => APO.contribOf(s, p).map((c) => [...c, p.name]));
    const asList = (x) => (Array.isArray(x) ? x : x ? [x] : []);
    const tp = ps.find((p) => p.theme), ct = APO.activeThemePlugin(s).theme;
    const thBefore = tp && [`Apparence actuelle : ${ct.label}.`, `Titres en ${APO.fontName(ct.display)}, angles de ${ct.radius} px.`, ct.brand ? `Marque affichée : ${ct.brand.name}.` : "Marque affichée : Apotheka."];
    const thAfter = tp && [`${tp.theme.label} s'applique tout de suite, dans tous les écrans.`, `Titres en ${APO.fontName(tp.theme.display)}, texte en ${APO.fontName(tp.theme.body)}, angles de ${tp.theme.radius} px.`, tp.theme.brand ? `Le menu affiche « ${tp.theme.brand.name} » et son monogramme ${tp.theme.brand.initials}.` : "Les couleurs d'alerte, les mentions légales et les prix ne changent pas."];
    const before = step && step.before ? asList(step.before) : thBefore ? thBefore : [`Sans ${ps.map((p) => "« " + p.name + " »").join(" et ")}, ces éléments n'existent pas dans l'application.`, ...contrib.map((c) => `Pas de ${c[0].toLowerCase()} « ${c[1]} »`)];
    const after = step && step.after ? asList(step.after) : thAfter ? thAfter : contrib.length ? contrib.map((c) => `${c[0]} : ${c[1]}`) : ["Service d'arrière-plan prêt à l'emploi, sans nouvel écran."];
    const close = () => APO.set({ preinstall: null });
    const themeP = ps.find((p) => p.theme); const curT = APO.activeThemePlugin(s).theme;
    return html`<div><div className="scrim" onClick=${close}></div>
      <div className="modal imodal" role="dialog" aria-label=${"Installer " + ps.map((p) => p.name).join(", ")}>
        <div className="im-head">
          <div className="im-icons">${ps.map((p) => html`<div key=${p.id} className="mk-ic"><${Icon} n=${p.icon} s=${20} /></div>`)}</div>
          <div style=${{ minWidth: 0 }}><span className="small faint">${pi.source === "tour" ? "Avant d'installer · étape " + (pi.step + 1) : "Avant d'installer"}</span>
            <h3>${ps.map((p) => p.name).join(" + ")}</h3></div>
          <button className="iconbtn" style=${{ marginLeft: "auto" }} onClick=${close} aria-label="Fermer"><${Icon} n="x" /></button></div>
        <div className="im-body">
          <section className="im-sec"><h4>Qu'est-ce que c'est ?</h4>
            ${ps.map((p) => html`<div key=${p.id} className="im-plug"><div className="row" style=${{ gap: 6 }}><b>${p.name}</b>${APO.tierBadge(p)}<${Badge}>${p.kind}</${Badge}>${APO.resBadge(p)}${APO.offBadge(p)}<${Badge}>${p.price}</${Badge}></div>
              <p className="muted">${p.desc}</p><p className="small faint">Éditeur : ${p.pub}</p></div>`)}</section>
          <section className="im-ba" aria-label="Avant et après">
            <div className="im-before"><h4>Avant</h4>${themeP ? html`<div className="im-theme"><${APO.ThemeStrip} t=${curT} h=${22} /><span style=${{ fontFamily: curT.display }}>Aa</span><small>${curT.label}</small></div>` : null}<ul>${before.map((b, k) => html`<li key=${k}>${b}</li>`)}</ul></div>
            <div className="im-arrow" aria-hidden="true"><${Icon} n="arrow" s=${20} /></div>
            <div className="im-after"><h4>Après</h4>${themeP ? html`<div className="im-theme"><${APO.ThemeStrip} t=${themeP.theme} h=${22} /><span style=${{ fontFamily: themeP.theme.display }}>Aa</span><small>${themeP.theme.label}</small></div>` : null}<ul>${after.map((b, k) => html`<li key=${k}>${b}</li>`)}</ul></div></section>
          <section className="im-sec"><h4>Ce qui va changer dans l'application</h4>
            ${contrib.length ? html`<ul className="im-changes">${contrib.map((c, k) => html`<li key=${k}><${Icon} n=${c[2]} s=${15} /><span><b>${c[0]}</b> ${c[1]}</span>${ps.length > 1 ? html`<span className="faint small">${c[3]}</span>` : null}</li>`)}</ul>` : html`<p className="muted small">Aucun nouvel écran : le plugin travaille en arrière-plan.</p>`}</section>
          ${ps.length === 1 ? html`<section className="im-sec"><h4>Ce qu'il peut toucher</h4><${Anatomy} p=${ps[0]} contrib=${APO.contribOf(s, ps[0])} /></section>` : html`<section className="im-sec"><h4>Ce qu'ils peuvent toucher</h4>${ps.map((p) => html`<div key=${p.id} style=${{ marginBottom: 8 }}><b className="small">${p.name}</b><${Anatomy} p=${p} contrib=${APO.contribOf(s, p)} /></div>`)}</section>`}
        </div>
        <div className="im-foot"><span className="small faint">Retirable à tout moment · les données restent consultables</span><span className="spacer"></span>
          <button className="btn ghost" onClick=${close}>Pas maintenant</button>
          <button className="btn pri" onClick=${APO.confirmInstall}><${Icon} n="check" s=${15} />Installer et voir le résultat</button></div>
      </div></div>`;
  }
  /* ---------------- root ---------------- */
  APO.App = function App() {
    const s = APO.use(); const v = s.variant; const cur = s.screen[v];
    React.useLayoutEffect(() => { APO.applyTheme(s); });
    useEffect(() => { const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); APO.set((x) => ({ palette: !x.palette })); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
    if (s.intro) return html`<${Intro} />`;
    const nav = APO.navItems(s); const ok = nav.some((n) => n.id === cur);
    const id = ok ? cur : "home";
    let body;
    if (id.startsWith("doc:")) body = html`<${APO.DocScreen} key=${id} pluginId=${nav.find((n) => n.id === id).plugin} />`;
    else { const Scr = APO.screens[v + ":" + id] || APO.screens[id]; body = Scr ? html`<${Scr} />` : html`<div className="empty">Écran ${id}</div>`; }
    const full = id === "counter" || id === "pcounter";
    return html`<div className="app">
      <${Sidebar} />
      <main className="main"><${Topbar} /><${OfflineBar} /><${Tour} /><div className=${"work" + (full ? " full" : "")} key=${v + id}>${body}</div></main>
      <${VariantBar} /><${Palette} /><${InstallModal} /><${Toasts} />
      ${s.sideOpen && html`<div className="scrim" style=${{ zIndex: 44 }} onClick=${() => APO.set({ sideOpen: false })}></div>`}
    </div>`;
  };
})();
