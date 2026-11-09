/* PROTOTYPE — Parapharmacie variant. Throwaway code. */
(function () {
  const { useState } = React;
  const APO = window.APO, D = window.APO_DATA, html = APO.html, Icon = APO.Icon, Badge = APO.Badge, Card = APO.Card;
  const ORG = D.org.para;

  /* ---------------- chain layout (para only): 4 shops + central warehouse ---------------- */
  // data.js is shared: we extend it locally instead of editing it.
  const SHOPS = [...D.shops, { id: "s4", name: "Casablanca · Anfa", short: "Anfa" }];
  const DEPOT = { id: "dc", name: "Dépôt central · Aïn Sebaâ", short: "Dépôt", depot: true };
  const LOCS = [...SHOPS, DEPOT]; // stock arrays: [Maârif, Agdal, Guéliz, Anfa, Dépôt]
  ORG.city = "4 boutiques · Casablanca, Rabat, Marrakech";
  const remap = (a) => (a.length >= 5 ? a.slice() : [a[0], a[1], a[2], Math.max(0, Math.round(a[0] * 0.6) - 1), Math.round((a[0] + a[1] + a[2]) * 1.5)]);
  const TODAY = "13/11";

  /* ---------------- plugin contributions declared from para.js ---------------- */
  const plug = (id) => D.plugins.para.find((p) => p.id === id);
  if (!plug("expiry.para")) {
    plug("core.sales").nav.push({ id: "cloture", label: "Clôture de caisse", icon: "lock", group: "Quotidien" });
    plug("chain.hq").nav.push({ id: "hq", label: "Siège", icon: "building", group: "Gestion" });
    const gc = plug("giftcards"); gc.nav = [{ id: "giftcards", label: "Cartes cadeaux", icon: "gift", group: "Commerce" }]; delete gc.doc;
    gc.desc = "Cartes physiques et e-cartes valables dans les 4 boutiques : émission sans TVA, soldes, paiement partiel.";
    D.plugins.para.push(
      { id: "expiry.para", name: "Fin de saison & péremption", desc: "Lots proches de la date limite, démarque de fin de saison (financée par la marque ou retour stock), durée après ouverture des testeurs.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "full", installed: true, icon: "clock", nav: [], perms: ["Lire les lots et les dates", "Proposer une démarque"], price: "Inclus" },
      { id: "lor.connect", name: "Connecteur L'Oréal Cosmétique Active", desc: "La marque pousse un pack de promotions signé avec ses conditions de financement (marque 70 %). Sell-out La Roche-Posay et Vichy renvoyé automatiquement.", tier: "partner", pub: "L'Oréal Cosmétique Active Maroc (partenaire)", kind: "Connecteur", res: "MA", off: "full", installed: false, icon: "link", nav: [], perms: ["Publier des règles de promotion signées (para uniquement)", "Lire les ventes agrégées La Roche-Posay et Vichy", "Aucune donnée cliente"], egress: ["api.loreal-cosmetique-active.ma"], price: "Offert par la marque" }
    );
  }

  /* ---------------- extra demo data (para only) ---------------- */
  // A non-compliant import used to demo the cosmetic-ban veto (Pack Maroc) at the counter.
  const BANNED = { id: "q9", brand: "Import parallèle", range: "Éclaircissant", name: "Crème éclaircissante « Glow 7 jours »", color: "#7d8590", price: 89, cost: 38, ean: "6111250390114", banned: "Contient de l'hydroquinone 4 %, interdite dans les cosmétiques (liste AMMPS v2026.11.02)", variants: [{ v: "30 ml", stock: [4, 0, 2, 0, 0] }] };
  const PP = [...D.paraProducts, BANNED];
  const VP = { "q3:1": 219, "q5:1": 265 }; // variant price overrides (500 ml, édition Or)
  const VISAGE = ["q1", "q2", "q4", "q7"];
  // excl = non cumulable ; prio = 1 is evaluated first and keeps its articles
  const PROMO_RULES = {
    pr1: { type: "nth", n: 2, pct: 50, pids: ["q1"], brand: 70, from: "01/11", excl: true, prio: 1, dist: "lor" },
    pr2: { type: "xfory", x: 3, y: 2, pids: ["q3"], brand: 100, from: "01/11", excl: false, prio: 2, dist: "naos" },
    pr3: { type: "threshold", min: 400, pct: 20, pids: VISAGE, brand: 0, from: "27/11", excl: true, prio: 3 },
  };
  // Rule pack pushed by the L'Oréal partner connector (visible only while it is installed)
  const PARTNER_RULES = [
    { id: "lor1", plugin: "lor.connect", name: "Vichy Minéral 89 : 2ᵉ à −40 %", rule: "2e article −40 %", scope: "Vichy · Minéral 89", type: "nth", n: 2, pct: 40, pids: ["q4"], brand: 70, from: "13/11", until: "31/12", active: true, uses: 0, excl: false, prio: 2, dist: "lor", sig: "lor-cosmetique-active · " + APO.hash("lor1-pack-2026-11").slice(0, 8) },
  ];
  const SKIN = {
    "Mixte · sensible": { pid: "q7", vi: 0, why: "Barrière fragilisée par le froid : une crème réparatrice le soir complète Sensibio H2O et Minéral 89." },
    "Sèche": { pid: "q4", vi: 0, why: "Peau sèche : booster à l'acide hyaluronique à appliquer sous la Cica-crème, matin et soir." },
    "Grasse": { pid: "q3", vi: 0, why: "Peau grasse : démaquillage doux sans rinçage avant l'Anthelios Teinté, pour limiter les imperfections." },
  };
  // Purchases since January: ~8 M DH for a chain selling ~45 000 DH/day
  const DIST = [
    { id: "lor", brands: ["La Roche-Posay", "Vichy"], name: "L'Oréal Cosmétique Active Maroc", rep: "Yassine A. · délégué Casa-Rabat", min: 5000, free: "1 UG pour 10 Anthelios", terms: "60 j fin de mois · escompte 2 % à 30 j", rfa: { done: 3518000, target: 4200000, rate: 3 } },
    { id: "pf", brands: ["Avène"], name: "Pierre Fabre Dermo-Cosmétique Maroc", rep: "Meryem K. · déléguée régionale", min: 3000, free: "Testeurs Couvrance offerts dès 4 000 DH", terms: "60 j fin de mois", rfa: { done: 1485000, target: 2200000, rate: 2.5 } },
    { id: "naos", brands: ["Bioderma"], name: "NAOS Maroc", rep: "Anas T. · KAM chaînes", min: 2500, free: "3+1 sur Sensibio H2O 500 ml", terms: "45 j", rfa: { done: 1712000, target: 1800000, rate: 2 } },
    { id: "nuxe", brands: ["Nuxe"], name: "Nuxe Maroc · distributeur exclusif", rep: "Sara E. · animation réseau", min: 4000, free: "Coffrets fêtes : 1 offert pour 6", terms: "30 j", rfa: { done: 964000, target: 1500000, rate: 4 } },
    { id: "multi", brands: ["Mustela", "Uriage"], name: "Distripara Maroc (multi-marques)", rep: "Service clients · commande web", min: 1500, free: "—", terms: "30 j · franco 1 500 DH", rfa: { done: 619000, target: 800000, rate: 1.5 } },
  ];
  const BRANDPERF = [["La Roche-Posay", 146980, 989, 21.4], ["Avène", 93360, 566, 23.0], ["Bioderma", 81960, 643, 18.2], ["Nuxe", 71690, 314, 26.1], ["Vichy", 51120, 202, 19.4], ["Uriage", 23570, 151, 21.6], ["Mustela", 20740, 173, 22.1]];
  // Purchase history per customer: [date, label, amount, shop, ticket, pid, vi, qty]
  const HISTORY = {
    k1: [["02/11", "Bioderma Sensibio H2O 500 ml", 219, "Casa", "MAA-C01-2026-000061", "q3", 1, 1], ["19/10", "Vichy Minéral 89 50 ml", 265, "Casa", "MAA-C01-2026-000034", "q4", 0, 1], ["19/10", "Anthelios UVMune 400 × 2 (promo)", 328.5, "Casa", "MAA-C01-2026-000033", "q1", 0, 2], ["28/09", "Nuxe Coffret Rêve de Miel", 349, "Rabat", "AGD-C01-2026-000412", "q8", 0, 1]],
    k2: [["06/11", "Uriage Cica-crème 40 ml", 159, "Rabat", "AGD-C01-2026-000517", "q7", 0, 1], ["06/11", "Mustela Hydra Bébé 40 ml", 129, "Rabat", "AGD-C01-2026-000517", "q6", 0, 1], ["12/10", "Nuxe Huile Prodigieuse 100 ml", 235, "Rabat", "AGD-C01-2026-000468", "q5", 0, 1]],
    k3: [["09/09", "Anthelios UVMune 400 Teinté 50 ml", 219, "Marrakech", "GLZ-C01-2026-000203", "q1", 1, 1], ["14/07", "Bioderma Sensibio H2O 250 ml", 149, "Marrakech", "GLZ-C01-2026-000117", "q3", 0, 1]],
  };
  const THREADS = {
    m1: { cust: "k1", pid: "q2", vi: 1, msgs: [{ me: 0, t: "10:31", x: "Bonjour 🙂 vous avez le fond de teint Couvrance en 2.0 Naturel ?" }, { me: 1, t: "10:35", x: "Bonjour Salma, oui, il nous en reste à Maârif. 189,00 DH." }, { me: 0, t: "10:41", x: "Parfait, vous pouvez me le mettre de côté ?" }, { me: 0, t: "10:42", x: "Je passe ce soir vers 19h" }] },
    m2: { cust: null, pid: "q8", vi: 0, msgs: [{ me: 0, t: "10:15", x: "Salam, prix du coffret Nuxe svp ? Vous livrez à Rabat ?" }] },
    m3: { cust: "k2", pid: "q7", vi: 0, msgs: [{ me: 1, t: "Hier", x: "Votre commande est prête à Agdal : Cica-crème 40 ml." }, { me: 0, t: "Hier", x: "Merci, bien reçu 👍" }] },
  };
  const TR_STEPS = ["Demandé", "Expédié", "En transit", "Reçu"];
  const PO_STEPS = ["Brouillon", "Envoyée", "Confirmée", "Réception", "Livrée"];
  const WEB_STEPS = ["Payée", "Préparée", "Expédiée", "Livrée"];
  const STAFF = [{ id: "u1", name: "Nadia T.", role: "Responsable" }, { id: "u2", name: "Youssef B.", role: "Conseiller beauté" }];
  const PAYL = { cash: "Espèces", card: "Carte bancaire", wallet: "Wallet QR", gift: "Carte cadeau", split: "Paiement mixte" };
  const MANAGER_PIN = "1234";
  // Morning sales already rung at each shop before the demo starts (included in the home figures)
  const BASE = { s1: { cash: 6240, card: 10880, wallet: 1300, tickets: 92 }, s2: { cash: 4110, card: 8020, wallet: 830, tickets: 61 }, s3: { cash: 3050, card: 4620, wallet: 550, tickets: 37 }, s4: { cash: 2290, card: 4610, wallet: 450, tickets: 33 } };
  const SHOP_STATUS = { s1: { term: "MAA-C01", open: "09:02", lastZ: "Z-MAA-C01-2026-0312" }, s2: { term: "AGD-C01", open: "09:10", lastZ: "Z-AGD-C01-2026-0298" }, s3: { term: "GLZ-C01", open: "09:31", lastZ: "Z-GLZ-C01-2026-0187" }, s4: { term: "ANF-C01", open: "10:00", lastZ: "Z-ANF-C01-2026-0041" } };
  const SHRINK_BASE = { s1: 0.42, s2: 0.61, s3: 0.38, s4: 0.55 }; // % of monthly sales
  const MONTH_SALES = { s1: 236000, s2: 168000, s3: 107000, s4: 96000 };
  // Lots and dates for the season-end / expiry plugin
  const LOTS = [
    { id: "l1", pid: "q1", vi: 0, lot: "LRP4K21", exp: "05/2027", months: 6, qty: 18, shop: "dc" },
    { id: "l2", pid: "q1", vi: 1, lot: "LRP3H07", exp: "03/2027", months: 4, qty: 7, shop: "s1" },
    { id: "l3", pid: "q1", vi: 0, lot: "LRP4M02", exp: "07/2027", months: 8, qty: 9, shop: "s3" },
    { id: "l4", pid: "q1", vi: 0, lot: "LRP5B19", exp: "11/2028", months: 24, qty: 14, shop: "s1" },
  ];
  const PAO = { q1: 12, q2: 12, q4: 6, q5: 36, q3: 6, q6: 6, q7: 12, q8: 12 }; // months after opening
  const INV_ZONE = [["q1", 0], ["q1", 1], ["q2", 0], ["q2", 1], ["q2", 2], ["q2", 3], ["q4", 0], ["q7", 0]];
  const INV_DEMO = { "q1:0": -1, "q2:3": -1, "q4:0": -1 }; // differences used by "Remplir (démo)"
  const REASONS = ["Vol", "Casse", "Testeur non déclaré", "Erreur de réception"];

  /* ---------------- helpers ---------------- */
  const pp = (id) => PP.find((p) => p.id === id);
  const P = () => (APO.get() && APO.get().para) || {};
  const vPrice = (p, vi, shopId) => { const st = P(); const sh = shopId || st.shop; const ov = st.prices || {}; return ov[sh + ":" + p.id + ":" + vi] ?? ov[p.id + ":" + vi] ?? (VP[p.id + ":" + vi] || p.price); };
  const basePrice = (p, vi) => VP[p.id + ":" + vi] || p.price;
  const vCost = (p, vi) => { const c = (P().cost || {})[p.id] || p.cost; return Math.round((c * basePrice(p, vi) / p.price) * 100) / 100; };
  const vName = (p, vi) => p.variants[vi].v;
  const title = (p) => (p.kit || p.banned ? p.name : p.range + " · " + p.name);
  const sIdx = (id) => LOCS.findIndex((x) => x.id === id);
  const shop = (id) => LOCS.find((x) => x.id === id);
  const custOf = (st) => D.paraCustomers.find((c) => c.id === st.customer);
  const initials = (b) => { const w = b.split(/[\s-]+/).filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join("").slice(0, 3) : b.slice(0, 2)).toUpperCase(); };
  const Thumb = ({ p, s = 44 }) => html`<div className="thumb" style=${{ background: p.color, width: s, height: s, fontSize: s < 40 ? 11 : 13 }}>${initials(p.brand)}</div>`;
  const marginAt = (price, cost) => { const ht = price / 1.2; return ((ht - cost) / ht) * 100; };
  const marginPct = (p, vi) => marginAt(vPrice(p, vi), vCost(p, vi));
  const fund = (b) => (b >= 100 ? "Marque 100 %" : b <= 0 ? "Boutique 100 %" : `Marque ${b} % · Boutique ${100 - b} %`);
  const ruleLabel = (r) => ({ nth: `${r.n}ᵉ article à −${r.pct} %`, xfory: `${r.x} pour ${r.y}`, pct: `Remise −${r.pct} %`, threshold: `−${r.pct} % dès ${r.min} DH` }[r.type]);
  const tierTone = (t) => (t === "Gold" ? "warn" : t === "Silver" ? "info" : "");
  const sumStock = (st, pid, vi) => st.stock[pid][vi].reduce((a, b) => a + b, 0);
  const pct = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));
  const Steps = ({ steps, at }) => html`<div className="timeline">${steps.map((x, i) => html`<div key=${x} className=${"st" + (i < at ? " done" : i === at ? " cur" : "")}><i></i><span>${x}</span></div>`)}</div>`;
  const Swatch = ({ c, s = 12 }) => html`<span style=${{ display: "inline-block", width: s, height: s, borderRadius: 99, background: c, boxShadow: "0 0 0 1px var(--line-2)", verticalAlign: "-1px", marginRight: 6 }}></span>`;
  const stockBadge = (q) => (q <= 0 ? html`<${Badge} tone="bad">Rupture</${Badge}>` : q < 4 ? html`<${Badge} tone="warn">${q}</${Badge}>` : html`<${Badge} tone="ok">${q}</${Badge}>`);
  const variantOptions = () => PP.filter((p) => !p.banned).flatMap((p) => p.variants.map((v, i) => ({ value: p.id + ":" + i, label: `${p.brand} · ${p.range} · ${v.v}` })));
  const futureDate = (d) => { if (!d) return false; const [dd, mm] = d.split("/").map(Number); const [td, tm] = TODAY.split("/").map(Number); return mm > tm || (mm === tm && dd > td); };
  const ruleState = (r) => (r.active ? "active" : futureDate(r.from) ? "scheduled" : "paused");
  const rulesOf = (st, s) => st.promos.filter((r) => !r.plugin || APO.installed(s, r.plugin));
  const promoterBrand = (p) => (p.name.match(/\(([^)]+)\)/) || [])[1];
  const sellerName = (st) => { if (!st.seller) return null; if (st.seller.startsWith("p")) return D.promoters[+st.seller.slice(1)].name; const u = STAFF.find((x) => x.id === st.seller); return u ? u.name : null; };
  const stockMove = (stock, pid, vi, locId, d) => ({ ...stock, [pid]: stock[pid].map((v, i) => (i === vi ? v.map((q, j) => (j === sIdx(locId) ? q + d : q)) : v)) });
  const termNo = (prefix, seq) => `${prefix}-${ORG.site}-${ORG.terminal}-2026-${String(seq).padStart(6, "0")}`;
  const NewTag = () => html`<span className="newtag">Nouveau</span>`;

  /* ---------------- promo engine (signed rules, evaluated locally, priority + non-stacking) ---------------- */
  function promoEval(st, s, basket, rulesIn) {
    if (!APO.installed(s, "promo.engine")) return { lines: [], skipped: [] };
    const rules = (rulesIn || rulesOf(st, s).filter((r) => r.active)).slice().sort((a, b) => (a.prio || 9) - (b.prio || 9));
    const claimed = {}; const lines = []; const skipped = [];
    rules.forEach((r) => {
      const units = []; const used = []; let by = null;
      (basket || st.basket).filter((l) => r.pids.includes(l.pid)).forEach((l) => {
        const c = claimed[l.pid];
        if (c && (c.excl || r.excl)) { by = c.name; return; }
        used.push(l.pid); for (let i = 0; i < l.qty; i++) units.push(vPrice(pp(l.pid), l.vi));
      });
      if (by) skipped.push({ id: r.id, label: r.name, by });
      if (!units.length) return;
      units.sort((a, b) => b - a);
      let d = 0;
      if (r.type === "nth") units.forEach((u, i) => { if ((i + 1) % r.n === 0) d += (u * r.pct) / 100; });
      if (r.type === "xfory") for (let g = 0; g + r.x <= units.length; g += r.x) units.slice(g, g + r.x).slice(r.y).forEach((u) => (d += u));
      if (r.type === "pct") d = (units.reduce((a, b) => a + b, 0) * r.pct) / 100;
      if (r.type === "threshold") { const sum = units.reduce((a, b) => a + b, 0); if (sum >= r.min) d = (sum * r.pct) / 100; }
      if (d > 0) { lines.push({ id: r.id, label: r.name, amount: d, brand: r.brand, dist: r.dist, pids: used, partner: !!r.plugin }); used.forEach((pid) => (claimed[pid] = { excl: !!r.excl, name: r.name })); }
    });
    return { lines, skipped };
  }
  const promoLines = (st, s) => promoEval(st, s).lines;

  function totals(s) {
    const st = s.para; const cust = custOf(st); const loy = APO.installed(s, "loyalty");
    const sub = st.basket.reduce((a, l) => a + vPrice(pp(l.pid), l.vi) * l.qty, 0);
    const ev = promoEval(st, s); const promos = ev.lines;
    const disc = promos.reduce((a, x) => a + x.amount, 0);
    const redeem = cust && loy ? Math.min(st.redeem, Math.max(0, sub - disc)) : 0;
    const credit = st.credit ? Math.min(st.credit.amount, Math.max(0, sub - disc - redeem)) : 0;
    const total = Math.max(0, sub - disc - redeem - credit);
    return { sub, promos, skipped: ev.skipped, disc, redeem, credit, total, vat: total - total / 1.2, ht: total / 1.2, earn: cust && loy ? Math.floor(total / 10) : 0, brandFund: promos.reduce((a, x) => a + (x.amount * x.brand) / 100, 0) };
  }

  // Tenders for the current ticket: single mode, or split (gift card + bank card + cash remainder)
  function tenders(st, total) {
    if (st.pay !== "split") return [{ mode: st.pay, amount: total }];
    const sp = st.split || {}; const gift = Math.min(+sp.gift || 0, total); const card = Math.min(+sp.card || 0, total - gift);
    return [gift > 0 && { mode: "gift", amount: gift, code: sp.code }, card > 0 && { mode: "card", amount: card }, { mode: "cash", amount: Math.max(0, total - gift - card) }].filter((x) => x && (x.amount > 0 || x.mode === "cash"));
  }

  function addLine(pid, vi, from, mode, n) {
    const key = pid + ":" + vi + ":" + from;
    APO.setV((c) => { const ex = c.basket.find((l) => l.key === key); return { basket: ex ? c.basket.map((l) => (l.key === key ? { ...l, qty: l.qty + (n || 1) } : l)) : [...c.basket, { key, pid, vi, from, mode, qty: n || 1 }] }; });
  }

  function newTransfer(c, pid, vi, qty, from, to, why, forSale) {
    const id = "TR-2611-0" + (12 + c.transfers.length);
    return { id, pid, vi, qty, from, to, st: 0, t: "13/11 " + APO.now(), why, forSale: !!forSale };
  }

  /* ---------------- initial state ---------------- */
  // Two tickets already rung this morning at C01 (part of the BASE figures), so returns can be shown before any sale.
  const seedSales = () => [
    { n: `${ORG.site}-${ORG.terminal}-2026-000087`, t: "10:12", seed: true, shop: "s1", cust: "k1", earn: 41, total: 413, pays: [{ mode: "card", amount: 413 }], seller: "u2", lines: [{ pid: "q2", vi: 1, qty: 1, unit: 189 }, { pid: "q3", vi: 0, qty: 1, unit: 149 }, { pid: "q6", vi: 0, qty: 1, unit: 129 }], disc: 54 },
    { n: `${ORG.site}-${ORG.terminal}-2026-000088`, t: "10:47", seed: true, shop: "s1", cust: null, earn: 0, total: 235, pays: [{ mode: "cash", amount: 235 }], seller: "u1", lines: [{ pid: "q5", vi: 0, qty: 1, unit: 235 }], disc: 0 },
  ];
  APO.init.para = () => ({
    basket: [], customer: null, shop: "s1", pay: "cash", split: null, series: 88, avSeries: 3, lastHash: "4be1d0c9", redeem: 0, credit: null, picker: null, receipt: null, quarantine: false,
    seller: "u2", parked: [], returnOpen: false, returns: [], vouchers: [], closed: {}, zSeries: 312, float: 500,
    stock: Object.fromEntries(PP.map((p) => [p.id, p.variants.map((v) => remap(v.stock))])),
    points: Object.fromEntries(D.paraCustomers.map((c) => [c.id, c.points])),
    sales: seedSales(), exceptions: [{ id: "e0", t: "09:14", text: "Écart d'inventaire Rabat : Couvrance 4.0 Miel, −1 unité au comptage tournant", ref: "INV-RAB-2611-07" }],
    promos: [...D.promos.map((p) => ({ ...p, ...PROMO_RULES[p.id] })), ...PARTNER_RULES.map((r) => ({ ...r }))],
    prices: {}, cost: {}, hqLog: [{ id: "PX-2611-007", t: "02/11 08:00", text: "Bioderma Sensibio H2O : +3 % (hausse distributeur)", shops: "4 boutiques", eff: "04/11", labels: 112, hash: "9c1e44a0" }],
    transfers: [
      { id: "TR-2611-014", pid: "q1", vi: 1, qty: 3, from: "s2", to: "s1", st: 2, t: "12/11 17:40", why: "Réassort Anthelios Teinté · promo 2ᵉ à −50 %" },
      { id: "TR-2611-013", pid: "q2", vi: 3, qty: 1, from: "s3", to: "s2", st: 1, t: "12/11 11:05", why: "Réservation cliente à Agdal" },
      { id: "TR-2611-011", pid: "q3", vi: 1, qty: 4, from: "s1", to: "s3", st: 3, t: "10/11 09:30", why: "Équilibrage avant le week-end" },
    ],
    testers: [
      { id: "ts1", pid: "q2", vi: 1, shop: "s1", opened: "03/11/2026", by: "Kenza (Avène)" },
      { id: "ts2", pid: "q4", vi: 0, shop: "s1", opened: "21/05/2026", by: "Équipe Maârif" },
      { id: "ts3", pid: "q5", vi: 0, shop: "s3", opened: "29/10/2026", by: "Rim (Nuxe)" },
      { id: "ts4", pid: "q1", vi: 0, shop: "s2", opened: "01/10/2025", by: "Équipe Agdal" },
    ],
    samples: [
      { id: "sp1", name: "Anthelios UVMune 400 · 3 ml", brand: "La Roche-Posay", shop: "s1", qty: 120 },
      { id: "sp2", name: "Couvrance 2.0 · dosette 1 ml", brand: "Avène", shop: "s2", qty: 64 },
      { id: "sp3", name: "Huile Prodigieuse · 10 ml", brand: "Nuxe", shop: "s3", qty: 35 },
    ],
    consign: [
      { id: "dv1", item: "Huile d'argan cosmétique bio 50 ml", owner: "Coopérative Tighanimine · Agadir", shop: "s3", dep: 40, sold: 23, price: 120, com: 25, settled: false },
      { id: "dv2", item: "Coffret Rêve de Miel · édition fêtes", owner: "Nuxe Maroc", shop: "s1", dep: 20, sold: 7, price: 349, com: 30, settled: false },
      { id: "dv3", item: "Savon noir beldi à l'eucalyptus 200 g", owner: "Coopérative Nisrine · Essaouira", shop: "s2", dep: 60, sold: 41, price: 45, com: 30, settled: false },
    ],
    pos: [
      { id: "BC-MAA-0313", dist: "lor", lines: 46, total: 61840, st: 3, t: "12/11", note: "Livraison centrale · BL-LOR-55812 arrivé au dépôt", bl: "BL-LOR-55812" },
      { id: "BC-MAA-0312", dist: "pf", lines: 18, total: 41800, st: 2, t: "11/11", note: "Testeurs Couvrance × 4 offerts" },
      { id: "BC-MAA-0309", dist: "nuxe", lines: 12, total: 62400, st: 4, t: "06/11", note: "1 coffret offert pour 6" },
    ],
    recv: { done: false, dec: { r1: "claim", r2: "claim", r3: "refuse", r4: "accept", r5: "accept" } },
    topup: {}, offers: {}, read: {}, reservations: [], promoterIn: {}, promoterOut: {}, promoterSales: {}, selloutSent: false, claims: {},
    inv: { shop: "s1", counts: {}, shown: false, reasons: {}, done: [] }, shrink: {}, markdowns: {},
    gift: [
      { code: "GC-7Q2M-91", amount: 500, balance: 500, shop: "s1", issued: "08/11", buyer: "Entreprise Saham · cadeaux salariés", kind: "Physique", uses: [] },
      { code: "GC-K8W1-04", amount: 300, balance: 120, shop: "s2", issued: "21/10", buyer: "—", kind: "E-carte", uses: [{ t: "04/11", shop: "Rabat", amount: 180, ticket: "AGD-C01-2026-000503" }] },
      { code: "GC-R3PZ-56", amount: 200, balance: 200, shop: "s4", issued: "12/11", buyer: "Ghita A.", kind: "E-carte", uses: [] },
    ],
    threads: JSON.parse(JSON.stringify(THREADS)),
    web: [
      { id: "WEB-10482", ch: "E-shop", who: "Ghita A. · Casablanca", items: "Huile Prodigieuse 100 ml × 2", total: 470, st: 0, t: "10:52" },
      { id: "JUM-7712093", ch: "Jumia", who: "Client Jumia · Tanger", items: "Sensibio H2O 500 ml × 1", total: 219, st: 1, t: "10:20" },
      { id: "WEB-10479", ch: "E-shop", who: "Leila M. · Rabat", items: "Couvrance 3.0 Sable · Anthelios 50 ml", total: 408, st: 2, t: "09:41" },
      { id: "JUM-7711850", ch: "Jumia", who: "Client Jumia · Fès", items: "Hydra Bébé 40 ml × 2", total: 258, st: 3, t: "Hier" },
    ],
    tasks: [
      { id: "t1", title: "Réassort et transferts avant le week-end", state: "approval", skill: "Plan de réassort", tools: ["Stock par boutique", "Ventes par boutique", "Conditions distributeurs", "Calendrier promo"], cost: "0,36 DH", tainted: false, kind: "restock",
        summary: "Le samedi pèse +28 % sur les 4 boutiques et la promo Anthelios accélère les ventes. 3 variantes passeraient en rupture avant dimanche. Proposition : 2 transferts par la navette de vendredi soir et 2 commandes distributeurs (UG et RFA prises en compte).",
        lines: [
          { label: "Transfert Anthelios Teinté 50 ml × 2 · Casa → Marrakech", why: "Marrakech à 0 · 1,8 vente/jour · navette vendredi 18:00", type: "transfer", pid: "q1", vi: 1, from: "s1", to: "s3", qty: 2, amount: "—" },
          { label: "Transfert Couvrance 4.0 Miel × 1 · Marrakech → Casa", why: "Casa à 1 unité · teinte demandée 3 fois cette semaine", type: "transfer", pid: "q2", vi: 3, from: "s3", to: "s1", qty: 1, amount: "—" },
          { label: "Commande L'Oréal Cosmétique Active · Anthelios UVMune 50 ml × 120", why: "Promo 2ᵉ à −50 % : +62 % de ventes · 12 UG (1 pour 10) · RFA à 84 %", type: "po", dist: "lor", total: 17520, amount: APO.n2(17520) },
          { label: "Commande NAOS · Sensibio H2O 500 ml × 48", why: "3 pour 2 actif · offre distributeur 3+1 · palier RFA atteint après cette commande", type: "po", dist: "naos", total: 7056, amount: APO.n2(7056) },
        ] },
      { id: "t2", title: "Bilan promo Anthelios (semaine 45)", state: "done", skill: "Bilan promo", tools: ["Utilisations des promos", "Ventes par marque"], cost: "0,12 DH", tainted: false, summary: "86 utilisations, panier moyen +71 DH quand la promo s'applique. Coût boutique 30 % : 1 905 DH, compensé par +4 120 DH de marge additionnelle. Recommandation : prolonger jusqu'au 15/12.", lines: [] },
      { id: "t3", title: "Lecture des conditions commerciales Avène 2027", state: "done", skill: "Lecture de conditions", tools: ["Documents distributeurs"], cost: "0,08 DH", tainted: true, summary: "Le PDF du distributeur annonce un minimum porté à 3 500 DH et une RFA à 3 % dès 2,4 M DH d'achats. Ce texte vient d'un tiers : aucune condition n'a été modifiée automatiquement, à valider avec Meryem K.", lines: [] },
    ],
  });

  /* ---------------- advisory / veto contributions ---------------- */
  APO.advisors.para = [
    { plugin: "ma.recalls", id: "cosmetic-ban", label: "Interdiction cosmétique AMMPS (veto)", run: (st) => st.basket.filter((l) => pp(l.pid).banned).map((l) => ({ tone: "veto", icon: "alert", src: "Pack Maroc · Bloquant", title: `${pp(l.pid).name} : vente interdite`, text: pp(l.pid).banned + ". Stock bloqué dans les 4 boutiques et au dépôt.",
      actions: [{ label: "Retirer et mettre en quarantaine", pri: true, run: () => { APO.setV((c) => ({ basket: c.basket.filter((x) => x.key !== l.key), quarantine: true })); APO.toast("Produit retiré du ticket", "6 unités en quarantaine (Casa 4, Marrakech 2) · retour fournisseur préparé.", "alert"); APO.log("Pack Maroc : « Glow 7 jours » bloqué et mis en quarantaine (hydroquinone)", "warn"); } }] })) },
    { plugin: "promo.engine", id: "promo-applied", label: "Promotions appliquées automatiquement", run: (st) => { const ev = promoEval(st, APO.get()); const pl = ev.lines; if (!pl.length && !ev.skipped.length) return []; const tot = pl.reduce((a, x) => a + x.amount, 0); const br = pl.reduce((a, x) => a + (x.amount * x.brand) / 100, 0);
      return [pl.length && { tone: "good", icon: "tag", src: "Moteur de promotions", title: `${pl.length} promotion${pl.length > 1 ? "s" : ""} appliquée${pl.length > 1 ? "s" : ""} · −${APO.dh(tot)}`, text: `Règles signées du siège, calculées sur la caisse (même hors ligne). Part marque ${APO.dh(br)} refacturée au distributeur.` },
        ...ev.skipped.map((k) => ({ tone: "info", icon: "info", src: "Moteur de promotions · cumul", title: `${k.label} : non cumulable`, text: `Les articles concernés bénéficient déjà de « ${k.by} », prioritaire. Une seule remise par article.` }))].filter(Boolean); } },
    { plugin: "promo.engine", id: "promo-nudge", label: "Suggestion pour compléter une promo", run: (st) => rulesOf(st, APO.get()).filter((r) => r.active && (r.type === "nth" || r.type === "xfory")).flatMap((r) => { const ls = st.basket.filter((l) => r.pids.includes(l.pid)); const q = ls.reduce((a, l) => a + l.qty, 0); const n = r.type === "nth" ? r.n : r.x; if (!q || q % n !== n - 1) return []; const l = ls[ls.length - 1]; const p = pp(l.pid);
      return [{ tone: "acc", icon: "spark", src: "Moteur de promotions · suggestion", title: r.type === "nth" ? `Encore 1 ${p.range} : −${r.pct} % sur le moins cher` : `Encore 1 ${p.range} : le ${r.x}ᵉ est offert`, text: `${r.name} · ${fund(r.brand)}.`, actions: [{ label: `Ajouter ${vName(p, l.vi)}`, run: () => { addLine(l.pid, l.vi, l.from, l.mode); APO.toast("Article ajouté", "La remise est recalculée automatiquement.", "tag"); } }] }]; }) },
    { plugin: "loyalty", id: "points", label: "Points et remise fidélité", run: (st) => { const c = custOf(st); if (!c) return []; const pts = st.points[c.id]; const T = totals(APO.get());
      return [{ tone: "acc", icon: "star", src: "Fidélité", title: `${c.name} · ${c.tier} · ${APO.int(pts)} pts`, text: st.redeem ? `500 pts utilisés : −50,00 DH sur ce ticket. Ce ticket rapportera ${T.earn} pts.` : `Carte unique 4 boutiques. Ce ticket rapportera ${T.earn} pts (1 pt pour 10 DH). 500 pts = 50 DH de remise.`,
        actions: st.redeem ? [{ label: "Annuler l'utilisation", run: () => { APO.setV({ redeem: 0 }); APO.toast("Points rendus", "500 pts recrédités."); } }] : pts >= 500 && st.basket.length ? [{ label: "Utiliser 500 pts · −50 DH", pri: true, run: () => { APO.setV({ redeem: 50 }); APO.toast("Remise fidélité appliquée", `−50,00 DH · ${c.name}`, "star"); } }] : null }]; } },
    { plugin: "skin-diag", id: "routine", label: "Routine suggérée selon le type de peau", run: (st) => { const c = custOf(st); if (!c || !SKIN[c.skin]) return []; const r = SKIN[c.skin]; if (st.basket.some((l) => l.pid === r.pid)) return []; const p = pp(r.pid);
      return [{ tone: "info", icon: "face", src: "Partenaire DermaLab · Conseil", title: `Peau ${c.skin.toLowerCase()} : ${p.brand} ${p.range}`, text: r.why + " Profil peau consenti, traité au Maroc.", actions: [{ label: `Ajouter ${p.range} · ${APO.n2(vPrice(p, r.vi))}`, pri: true, run: () => { addLine(r.pid, r.vi, st.shop, "here"); APO.toast("Routine complétée", `${p.brand} ${p.name} ajouté au ticket.`, "face"); APO.log(`Diagnostic de peau : routine proposée à ${c.name} (${p.range})`, "info"); } }] }]; } },
    { plugin: "lor.connect", id: "lor-pack", label: "Promotion du pack L'Oréal en caisse", run: (st) => (st.basket.some((l) => l.pid === "q4") ? [{ tone: "acc", icon: "link", src: "Partenaire L'Oréal · Promotion", title: "Pack de la marque : 2ᵉ Minéral 89 à −40 %", text: "Règle signée par L'Oréal Cosmétique Active, remboursée à 70 % sur preuve de sell-out. Calculée par le moteur de promotions de la caisse.", actions: st.basket.filter((l) => l.pid === "q4").reduce((a, l) => a + l.qty, 0) % 2 ? [{ label: "Ajouter un 2ᵉ Minéral 89", run: () => addLine("q4", 0, st.shop, "here") }] : null }] : []) },
    { plugin: "core.catalogue", id: "kit", label: "Coffret : composants et ticket cadeau", run: (st) => st.basket.filter((l) => pp(l.pid).kit).map((l) => ({ tone: "info", icon: "gift", src: "Catalogue · Coffret", title: `${pp(l.pid).name} : 3 composants`, text: "Crème mains 30 ml, baume lèvres 15 g, gel douche 100 ml. Stock suivi par composant, emballage cadeau offert.", actions: [{ label: "Ticket cadeau sans prix", run: () => APO.toast("Ticket cadeau préparé", "Imprimé avec le ticket · échange 15 jours dans les 4 boutiques.", "gift") }] })) },
    { plugin: "core.stock", id: "cross-shop", label: "Vente sur le stock d'une autre boutique", run: (st) => st.basket.filter((l) => l.mode !== "here").map((l) => { const p = pp(l.pid);
      return { tone: "info", icon: "truck", src: "Stock multi-boutiques", title: l.mode === "collect" ? `Retrait à ${shop(l.from).name}` : `Transfert ${shop(l.from).short} → ${shop(st.shop).short}`, text: l.mode === "collect" ? `${p.range} ${vName(p, l.vi)} réservé 48 h, payé ici. La boutique de retrait reçoit la préparation.` : `${p.range} ${vName(p, l.vi)} arrive par la navette de demain. SMS à la cliente à réception.` }; }) },
    { plugin: "ma.consumer", id: "price-display", label: "Affichage du prix de référence", run: (st) => (promoLines(st, APO.get()).length ? [{ tone: "info", icon: "shield", src: "Pack Maroc · Loi 31-08", title: "Prix de référence et remise imprimés sur le ticket", text: "Obligation d'affichage du prix initial barré en rayon. Mentions en arabe ajoutées automatiquement." }] : []) },
    { plugin: "core.sales", id: "offline", label: "Vente hors ligne", run: (st) => (APO.get().offline && st.basket.length ? [{ tone: "warn", icon: "wifi", src: "Caisse · Hors ligne", title: `Vente hors ligne : numéro définitif de la série ${ORG.terminal}`, text: "Promotions et points calculés localement. Les autres boutiques verront le stock et les points après synchronisation." }] : []) },
  ];

  /* ---------------- commands for the palette ---------------- */
  const stockTab = (t) => { APO.setV({ stockTab: t }); APO.go("pstock"); };
  APO.commands.para = [
    { plugin: "core.sales", id: "sale.new", label: "Nouvelle vente", icon: "scan", run: () => APO.go("pcounter") },
    { plugin: "core.sales", id: "sale.return", label: "Retour ou échange d'un article", icon: "refresh", run: () => { APO.setV({ returnOpen: true }); APO.go("pcounter"); } },
    { plugin: "core.sales", id: "sale.park", label: "Mettre le ticket en attente", icon: "clock", run: () => { APO.go("pcounter"); parkTicket(); } },
    { plugin: "core.sales", id: "till.close", label: "Clôturer la caisse (Z)", icon: "lock", run: () => APO.go("cloture") },
    { plugin: "core.stock", id: "transfer.new", label: "Nouveau transfert entre boutiques", icon: "truck", run: () => stockTab("tr") },
    { plugin: "core.stock", id: "inventory.count", label: "Lancer un inventaire tournant", icon: "box", run: () => stockTab("inv") },
    { plugin: "expiry.para", id: "expiry.review", label: "Lots à démarquer (fin de saison)", icon: "clock", run: () => stockTab("exp") },
    { plugin: "core.purchasing", id: "po.new", label: "Commander chez un distributeur marque", icon: "send", run: () => APO.go("ppurch") },
    { plugin: "core.purchasing", id: "po.receive", label: "Réceptionner la livraison L'Oréal (BL-LOR-55812)", icon: "truck", run: () => APO.go("ppurch") },
    { plugin: "chain.hq", id: "hq.price", label: "Changer le prix d'une gamme (siège)", icon: "building", run: () => APO.go("hq") },
    { plugin: "promo.engine", id: "promo.new", label: "Créer une promotion", icon: "tag", run: () => APO.go("promos") },
    { plugin: "promo.engine", id: "promo.claims", label: "Réclamer les avoirs marques", icon: "receipt", run: () => APO.go("promos") },
    { plugin: "loyalty", id: "loyalty.birthday", label: "Envoyer les offres anniversaire (opt-in)", icon: "star", run: () => { APO.toast("4 offres anniversaire envoyées", "Clientes opt-in uniquement · −15 % valable 7 jours.", "star"); APO.log("Fidélité : 4 offres anniversaire envoyées (opt-in)", "ok"); } },
    { plugin: "social", id: "inbox.open", label: "Répondre aux messages WhatsApp", icon: "msg", run: () => APO.go("inbox") },
    { plugin: "promoters", id: "promoter.checkin", label: "Pointer l'arrivée d'une animatrice", icon: "badge", run: () => { APO.setV((c) => ({ promoterIn: { ...c.promoterIn, 0: APO.now() } })); APO.toast("Hind (La Roche-Posay) pointée", "Casablanca · Maârif · ventes attribuées jusqu'au départ.", "badge"); APO.log("Animatrice Hind (La Roche-Posay) pointée à Maârif", "info"); } },
    { plugin: "sellout", id: "sellout.send", label: "Envoyer le rapport sell-out aux marques", icon: "chart", run: () => { APO.setV({ selloutSent: true }); APO.toast("Rapports sell-out envoyés", "7 marques · agrégats par EAN et boutique, aucune donnée cliente.", "chart"); APO.log("Sell-out : rapports novembre envoyés à 7 marques", "ok"); } },
    { plugin: "ecom", id: "ecom.sync", label: "Synchroniser l'e-shop et Jumia", icon: "refresh", run: () => { APO.toast("Stock synchronisé", "E-shop et Jumia · 14 variantes publiées · 0 médicament.", "refresh"); APO.log("E-commerce : stock synchronisé (e-shop, Jumia)", "ok"); } },
    { plugin: "skin-diag", id: "skin.start", label: "Démarrer un diagnostic de peau", icon: "face", run: () => APO.toast("Diagnostic DermaLab ouvert", "7 questions · la routine apparaîtra en carte conseil à la caisse.", "face") },
    { plugin: "giftcards", id: "gift.new", label: "Émettre une carte cadeau", icon: "gift", run: () => APO.go("giftcards") },
    { plugin: "lor.connect", id: "lor.pack", label: "Voir le pack promo L'Oréal", icon: "link", run: () => APO.go("promos") },
    { plugin: "agent", id: "agent.plan", label: "Préparer le plan promo du week-end", icon: "bot", run: () => APO.go("agent") },
    { plugin: "ma.conformity", id: "verify", label: "Vérifier la chaîne d'intégrité", icon: "shield", run: () => APO.go("conformity") },
  ];

  APO.homeTiles.para = [
    { plugin: "promo.engine", label: "Promotions actives" }, { plugin: "loyalty", label: "Fidélité" }, { plugin: "social", label: "Messages à traiter" }, { plugin: "ecom", label: "Commandes en ligne" }, { plugin: "sellout", label: "Sell-out marques" }, { plugin: "skin-diag", label: "Diagnostics de peau" }, { plugin: "giftcards", label: "Cartes cadeaux" }, { plugin: "expiry.para", label: "Lots à démarquer" }, { plugin: "agent", label: "Brouillons à valider" },
  ];

  APO.agentPrompts = APO.agentPrompts || {};
  APO.agentPrompts.para = [
    { title: "Plan promo du week-end", skill: "Plan promo", tools: ["Ventes par marque", "Règles de promotion", "Planning animatrices"], kind: "promo", cost: "0,21 DH", summary: "Rim (Nuxe) anime Marrakech samedi et Mustela recule de 9 % sur le mois. Deux règles proposées, financées en partie par les marques (accords en cours). Les médicaments restent exclus d'office.",
      lines: [
        { label: "Nuxe Huile Prodigieuse : −15 % ce week-end", why: "Animatrice présente samedi · financement Nuxe 50 % · 14 → 16/11", amount: "−15 %", promo: { name: "Huile Prodigieuse −15 %", rule: "−15 %", type: "pct", pct: 15, pids: ["q5"], scope: "Nuxe · Huile Prodigieuse", brand: 50, from: "14/11", until: "16/11", excl: false, prio: 4, dist: "nuxe" } },
        { label: "Mustela Hydra Bébé : 2ᵉ à −30 %", why: "Relance de la gamme bébé · financement Mustela 60 % · jusqu'au 30/11", amount: "−30 %", promo: { name: "Hydra Bébé : 2ᵉ à −30 %", rule: "2e article −30 %", type: "nth", n: 2, pct: 30, pids: ["q6"], scope: "Mustela · Bébé", brand: 60, from: "14/11", until: "30/11", excl: false, prio: 4, dist: "multi" } },
      ] },
    { title: "Expliquer la marge de Rabat", skill: "Analyse de marge", tools: ["Ventes par boutique", "Utilisations des promos"], cost: "0,05 DH", summary: "Rabat · Agdal affiche 21,9 % de marge contre 24,6 % pour la chaîne. 70 % de l'écart vient de la promo Anthelios (part boutique 30 %) et des 3 pour 2 Sensibio plus utilisés à Agdal. Le reste : 2 transferts urgents payés en coursier. Aucune donnée cliente lue.", lines: [] },
  ];

  APO.onApprove.para = (task, lines) => {
    if (task.kind === "restock") {
      const tr = lines.filter((l) => l.type === "transfer"); const po = lines.filter((l) => l.type === "po");
      APO.setV((c) => { const transfers = c.transfers.slice(); tr.forEach((l) => transfers.unshift(newTransfer({ transfers }, l.pid, l.vi, l.qty, l.from, l.to, "Plan de réassort validé"))); return { transfers, pos: [...po.map((l, i) => ({ id: "BC-MAA-03" + (14 + i + c.pos.length - 3), dist: l.dist, lines: 1, total: l.total, st: 1, t: TODAY, note: "Plan assistant validé" })), ...c.pos] }; });
      tr.forEach((l) => APO.log(`Transfert demandé : ${pp(l.pid).range} ${vName(pp(l.pid), l.vi)} × ${l.qty} · ${shop(l.from).short} → ${shop(l.to).short}`, "info"));
      po.forEach((l) => APO.log(`Bon de commande envoyé à ${DIST.find((d) => d.id === l.dist).name} · ${APO.dh(l.total)}`, "ok"));
    }
    if (task.kind === "promo") {
      APO.setV((c) => ({ promos: [...lines.map((l, i) => ({ id: "pr" + (c.promos.length + 1 + i), active: true, uses: 0, ...l.promo })), ...c.promos] }));
      lines.forEach((l) => APO.log(`Promotion publiée aux 4 boutiques : ${l.promo.name}`, "ok"));
    }
  };

  /* ---------------- HOME ---------------- */
  const shopSalesToday = (st, id) => { const b = BASE[id]; const live = st.sales.filter((x) => !x.seed && x.shop === id).reduce((a, x) => a + x.total, 0); return b.cash + b.card + b.wallet + live; };
  const shrinkPct = (st, id) => SHRINK_BASE[id] + ((st.shrink[id] || 0) / MONTH_SALES[id]) * 100;
  APO.screens["para:home"] = function Home() {
    const s = APO.use(); const st = s.para; const inst = (id) => APO.installed(s, id);
    const byShop = Object.fromEntries(SHOPS.map((x) => [x.id, shopSalesToday(st, x.id)]));
    const ca = Object.values(byShop).reduce((a, b) => a + b, 0); const n = Object.values(BASE).reduce((a, b) => a + b.tickets, 0) + st.sales.filter((x) => !x.seed).length;
    const max = Math.max(...Object.values(byShop));
    const waiting = st.tasks.filter((t) => t.state === "approval").length;
    const unread = D.inbox.filter((m) => !st.read[m.id]).reduce((a, m) => a + m.unread, 0);
    const active = rulesOf(st, s).filter((p) => p.active);
    const lotsSoon = LOTS.filter((l) => l.months < 9 && !st.markdowns[l.id]);
    const tiles = [
      inst("promo.engine") && { plugin: "promo.engine", icon: "tag", label: "Promotions actives", value: String(active.length), sub: `${APO.int(active.reduce((a, p) => a + p.uses, 0))} utilisations · financées en partie par les marques`, go: "promos" },
      inst("loyalty") && { plugin: "loyalty", icon: "star", label: "Fidélité", value: "1 842 membres", sub: "Salma L. (Gold) : anniversaire jeudi", go: "clients" },
      inst("social") && { plugin: "social", icon: "msg", label: "Messages à traiter", value: String(unread), sub: "WhatsApp et Instagram · 1 réservation", go: "inbox", tone: unread ? "warn" : "ok" },
      inst("ecom") && { plugin: "ecom", icon: "globe", label: "Commandes en ligne", value: String(st.web.filter((w) => w.st < 2).length), sub: "E-shop et Jumia · même stock", go: "channels" },
      inst("sellout") && { plugin: "sellout", icon: "chart", label: "Sell-out marques", value: st.selloutSent ? "Envoyé" : "Prêt", sub: "Rapport novembre · 7 marques", go: "brands", tone: st.selloutSent ? "ok" : "" },
      inst("skin-diag") && { plugin: "skin-diag", icon: "face", label: "Diagnostics de peau", value: "9", sub: "aujourd'hui · panier moyen +46 DH", go: "pcounter", tone: "ok" },
      inst("giftcards") && { plugin: "giftcards", icon: "gift", label: "Cartes cadeaux", value: APO.dh(st.gift.reduce((a, g) => a + g.balance, 0)), sub: `encours · ${st.gift.filter((g) => g.balance > 0).length} cartes actives`, go: "giftcards" },
      inst("expiry.para") && { plugin: "expiry.para", icon: "clock", label: "Lots à démarquer", value: String(lotsSoon.length), sub: "Anthelios · date limite sous 9 mois", go: "pstock", tab: "exp", tone: lotsSoon.length ? "warn" : "ok" },
      inst("agent") && { plugin: "agent", icon: "bot", label: "Brouillons à valider", value: String(waiting), sub: "L'assistant ne valide jamais seul", go: "agent" },
    ].filter(Boolean);
    return html`<div>
      <${APO.PageH} title="Bonjour Nadia" sub=${"Vendredi 13 novembre · " + ORG.name + " · " + ORG.city}>
        <button className="btn" onClick=${() => APO.set({ palette: true })}><${Icon} n="search" s=${15} />⌘K</button><button className="btn pri" onClick=${() => APO.go("pcounter")}><${Icon} n="scan" s=${15} />Ouvrir la caisse</button></${APO.PageH}>
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="CA du jour · 4 boutiques" value=${APO.dh(ca)} delta="+12,6 % vs vendredi dernier" tone="up" />
        <${APO.Kpi} label="Panier moyen" value=${APO.dh(ca / n)} delta=${n + " tickets · 1,9 article/ticket"} />
        <${APO.Kpi} label="Taux de fidélité" value="62 %" delta="tickets avec carte · +4 pts sur 30 j" tone="up" />
        <${APO.Kpi} label="Marge brute (HT)" value="24,6 %" delta="−0,8 pt (promos du mois)" tone="down" />
      </div>
      <div className="grid g3" style=${{ marginBottom: 16 }}>${tiles.map((t) => { const fresh = APO.isNew(s, t.plugin); return html`<div key=${t.label} className=${"card kpi" + (fresh ? " fresh" : "")} style=${{ cursor: "pointer", ...(fresh ? { borderColor: "var(--accent)" } : null) }} onClick=${() => { if (t.tab) APO.setV({ stockTab: t.tab }); APO.go(t.go); }}><span className="row"><${Icon} n=${t.icon} s=${15} />${t.label}${fresh ? html`<${Badge} tone="acc">Nouveau</${Badge}>` : html`<${Badge} mono>plugin</${Badge}>`}</span><b>${t.value}</b><em className=${t.tone === "warn" ? "down" : t.tone === "ok" ? "up" : "muted"}>${t.sub}</em></div>`; })}</div>
      <div className="grid g2">
        <div className="col">
          <${Card} title="CA par boutique" sub="aujourd'hui · DH TTC" right=${html`<${Badge} tone="acc">Siège</${Badge}>`}>
            <div className="hbars">${SHOPS.map((x) => html`<div key=${x.id} className="hb"><span>${x.name}${st.closed[x.id] ? " · Z signé" : ""}</span><div><i style=${{ width: (byShop[x.id] / max) * 100 + "%" }}></i></div><span className="mono r" style=${{ textAlign: "right" }}>${APO.int(Math.round(byShop[x.id]))}</span></div>`)}</div>
          </${Card}>
          <${Card} title="Démarque inconnue par boutique" sub="vol, casse, testeurs non déclarés · % du CA du mois" right=${html`<button className="btn sm ghost" onClick=${() => { APO.setV({ stockTab: "inv" }); APO.go("pstock"); }}>Inventaire</button>`}>
            <div className="hbars">${SHOPS.map((x) => { const v = shrinkPct(st, x.id); return html`<div key=${x.id} className="hb"><span>${x.name}</span><div><i style=${{ width: Math.min(100, (v / 1) * 100) + "%", background: v >= 0.6 ? "var(--warn)" : "" }}></i></div><span className="mono" style=${{ textAlign: "right", color: v >= 0.6 ? "var(--warn)" : "" }}>${APO.n2(v)} %</span></div>`; })}</div>
            <p className="small faint" style=${{ marginTop: 8 }}>Objectif chaîne : moins de 0,50 %. Mis à jour à chaque inventaire tournant validé.</p>
          </${Card}>
          <${Card} title="Ventes chaîne · 7 jours" sub="DH TTC" right=${html`<${Badge} tone="ok">+9 %</${Badge}>`}><${APO.Spark} data=${[...D.paraSales7.slice(0, 6).map((v) => Math.round(v * 1.18)), ca]} /><div className="row small faint" style=${{ justifyContent: "space-between", marginTop: 4 }}>${["sam", "dim", "lun", "mar", "mer", "jeu", "auj."].map((d) => html`<span key=${d}>${d}</span>`)}</div></${Card}>
        </div>
        <div className="col">
          <${Card} title="File d'exceptions" sub="faits acceptés, à revoir" right=${html`<${Badge} tone=${st.exceptions.length ? "warn" : "ok"}>${st.exceptions.length}</${Badge}>`} pad=${false}>
            ${st.exceptions.length ? html`<table className="tbl"><tbody>${st.exceptions.map((e) => html`<tr key=${e.id}><td className="mono faint" style=${{ width: 54 }}>${e.t}</td><td>${e.text}<div className="faint small mono">${e.ref}</div></td><td className="r"><button className="btn sm" onClick=${() => { APO.setV((c) => ({ exceptions: c.exceptions.filter((x) => x.id !== e.id) })); APO.toast("Exception résolue", e.ref); APO.log("Exception résolue : " + e.ref, "ok"); }}>Résolu</button></td></tr>`)}</tbody></table>` : html`<div className="empty">Rien à revoir.</div>`}</${Card}>
          <${Card} title="Transferts en cours" sub="navette chaîne" pad=${false} right=${html`<button className="btn sm ghost" onClick=${() => { APO.setV({ stockTab: "tr" }); APO.go("pstock"); }}>Tout voir</button>`}><table className="tbl"><tbody>${st.transfers.filter((t) => t.st < 3).slice(0, 3).map((t) => html`<tr key=${t.id}><td><b>${pp(t.pid).range} · ${vName(pp(t.pid), t.vi)}</b><div className="faint small mono">${t.id} · ${shop(t.from).short} → ${shop(t.to).short}</div></td><td style=${{ width: "52%" }}><${Steps} steps=${TR_STEPS} at=${t.st} /></td></tr>`)}</tbody></table></${Card}>
          <${APO.Events} limit=${7} />
        </div></div></div>`;
  };

  /* ---------------- COUNTER ---------------- */
  function parkTicket() {
    const s = APO.get(); const st = s.para;
    if (!st.basket.length) { APO.toast("Ticket vide", "Rien à mettre en attente."); return; }
    const T = totals(s); const n = st.basket.reduce((a, l) => a + l.qty, 0); const c = custOf(st);
    APO.setV((x) => ({ parked: [...x.parked, { id: APO.uid(), t: APO.now(), basket: x.basket, customer: x.customer, redeem: x.redeem, credit: x.credit, total: T.total, n, who: c ? c.name : null }], basket: [], customer: null, redeem: 0, credit: null, pay: "cash", split: null }));
    APO.toast("Ticket mis en attente", `${n} article(s) · ${APO.dh(T.total)}${c ? " · " + c.name : ""} · la caisse est libre pour la cliente suivante.`, "clock");
    APO.log(`Ticket mis en attente · ${n} article(s) · ${APO.dh(T.total)}`, "info");
  }
  function restoreTicket(id) {
    const st = P(); const k = st.parked.find((x) => x.id === id); if (!k) return;
    if (st.basket.length) parkTicket();
    APO.setV((x) => ({ parked: x.parked.filter((y) => y.id !== id), basket: k.basket, customer: k.customer, redeem: k.redeem, credit: k.credit }));
    APO.toast("Ticket repris", `${k.n} article(s)${k.who ? " · " + k.who : ""}`, "refresh");
  }

  APO.screens["para:pcounter"] = function Counter() {
    const s = APO.use(); const st = s.para; const [q, setQ] = useState(""); const [pickCust, setPickCust] = useState(false);
    const si = sIdx(st.shop); const promoOn = APO.installed(s, "promo.engine"); const promOn = APO.installed(s, "promoters"); const giftOn = APO.installed(s, "giftcards");
    const results = PP.filter((p) => !q || (p.brand + p.range + p.name + p.ean).toLowerCase().includes(q.toLowerCase()));
    const click = (p) => {
      if (p.banned && st.quarantine) { APO.toast("Bloqué par le Pack Maroc", "Produit en quarantaine dans les 4 boutiques et au dépôt.", "alert"); return; }
      if (p.variants.length > 1 || st.stock[p.id][0][si] <= 0) APO.setV({ picker: p.id }); else addLine(p.id, 0, st.shop, "here");
      setQ("");
    };
    const setQty = (key, d) => APO.setV((c) => ({ basket: c.basket.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0) }));
    const cards = APO.cards(s);
    const veto = cards.some((c) => c.tone === "veto");
    const cust = custOf(st); const T = totals(s);
    const promoFor = (pid) => promoOn && rulesOf(st, s).find((r) => r.active && r.pids.includes(pid) && r.type !== "threshold");
    const pays = [["cash", "receipt", "Espèces", true], ["card", "card", APO.installed(s, "tpe") ? "Carte · TPE" : "Carte", true], ["wallet", "qr", "Wallet QR", APO.installed(s, "tpe")], ["split", "grid", giftOn ? "Mixte · carte cadeau" : "Paiement mixte", true]];
    // "Vendu par": staff on shift + promoters checked in at this shop (promoters plugin)
    const here = shop(st.shop);
    const promHere = promOn ? D.promoters.map((p, i) => ({ p, i })).filter((x) => x.p.shop === here.short && st.promoterIn[x.i] && !st.promoterOut[x.i]) : [];
    const sellers = [...STAFF.map((u) => ({ id: u.id, label: u.name, sub: u.role })), ...promHere.map((x) => ({ id: "p" + x.i, label: x.p.name, sub: "animatrice · présente depuis " + st.promoterIn[x.i], prom: true }))];
    const seller = st.seller && st.seller.startsWith("p") && !promHere.some((x) => "p" + x.i === st.seller) ? "u2" : st.seller;
    const tds = tenders(st, T.total); const sp = st.split || {};
    const gc = giftOn && sp.code ? st.gift.find((g) => g.code === sp.code) : null;
    const splitErr = st.pay !== "split" ? null : (+sp.gift || 0) > (gc ? gc.balance : 0) + 0.001 ? "Montant supérieur au solde de la carte cadeau." : (+sp.gift || 0) + (+sp.card || 0) > T.total + 0.001 ? "La somme dépasse le total du ticket." : null;
    const startSplit = () => { const g = giftOn && (st.gift.find((x) => x.balance > 0 && x.code.startsWith("GC")) || st.gift.find((x) => x.balance > 0)); APO.setV({ pay: "split", split: { code: g ? g.code : "", gift: g ? Math.min(g.balance, Math.round(T.total * 0.5)) : 0, card: g ? Math.round((T.total - Math.min(g.balance, Math.round(T.total * 0.5))) * 0.6) : Math.round(T.total * 0.6) } }); };
    const setSplit = (patch) => APO.setV((c) => ({ split: { ...(c.split || {}), ...patch } }));
    return html`<div className="pos">
      <section>
        <div className="ph">
          <div className="scan"><${Icon} n="scan" /><input id="pcounter-search" autoFocus placeholder="Scanner un EAN ou chercher (marque, gamme)" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && results[0] && click(results[0])} /><kbd className="faint mono small">F2</kbd></div>
          <div className="row small faint"><span>${results.length} produits · ${here.name}</span><span className="spacer"></span><span>Prix TTC · TVA 20 % incluse</span></div>
        </div>
        <div className="scroll">${results.map((p) => { const hq = st.stock[p.id].reduce((a, v) => a + v[si], 0); const pr = promoFor(p.id); return html`<div key=${p.id} className="prod" onClick=${() => click(p)}>
          <div className="row" style=${{ flexWrap: "nowrap", gap: 10, minWidth: 0 }}><${Thumb} p=${p} /><div style=${{ minWidth: 0 }}><b>${title(p)}</b><div className="meta">${p.brand} · ${p.variants.length > 1 ? p.variants.length + (p.shades ? " teintes" : " formats") : p.variants[0].v}</div></div></div>
          <div className="price">${APO.n2(vPrice(p, 0))}</div>
          <div className="flags">${p.banned ? html`<${Badge} tone="bad">${st.quarantine ? "Quarantaine" : "Interdit · AMMPS"}</${Badge}>` : null}${pr && html`<${Badge} tone="ok">${pr.name.split(":").pop().trim()}</${Badge}>`}${p.shades && html`<span className="row" style=${{ gap: 3 }}>${p.variants.map((v) => html`<${Swatch} key=${v.v} c=${v.sw} s=${11} />`)}</span>`}${p.kit && html`<${Badge} tone="acc">Coffret</${Badge}>`}${hq <= 0 ? html`<${Badge} tone="bad">Rupture ici</${Badge}>` : hq < 6 ? html`<${Badge} tone="warn">Stock ${hq}</${Badge}>` : html`<${Badge} tone="ok">Stock ${hq}</${Badge}>`}</div></div>`; })}</div>
      </section>
      <section>
        <div className="ph">
          <div className="row"><h3 style=${{ fontSize: 16 }}>Ticket en cours</h3><span className="spacer"></span>${s.offline && html`<${Badge} tone="warn">Hors ligne · série ${ORG.terminal}</${Badge}>`}<${Badge} mono>N° ${ORG.site}-${ORG.terminal}-2026-${String(st.series + 1).padStart(6, "0")}</${Badge}></div>
          <div className="row" style=${{ gap: 6 }}>
            <button id="btn-return" className="btn sm" onClick=${() => APO.setV({ returnOpen: true })}><${Icon} n="refresh" s=${13} />Retour / échange</button>
            <button id="btn-park" className="btn sm" disabled=${!st.basket.length} onClick=${parkTicket}><${Icon} n="clock" s=${13} />Mettre en attente</button>
            ${st.parked.map((k) => html`<button key=${k.id} className="btn sm ghost" style=${{ borderColor: "var(--warn)" }} onClick=${() => restoreTicket(k.id)} title="Reprendre ce ticket"><${Icon} n="clock" s=${13} />${k.t} · ${k.n} art. · ${APO.n2(k.total)}${k.who ? " · " + k.who.split(" ")[0] : ""}</button>`)}
          </div>
          ${promOn && html`<div className="row small" style=${{ gap: 6 }}><span className="faint">Vendu par</span>${sellers.map((x) => html`<button key=${x.id} className=${"btn sm " + (seller === x.id ? "pri" : "ghost")} title=${x.sub} onClick=${() => APO.setV({ seller: x.id })}>${x.prom && html`<${Icon} n="badge" s=${13} />`}${x.label}</button>`)}${!promHere.length && html`<span className="faint">· aucune animatrice pointée ici</span>`}</div>`}
        </div>
        <div className="scroll">
          ${!st.basket.length ? html`<div className="empty" style=${{ paddingTop: 50 }}><${Icon} n="bag" s=${32} /><p style=${{ marginTop: 10 }}>Scannez ou cliquez un produit.</p><p className="small" style=${{ marginTop: 6 }}>Essayez : 2 Anthelios (2ᵉ à −50 %), 3 Sensibio (3 pour 2), une teinte Couvrance, le coffret Nuxe, ou « Glow 7 jours » (interdit). Associez Salma Lahlou pour la fidélité.</p>${st.credit && html`<p className="small" style=${{ marginTop: 8, color: "var(--accent)" }}>Avoir ${st.credit.n} de ${APO.dh(st.credit.amount)} prêt à être utilisé pour l'échange.</p>`}</div>` :
          st.basket.map((l) => { const p = pp(l.pid); const v = p.variants[l.vi]; return html`<div key=${l.key} className="line"><div className="row" style=${{ flexWrap: "nowrap", gap: 10 }}><${Thumb} p=${p} s=${32} /><div style=${{ minWidth: 0 }}><b>${title(p)}</b><div className="small faint">${v.sw && html`<${Swatch} c=${v.sw} s=${10} />`}${v.v} · ${p.brand}</div></div></div><div className="qty"><button onClick=${() => setQty(l.key, -1)} aria-label="moins">−</button><span>${l.qty}</span><button onClick=${() => setQty(l.key, 1)} aria-label="plus">+</button></div><div className="amount">${APO.n2(vPrice(p, l.vi) * l.qty)}</div>
            <div className="meta">${APO.n2(vPrice(p, l.vi))} l'unité${l.mode === "collect" ? " · retrait " + shop(l.from).short : l.mode === "transfer" ? " · transfert depuis " + shop(l.from).short : ""}${p.banned ? " · " : ""}${p.banned && html`<${Badge} tone="bad">Bloqué</${Badge}>`}</div></div>`; })}
          ${T.promos.map((x) => html`<div key=${x.id} className="line" style=${{ color: "var(--ok)" }}><div><b style=${{ fontWeight: 500 }}><${Icon} n="tag" s=${13} /> ${x.label}</b></div><span></span><div className="amount">− ${APO.n2(x.amount)}</div><div className="meta">${x.partner ? "Pack L'Oréal" : "Promotion"} · ${fund(x.brand)}</div></div>`)}
          ${T.redeem > 0 && html`<div className="line" style=${{ color: "var(--ok)" }}><div><b style=${{ fontWeight: 500 }}><${Icon} n="star" s=${13} /> Remise fidélité · 500 pts</b></div><span></span><div className="amount">− ${APO.n2(T.redeem)}</div><div className="meta">Fidélité · financé boutique</div></div>`}
          ${st.credit && st.basket.length > 0 && html`<div className="line" style=${{ color: "var(--accent)" }}><div><b style=${{ fontWeight: 500 }}><${Icon} n="refresh" s=${13} /> Échange · avoir ${st.credit.n}</b></div><span></span><div className="amount">− ${APO.n2(T.credit)}</div><div className="meta">${st.credit.amount > T.credit + 0.001 ? `reste ${APO.n2(st.credit.amount - T.credit)} DH : converti en bon d'achat à l'encaissement` : "avoir entièrement utilisé"}</div></div>`}
          ${cards.length > 0 && html`<div className="col" style=${{ marginTop: 14 }}><div className="row small faint"><${Icon} n="puzzle" s=${14} />Cartes fournies par les plugins installés</div>${cards.map((c, i) => html`<${APO.Adv} key=${i} c=${c} />`)}</div>`}
        </div>
      </section>
      <section>
        <div className="ph">
          ${cust ? html`<div className="cust" onClick=${() => setPickCust(!pickCust)}><div className="avatar">${cust.initials}</div><div style=${{ minWidth: 0 }}><b>${cust.name}</b><div className="small faint">${cust.tier} · ${APO.int(st.points[cust.id])} pts</div></div><button className="btn ghost sm" style=${{ marginLeft: "auto" }} onClick=${(e) => { e.stopPropagation(); APO.setV({ customer: null, redeem: 0 }); }}>Retirer</button></div>`
            : html`<button className="cust" onClick=${() => setPickCust(!pickCust)} style=${{ width: "100%" }}><div className="avatar"><${Icon} n="star" s=${16} /></div><div style=${{ textAlign: "left" }}><b>Cliente de passage</b><div className="small faint">Scanner la carte fidélité ou chercher une cliente</div></div></button>`}
          ${pickCust && html`<div className="card" style=${{ padding: 6 }}>${D.paraCustomers.map((c) => html`<div key=${c.id} className="cust" style=${{ marginBottom: 4, background: "none", border: 0 }} onClick=${() => { APO.setV({ customer: c.id, redeem: 0 }); setPickCust(false); APO.toast("Carte fidélité associée", `${c.name} · ${c.tier} · ${APO.int(st.points[c.id])} pts`, "star"); }}><div className="avatar">${c.initials}</div><div style=${{ minWidth: 0 }}><b>${c.name}</b><div className="small faint">${c.skin} · ${APO.int(st.points[c.id])} pts · ${c.last}</div></div><span style=${{ marginLeft: "auto" }}><${Badge} tone=${tierTone(c.tier)}>${c.tier}</${Badge}></span></div>`)}</div>`}
        </div>
        <div className="scroll">
          <div className="totals">
            <div><span className="muted">Sous-total</span><span className="mono">${APO.dh(T.sub)}</span></div>
            ${T.disc > 0 && html`<div><span className="muted">Promotions (${T.promos.length})</span><span className="mono" style=${{ color: "var(--ok)" }}>− ${APO.dh(T.disc)}</span></div>`}
            ${T.redeem > 0 && html`<div><span className="muted">Fidélité</span><span className="mono" style=${{ color: "var(--ok)" }}>− ${APO.dh(T.redeem)}</span></div>`}
            ${T.credit > 0 && html`<div><span className="muted">Avoir (échange)</span><span className="mono" style=${{ color: "var(--accent)" }}>− ${APO.dh(T.credit)}</span></div>`}
            <div><span className="muted">Total HT</span><span className="mono">${APO.dh(T.ht)}</span></div>
            <div><span className="muted">dont TVA 20 %</span><span className="mono">${APO.dh(T.vat)}</span></div>
            ${T.brandFund > 0 && html`<div><span className="faint small">Part financée par les marques</span><span className="mono small faint">${APO.dh(T.brandFund)}</span></div>`}
            <div className="big"><span>Total TTC</span><span className="num">${APO.dh(T.total)}</span></div>
            ${cust && APO.installed(s, "loyalty") && html`<div><span className="muted"><${Icon} n="star" s=${13} /> Points gagnés</span><span className="mono" style=${{ color: "var(--accent)" }}>+ ${T.earn} pts</span></div>`}
          </div>
          <div className="sep"></div>
          <div className="field" style=${{ marginBottom: 8 }}>Mode de paiement</div>
          <div className="pay">${pays.map((p) => html`<button key=${p[0]} className=${st.pay === p[0] ? "on" : ""} disabled=${!p[3]} onClick=${() => (p[0] === "split" ? startSplit() : APO.setV({ pay: p[0], split: null }))}><${Icon} n=${p[1]} s=${18} />${p[2]}</button>`)}</div>
          ${st.pay === "wallet" && html`<div className="adv info" style=${{ marginTop: 10 }}><div className="ic"><${Icon} n="qr" s=${16} /></div><span className="src">Paiement · Wallet</span><b>QR dynamique affiché sur l'écran client</b><p>Montant et référence ticket uniquement transmis à l'acquéreur.</p></div>`}
          ${st.pay === "split" && html`<div className="card" style=${{ marginTop: 10, padding: 10 }}><div className="col" style=${{ gap: 8 }}>
            ${giftOn && html`<div className="row" style=${{ flexWrap: "nowrap", gap: 6 }}><${Icon} n="gift" s=${15} /><select id="split-code" className="input" style=${{ flex: 1, padding: "4px 6px" }} value=${sp.code || ""} onChange=${(e) => setSplit({ code: e.target.value })}><option value="">Carte cadeau…</option>${st.gift.filter((g) => g.balance > 0).map((g) => html`<option key=${g.code} value=${g.code}>${g.code} · solde ${APO.n2(g.balance)}</option>`)}</select><input id="split-gift" type="number" className="input mono" style=${{ width: 90, padding: "4px 6px" }} value=${sp.gift || 0} onInput=${(e) => setSplit({ gift: e.target.value })} /></div>`}
            <div className="row" style=${{ flexWrap: "nowrap", gap: 6 }}><${Icon} n="card" s=${15} /><span style=${{ flex: 1 }}>Carte bancaire</span><input id="split-card" type="number" className="input mono" style=${{ width: 90, padding: "4px 6px" }} value=${sp.card || 0} onInput=${(e) => setSplit({ card: e.target.value })} /></div>
            <div className="row" style=${{ flexWrap: "nowrap", gap: 6 }}><${Icon} n="receipt" s=${15} /><span style=${{ flex: 1 }}>Espèces (reste)</span><b className="mono" style=${{ width: 90, textAlign: "right" }}>${APO.n2((tds.find((t) => t.mode === "cash") || { amount: 0 }).amount)}</b></div>
            ${splitErr ? html`<p className="small" style=${{ color: "var(--bad)" }}>${splitErr}</p>` : html`<p className="small faint">${gc ? `Solde après paiement : ${APO.n2(gc.balance - (+sp.gift || 0))} DH sur ${gc.code}. ` : ""}Chaque moyen est enregistré pour la clôture.</p>`}
          </div></div>`}
          <div className="sep"></div>
          <button id="btn-pay" className="btn pri lg" style=${{ width: "100%", justifyContent: "center" }} disabled=${!st.basket.length || veto || !!splitErr} onClick=${() => finalize(s)}><${Icon} n="check" />Encaisser ${APO.dh(T.total)}</button>
          ${veto && html`<p className="small" style=${{ color: "var(--bad)", marginTop: 8, textAlign: "center" }}>Vente bloquée par le Pack Maroc : seul le code certifié peut bloquer.</p>`}
          <p className="small faint" style=${{ marginTop: 10, textAlign: "center" }}>${s.offline ? "Hors ligne : la vente est un fait définitif, synchronisé au retour du réseau." : `Caisse ${ORG.terminal} · ${here.name}${st.closed[st.shop] ? " · Z du jour déjà signé : nouvelle session" : " · promotions calculées localement"}`}</p>
        </div>
      </section>
      ${st.picker && html`<${Picker} pid=${st.picker} />`}
      ${st.returnOpen && html`<${ReturnModal} />`}
      ${st.receipt && html`<${Receipt} r=${st.receipt} />`}
    </div>`;
  };

  function Picker({ pid }) {
    const s = APO.use(); const st = s.para; const p = pp(pid); const si = sIdx(st.shop);
    const first = p.variants.findIndex((v, i) => st.stock[pid][i][si] > 0);
    const [vi, setVi] = useState(first < 0 ? 0 : first);
    const close = () => APO.setV({ picker: null });
    const row = st.stock[pid][vi]; const here = row[si]; const v = p.variants[vi];
    const add = (from, mode) => {
      if (mode === "transfer") {
        APO.setV((c) => { const t = newTransfer(c, pid, vi, 1, from, c.shop, "Vente comptoir · cliente prévenue à réception", true); APO.log(`Transfert ${t.id} demandé : ${p.range} ${v.v} · ${shop(from).short} → ${shop(c.shop).short}`, "info"); return { transfers: [t, ...c.transfers] }; });
        APO.toast("Transfert demandé", `${p.range} ${v.v} · ${shop(from).short} → ${shop(st.shop).short} · navette de demain`, "truck");
      } else if (mode === "collect") APO.toast("Click & collect", `${p.range} ${v.v} réservé à ${shop(from).name} · 48 h`, "store");
      addLine(pid, vi, from, mode); close();
    };
    return html`<${APO.Modal} onClose=${close}><div className="card-h"><${Thumb} p=${p} s=${36} /><div style=${{ minWidth: 0 }}><h3>${title(p)}</h3><span className="sub">${p.brand} · EAN ${p.ean}</span></div><span className="spacer"></span><button className="iconbtn" onClick=${close} aria-label="Fermer"><${Icon} n="x" /></button></div>
      <div className="card-b col">
        ${p.shades ? html`<div className="col" style=${{ gap: 8 }}><div className="small muted">Teinte · <b style=${{ color: "var(--fg)" }}>${v.v}</b></div><div className="row" style=${{ gap: 14 }}>${p.variants.map((x, i) => html`<button key=${x.v} className=${"swatch" + (i === vi ? " on" : "")} style=${{ background: x.sw, width: 34, height: 34, padding: 0 }} title=${x.v} aria-label=${x.v} onClick=${() => setVi(i)}></button>`)}</div>
            <div className="row small faint" style=${{ gap: 14 }}>${p.variants.map((x, i) => html`<span key=${x.v} style=${{ width: 34, textAlign: "center", color: i === vi ? "var(--fg)" : "" }}>${x.v.split(" ")[0]}</span>`)}</div></div>`
          : html`<div className="col" style=${{ gap: 8 }}><div className="field">Format</div><div className="row">${p.variants.map((x, i) => html`<button key=${x.v} className=${"btn " + (i === vi ? "pri" : "")} onClick=${() => setVi(i)}>${x.v}<span className="mono small" style=${{ opacity: 0.75 }}>${APO.n2(vPrice(p, i))}</span></button>`)}</div></div>`}
        <table className="tbl"><thead><tr><th>Boutique</th><th className="r">Stock</th><th></th></tr></thead><tbody>${LOCS.map((x, i) => html`<tr key=${x.id} style=${i === si ? { background: "var(--accent-soft)" } : null}><td><b>${x.name}</b>${i === si && html` <${Badge} tone="acc">cette caisse</${Badge}>`}</td><td className="r">${stockBadge(row[i])}</td>
          <td className="r">${i !== si && row[i] > 0 ? html`<div className="row" style=${{ justifyContent: "flex-end", gap: 6 }}><button className=${"btn sm " + (here <= 0 ? "pri" : "")} onClick=${() => add(x.id, "transfer")}><${Icon} n="truck" s=${13} />Transfert → ${shop(st.shop).short}</button>${!x.depot && html`<button className="btn sm" onClick=${() => add(x.id, "collect")}><${Icon} n="store" s=${13} />Click & collect</button>`}</div>` : i === si ? html`<span className="faint small">vente immédiate</span>` : html`<span className="faint small">—</span>`}</td></tr>`)}</tbody></table>
        ${here <= 0 && html`<div className="adv warn"><div className="ic"><${Icon} n="alert" s=${16} /></div><span className="src">Stock multi-boutiques</span><b>${v.v} en rupture à ${shop(st.shop).name}</b><p>Encaissez maintenant : transfert par la navette de demain, ou retrait dans la boutique qui a le stock.</p></div>`}
        <div className="row"><span className="mono" style=${{ fontSize: 18, fontWeight: 600 }}>${APO.dh(vPrice(p, vi))}</span><span className="faint small">TTC</span><span className="spacer"></span><button className="btn ghost" onClick=${close}>Annuler</button><button className="btn pri" disabled=${here <= 0} onClick=${() => add(st.shop, "here")}><${Icon} n="plus" s=${15} />Ajouter au ticket</button></div>
      </div></${APO.Modal}>`;
  }

  /* ---------------- RETURNS & EXCHANGES ---------------- */
  const dayNum = (d) => { const [dd, mm] = d.split("/").map(Number); return mm * 30.5 + dd; };
  const ageDays = (d) => Math.round(dayNum(TODAY) - dayNum(d));
  const histTickets = () => { const out = {}; Object.entries(HISTORY).forEach(([cid, rows]) => rows.forEach((h) => { const t = out[h[4]] || (out[h[4]] = { n: h[4], date: h[0], shopShort: h[3], cust: cid, lines: [], pays: [{ mode: "card" }], disc: 0, src: "Historique cliente" }); t.lines.push({ pid: h[5], vi: h[6], qty: h[7], unit: h[2] / h[7] }); })); return Object.values(out); };

  function ReturnModal() {
    const s = APO.use(); const st = s.para; const close = () => APO.setV({ returnOpen: false });
    const [mode, setMode] = useState("ticket"); const [q, setQ] = useState(""); const [sel, setSel] = useState(null); const [qty, setQty] = useState({});
    const [reason, setReason] = useState("Ne convient pas"); const [action, setAction] = useState("exchange"); const [pin, setPin] = useState(""); const [nt, setNt] = useState({ val: "q2:1", qty: 1 });
    const day = st.sales.filter((x) => x.lines && x.shop === st.shop).map((x) => ({ ...x, date: TODAY, shopShort: shop(x.shop).short, src: "Ventes du jour" })).reverse();
    const hist = histTickets();
    const cands = [...day, ...hist.filter((t) => (q ? t.n.toLowerCase().includes(q.toLowerCase()) : st.customer && t.cust === st.customer))].filter((t) => !q || t.n.toLowerCase().includes(q.toLowerCase()));
    const t = sel && [...day, ...hist].find((x) => x.n === sel);
    const old = t && ageDays(t.date) > 15;
    const gross = t ? t.lines.reduce((a, l) => a + l.unit * l.qty, 0) : 0; const ratio = t && gross ? 1 - (t.disc || 0) / gross : 1;
    const left = (i) => t.lines[i].qty - ((st.returnedQty || {})[t.n + ":" + i] || 0);
    let lines = [], amount = 0;
    if (mode === "ticket" && t) { lines = t.lines.map((l, i) => ({ ...l, i, q: Math.min(qty[i] || 0, left(i)) })).filter((l) => l.q > 0); amount = lines.reduce((a, l) => a + l.unit * l.q * ratio, 0); }
    if (mode === "noticket") { const [pid, vi] = nt.val.split(":"); lines = [{ pid, vi: +vi, q: +nt.qty || 0, unit: vPrice(pp(pid), +vi) }]; amount = lines[0].unit * lines[0].q; }
    const refundMode = t && t.pays ? t.pays[0].mode : "cash";
    const acts = [["exchange", "Échange", "avoir appliqué au ticket suivant"], ["voucher", "Bon d'achat", "valable 1 an, 4 boutiques"], ...(mode === "ticket" && !old ? [["refund", "Remboursement", refundMode === "card" ? "recrédit sur la carte bancaire" : "en espèces"]] : [])];
    const act = acts.some((a) => a[0] === action) ? action : "exchange";
    const pinOk = mode === "ticket" || pin === MANAGER_PIN;
    const can = amount > 0 && pinOk;
    const confirm = () => {
      const seq = st.avSeries + 1; const n = termNo("AV", seq); const hash = APO.hash(st.lastHash + n + (-amount).toFixed(2));
      const restock = reason !== "Produit défectueux";
      const custId = mode === "ticket" ? t.cust : st.customer; const c = custId && D.paraCustomers.find((x) => x.id === custId);
      const pts = c ? Math.floor(amount / 10) : 0; const voucher = act === "voucher" ? "BA-" + APO.uid().toUpperCase().slice(0, 4) + "-" + String(seq).padStart(2, "0") : null;
      const rl = lines.map((l) => { const p = pp(l.pid); return { name: title(p).replace(" · ", " "), v: vName(p, l.vi), qty: l.q, amount: l.unit * l.q * (mode === "ticket" ? ratio : 1) }; });
      APO.setV((x) => {
        let stock = x.stock; if (restock) lines.forEach((l) => (stock = stockMove(stock, l.pid, l.vi, x.shop, l.q)));
        const rq = { ...(x.returnedQty || {}) }; if (mode === "ticket") lines.forEach((l) => (rq[t.n + ":" + l.i] = (rq[t.n + ":" + l.i] || 0) + l.q));
        return { avSeries: seq, lastHash: hash, stock, returnedQty: rq, returnOpen: false,
          points: c ? { ...x.points, [c.id]: Math.max(0, x.points[c.id] - pts) } : x.points,
          returns: [...x.returns, { n, t: APO.now(), amount, action: act, mode: act === "refund" ? refundMode : null, shop: x.shop, origin: mode === "ticket" ? t.n : null }],
          credit: act === "exchange" ? { n, amount: (x.credit ? x.credit.amount : 0) + amount } : x.credit,
          gift: voucher ? [{ code: voucher, amount, balance: amount, shop: x.shop, issued: TODAY, buyer: "Bon d'achat · avoir " + n, kind: "Bon d'achat", uses: [] }, ...x.gift] : x.gift,
          receipt: { kind: "credit", n, hash, prev: x.lastHash, origin: mode === "ticket" ? t.n : null, originShop: mode === "ticket" ? t.shopShort : null, lines: rl, amount, vat: amount - amount / 1.2, ht: amount / 1.2, action: act, mode: refundMode, voucher, cust: c ? c.name : null, pts, reason, restock, manager: mode === "noticket", shopName: shop(x.shop).name, offline: s.offline } };
      });
      APO.log(`Avoir ${n} · −${APO.dh(amount)} · ${act === "refund" ? "remboursement " + PAYL[refundMode].toLowerCase() : act === "exchange" ? "échange" : "bon d'achat " + voucher}${mode === "noticket" ? " · sans ticket, accord responsable" : " · ticket " + t.n}`, "warn");
      if (c && pts) APO.log(`Fidélité ${c.name} : −${pts} pts (retour)`, "info");
      if (act === "exchange") APO.toast("Avoir prêt pour l'échange", `${APO.dh(amount)} déduits du prochain ticket. Scannez le produit d'échange.`, "refresh");
    };
    return html`<${APO.Modal} onClose=${close}><div className="card-h"><${Icon} n="refresh" /><h3>Retour / échange</h3><span className="spacer"></span><button className="iconbtn" onClick=${close} aria-label="Fermer"><${Icon} n="x" /></button></div>
      <div className="card-b col">
        <${APO.Tabs} value=${mode} onChange=${(m) => { setMode(m); setSel(null); setQty({}); setAction("exchange"); }} tabs=${[{ id: "ticket", label: "Avec ticket" }, { id: "noticket", label: "Sans ticket" }]} />
        ${mode === "ticket" && html`<div className="col">
          <div className="search" style=${{ cursor: "text" }}><${Icon} n="search" s=${16} /><input id="ret-q" style=${{ border: 0, outline: 0, background: "none", flex: 1 }} placeholder="N° de ticket (ex. 000087 ou AGD-C01-2026-000517)" value=${q} onInput=${(e) => { setQ(e.target.value); setSel(null); }} /></div>
          ${!t && html`<div className="col" style=${{ gap: 6 }}>${cands.length ? cands.map((x) => html`<div key=${x.n} className="task" style=${{ cursor: "pointer" }} onClick=${() => { setSel(x.n); setQty(Object.fromEntries(x.lines.map((l, i) => [i, i === 0 ? 1 : 0]))); }}>
              <div className="h"><b className="mono" style=${{ fontSize: 12.5 }}>${x.n}</b><span className="spacer"></span><${Badge}>${x.src}</${Badge}></div>
              <div className="small muted">${x.date} · ${x.shopShort} · ${x.lines.map((l) => pp(l.pid).range + " " + vName(pp(l.pid), l.vi)).join(", ")}${x.cust ? " · " + D.paraCustomers.find((c) => c.id === x.cust).name : ""}</div></div>`) : html`<p className="small faint">Aucun ticket trouvé. Associez la cliente à la caisse pour voir son historique, ou tapez le numéro imprimé.</p>`}</div>`}
          ${t && html`<div className="col" style=${{ gap: 8 }}>
            <div className="row"><b className="mono">${t.n}</b><${Badge}>${t.date} · ${t.shopShort}</${Badge}>${t.shopShort !== shop(st.shop).short && html`<${Badge} tone="info">Retour inter-boutiques</${Badge}>`}${old ? html`<${Badge} tone="warn">Plus de 15 jours : pas de remboursement</${Badge}>` : html`<${Badge} tone="ok">Dans le délai de 15 jours</${Badge}>`}<span className="spacer"></span><button className="btn sm ghost" onClick=${() => setSel(null)}>Changer</button></div>
            <table className="tbl"><tbody>${t.lines.map((l, i) => { const p = pp(l.pid); const lf = left(i); return html`<tr key=${i}><td><b>${p.range}</b><div className="faint small">${vName(p, l.vi)} · ${APO.n2(l.unit * ratio)} l'unité payée</div></td><td className="r">${lf <= 0 ? html`<${Badge}>Déjà retourné</${Badge}>` : html`<div className="qty" style=${{ justifyContent: "flex-end" }}><button onClick=${() => setQty({ ...qty, [i]: Math.max(0, (qty[i] || 0) - 1) })}>−</button><span>${Math.min(qty[i] || 0, lf)}</span><button onClick=${() => setQty({ ...qty, [i]: Math.min(lf, (qty[i] || 0) + 1) })}>+</button></div>`}</td></tr>`; })}</tbody></table>
          </div>`}
        </div>`}
        ${mode === "noticket" && html`<div className="col">
          <div className="adv warn"><div className="ic"><${Icon} n="lock" s=${16} /></div><span className="src">Règle de la chaîne</span><b>Sans ticket : échange ou bon d'achat uniquement, jamais d'espèces</b><p>Valeur au prix affiché du jour. Accord d'un responsable obligatoire, tracé au journal.</p></div>
          <div className="grid g2" style=${{ gap: 10, gridTemplateColumns: "1fr 90px" }}>
            <label className="field">Produit rapporté<select id="ret-p" className="input" value=${nt.val} onChange=${(e) => setNt({ ...nt, val: e.target.value })}>${variantOptions().map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</select></label>
            <label className="field">Qté<input type="number" min="1" className="input mono" value=${nt.qty} onInput=${(e) => setNt({ ...nt, qty: e.target.value })} /></label>
          </div>
          <label className="field">Code responsable (PIN)<input id="ret-pin" type="password" inputMode="numeric" maxLength="4" className="input mono" placeholder="••••" value=${pin} onInput=${(e) => setPin(e.target.value)} /></label>
          ${pin.length === 4 && !pinOk ? html`<p className="small" style=${{ color: "var(--bad)" }}>Code incorrect.</p>` : pinOk ? html`<p className="small" style=${{ color: "var(--ok)" }}>Accord de Nadia T. (responsable) enregistré.</p>` : html`<p className="small faint">Démo : 1234</p>`}
        </div>`}
        ${(mode === "noticket" || t) && html`<div className="col" style=${{ gap: 8 }}>
          <div className="grid g2" style=${{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label className="field">Motif<select id="ret-reason" className="input" value=${reason} onChange=${(e) => setReason(e.target.value)}>${["Ne convient pas", "Réaction cutanée", "Produit défectueux", "Cadeau en double", "Erreur de teinte"].map((r) => html`<option key=${r}>${r}</option>`)}</select></label>
            <div className="field">Montant de l'avoir<b className="mono" style=${{ fontSize: 18 }}>${APO.dh(amount)}</b></div>
          </div>
          <div className="pay">${acts.map((a) => html`<button key=${a[0]} className=${act === a[0] ? "on" : ""} onClick=${() => setAction(a[0])}><${Icon} n=${a[0] === "refund" ? "receipt" : a[0] === "voucher" ? "gift" : "refresh"} s=${18} />${a[1]}<span className="small faint">${a[2]}</span></button>`)}</div>
          <p className="small faint">${reason === "Produit défectueux" ? "Produit défectueux : non remis en vente, mis de côté pour retour distributeur." : "Produit non ouvert remis en stock vendable à " + shop(st.shop).short + "."} Points fidélité de la vente d'origine retirés. Avoir numéroté dans la série de la caisse ${ORG.terminal}.</p>
        </div>`}
        <div className="row" style=${{ justifyContent: "flex-end" }}><button className="btn ghost" onClick=${close}>Annuler</button><button id="ret-ok" className="btn pri" disabled=${!can} onClick=${confirm}><${Icon} n="check" s=${15} />Émettre l'avoir ${amount > 0 ? APO.dh(amount) : ""}</button></div>
      </div></${APO.Modal}>`;
  }

  function finalize(s) {
    const st = s.para; const T = totals(s); const seq = st.series + 1;
    const n = `${ORG.site}-${ORG.terminal}-2026-${String(seq).padStart(6, "0")}`;
    const hash = APO.hash(st.lastHash + n + T.total.toFixed(2));
    const cust = custOf(st); const redeemPts = T.redeem ? 500 : 0;
    const pays = tenders(st, T.total);
    let stock = { ...st.stock }; let negative = null;
    st.basket.filter((l) => l.mode !== "transfer").forEach((l) => { stock = stockMove(stock, l.pid, l.vi, l.from, -l.qty); if (stock[l.pid][l.vi][sIdx(l.from)] < 0) negative = pp(l.pid).range + " " + vName(pp(l.pid), l.vi); });
    const used = T.promos.map((x) => x.id);
    const lines = st.basket.map((l) => { const p = pp(l.pid); return { name: title(p).replace(" · ", " "), v: vName(p, l.vi), qty: l.qty, amount: vPrice(p, l.vi) * l.qty, mode: l.mode, from: shop(l.from).short }; });
    // promoter attribution: lines of the promoter's brand, net of discounts
    const promOn = APO.installed(s, "promoters"); let attributed = 0; let pi = null;
    if (promOn && st.seller && st.seller.startsWith("p") && st.promoterIn[+st.seller.slice(1)] && !st.promoterOut[+st.seller.slice(1)]) { pi = +st.seller.slice(1); const br = promoterBrand(D.promoters[pi]); const ratio = T.sub ? T.total / T.sub : 0; attributed = st.basket.filter((l) => pp(l.pid).brand === br).reduce((a, l) => a + vPrice(pp(l.pid), l.vi) * l.qty * ratio, 0); }
    const seller = promOn ? (pi != null ? D.promoters[pi].name : STAFF.find((u) => u.id === st.seller) ? sellerName(st) : STAFF[1].name) : null;
    const giftPay = pays.find((p) => p.mode === "gift");
    const leftover = st.credit ? st.credit.amount - T.credit : 0; const leftCode = leftover > 0.009 ? "BA-" + APO.uid().toUpperCase().slice(0, 4) + "-R" : null;
    const receipt = { kind: "sale", n, hash, prev: st.lastHash, lines, promos: T.promos, redeem: T.redeem, credit: T.credit, creditN: st.credit && st.credit.n, leftover, leftCode, sub: T.sub, total: T.total, vat: T.vat, ht: T.ht, pays, cust: cust ? cust.name : null, tier: cust ? cust.tier : null, earn: T.earn, balance: cust ? st.points[cust.id] - redeemPts + T.earn : null, offline: s.offline, shopName: shop(st.shop).name, seller, attributed, giftLeft: giftPay ? st.gift.find((g) => g.code === giftPay.code).balance - giftPay.amount : null };
    APO.setV((c) => ({ series: seq, lastHash: hash, stock, basket: [], customer: null, redeem: 0, credit: null, pay: "cash", split: null, receipt,
      sales: [...c.sales, { n, t: APO.now(), shop: c.shop, cust: cust ? cust.id : null, earn: T.earn, total: T.total, pays, seller: c.seller, disc: T.disc + T.redeem + T.credit, lines: c.basket.map((l) => ({ pid: l.pid, vi: l.vi, qty: l.qty, unit: vPrice(pp(l.pid), l.vi) })), brandFund: T.promos.map((x) => ({ dist: x.dist, amount: (x.amount * x.brand) / 100 })) }],
      promos: c.promos.map((p) => (used.includes(p.id) ? { ...p, uses: p.uses + 1 } : p)), points: cust ? { ...c.points, [cust.id]: c.points[cust.id] - redeemPts + T.earn } : c.points,
      promoterSales: pi != null && attributed > 0 ? { ...c.promoterSales, [pi]: (c.promoterSales[pi] || 0) + attributed } : c.promoterSales,
      gift: (() => { let g = c.gift; if (giftPay) g = g.map((x) => (x.code === giftPay.code ? { ...x, balance: x.balance - giftPay.amount, uses: [...x.uses, { t: TODAY, shop: shop(c.shop).short, amount: giftPay.amount, ticket: n }] } : x)); if (leftCode) g = [{ code: leftCode, amount: leftover, balance: leftover, shop: c.shop, issued: TODAY, buyer: "Reliquat d'échange", kind: "Bon d'achat", uses: [] }, ...g]; return g; })() }));
    if (s.offline) APO.set((x) => ({ queue: [...x.queue, { n, exception: negative ? `Stock négatif : ${negative} (vente hors ligne ${n})` : null }] }));
    APO.log(`Vente ${n} · ${APO.dh(T.total)} · ${pays.map((p) => PAYL[p.mode]).join(" + ")}${T.disc ? " · remises promo " + APO.dh(T.disc) : ""}${s.offline ? " · hors ligne" : ""}`, "ok");
    if (cust && T.earn) APO.log(`Fidélité ${cust.name} : +${T.earn} pts${redeemPts ? " · 500 pts utilisés" : ""}`, "info");
    if (attributed > 0) APO.log(`Ventes attribuées à ${seller} : ${APO.dh(attributed)}`, "info");
  }

  function Receipt({ r }) {
    const close = () => APO.setV({ receipt: null });
    const credit = r.kind === "credit";
    return html`<${APO.Modal} onClose=${close}><div className="card-h"><${Icon} n="receipt" /><h3>${credit ? "Avoir émis" : "Vente encaissée"}</h3><span className="spacer"></span>${r.offline ? html`<${Badge} tone="warn">Hors ligne · en file</${Badge}>` : html`<${Badge} tone="ok">Synchronisé</${Badge}>`}</div>
      <div className="card-b col">
        <div className="receipt">
          <div className="c"><b>${ORG.name.toUpperCase()}</b></div><div className="c">${r.shopName} · caisse ${ORG.terminal}</div><div className="c">ICE ${ORG.ice} · IF ${ORG.if} · RC ${ORG.rc}</div><hr />
          ${credit ? html`<div>
            <div className="c"><b>AVOIR</b></div>
            ${r.origin ? html`<div className="rr"><span>Ticket d'origine</span><span>${r.origin}</span></div>` : html`<div className="rr"><span>Sans ticket</span><span>accord responsable</span></div>`}
            <div className="rr"><span>Motif</span><span>${r.reason}</span></div><hr />
            ${r.lines.map((l, i) => html`<div key=${i}><div className="rr"><span>${l.qty} × ${l.name}</span><span>-${APO.n2(l.amount)}</span></div><div className="faint" style=${{ paddingLeft: 14 }}>${l.v}${r.restock ? " · remis en stock" : " · retour distributeur"}</div></div>`)}<hr />
            <div className="rr"><b>TOTAL AVOIR TTC</b><b>-${APO.n2(r.amount)}</b></div>
            <div className="rr"><span>Total HT</span><span>-${APO.n2(r.ht)}</span></div>
            <div className="rr"><span>TVA 20 % reprise</span><span>-${APO.n2(r.vat)}</span></div>
            <div className="rr"><span>${r.action === "refund" ? "Remboursement" : r.action === "exchange" ? "Échange" : "Bon d'achat"}</span><span>${r.action === "refund" ? PAYL[r.mode] : r.action === "exchange" ? "déduit du ticket suivant" : r.voucher}</span></div>
            ${r.action === "voucher" && html`<div className="rr"><span>Validité</span><span>13/11/2027 · 4 boutiques</span></div>`}
            ${r.cust && html`<div className="rr"><span>Fidélité ${r.cust}</span><span>-${r.pts} pts</span></div>`}<hr />
          </div>` : html`<div>
            ${r.lines.map((l, i) => html`<div key=${i}><div className="rr"><span>${l.qty} × ${l.name}</span><span>${APO.n2(l.amount)}</span></div><div className="faint" style=${{ paddingLeft: 14 }}>${l.v}${l.mode === "collect" ? " · retrait " + l.from : l.mode === "transfer" ? " · transfert " + l.from : ""}</div></div>`)}<hr />
            ${r.promos.length > 0 && html`<div className="rr"><span>Prix de référence</span><span>${APO.n2(r.sub)}</span></div>`}
            ${r.promos.map((x) => html`<div key=${x.id} className="rr"><span>Remise ${x.label}</span><span>-${APO.n2(x.amount)}</span></div>`)}
            ${r.redeem > 0 && html`<div className="rr"><span>Remise fidélité (500 pts)</span><span>-${APO.n2(r.redeem)}</span></div>`}
            ${r.credit > 0 && html`<div className="rr"><span>Avoir ${r.creditN}</span><span>-${APO.n2(r.credit)}</span></div>`}
            <div className="rr"><b>TOTAL TTC</b><b>${APO.n2(r.total)}</b></div>
            <div className="rr"><span>Total HT</span><span>${APO.n2(r.ht)}</span></div>
            <div className="rr"><span>TVA 20 %</span><span>${APO.n2(r.vat)}</span></div>
            ${r.pays.map((p, i) => html`<div key=${i} className="rr"><span>${i === 0 ? "Paiement · " : ""}${PAYL[p.mode]}${p.code ? " " + p.code : ""}</span><span>${APO.n2(p.amount)}</span></div>`)}
            ${r.giftLeft != null && html`<div className="rr"><span>Solde carte cadeau</span><span>${APO.n2(r.giftLeft)}</span></div>`}
            ${r.leftCode && html`<div className="rr"><span>Reliquat avoir → bon ${r.leftCode}</span><span>${APO.n2(r.leftover)}</span></div>`}<hr />
            ${r.seller && html`<div className="rr"><span>Vendu par</span><span>${r.seller}</span></div>`}
            ${r.cust && html`<div className="rr"><span>Fidélité ${r.cust} (${r.tier})</span><span>+${r.earn} pts</span></div>`}
            ${r.cust && html`<div className="rr"><span>Nouveau solde</span><span>${APO.int(r.balance)} pts</span></div>`}
            ${(r.cust || r.seller) && html`<hr />`}
          </div>`}
          <div className="rr"><span>N°</span><span>${r.n}</span></div>
          <div className="rr"><span>Chaîne</span><span>${r.prev} → ${r.hash}</span></div>
          ${!credit && html`<div className="c" style=${{ marginTop: 6 }}>Échange sous 15 jours avec ticket · produit non ouvert</div>`}
          <div className="c">شكرا لزيارتكم · نتمنى لكم يوما سعيدا</div>
          <div className="c">Merci de votre visite</div>
        </div>
        <p className="small faint">${credit ? "L'avoir suit la même série et la même chaîne d'intégrité que les tickets de la caisse : il annule fiscalement la vente, il ne la supprime pas." : "Mentions légales verrouillées par le Pack Maroc. Numéro définitif attribué par le terminal : jamais renuméroté, même hors ligne."}${r.attributed > 0 ? ` ${APO.dh(r.attributed)} attribués à ${r.seller}.` : ""}</p>
        <div className="row" style=${{ justifyContent: "flex-end" }}><button className="btn" onClick=${() => APO.toast("e-ticket envoyé", r.cust ? "Par WhatsApp à " + r.cust + " (opt-in)" : "QR affiché sur l'écran client", "send")}><${Icon} n="send" s=${15} />e-ticket</button><button className="btn" onClick=${() => APO.toast("Ticket imprimé", "Imprimante thermique de la caisse")}><${Icon} n="printer" s=${15} />Imprimer</button><button className="btn pri" onClick=${close}>${credit && r.action === "exchange" ? "Choisir le produit d'échange" : "Nouvelle vente"}</button></div></div></${APO.Modal}>`;
  }

  /* ---------------- CATALOGUE ---------------- */
  APO.screens["para:pcatalog"] = function Catalog() {
    const s = APO.use(); const st = s.para; const [brand, setBrand] = useState("Toutes"); const [q, setQ] = useState("");
    const brands = ["Toutes", ...Array.from(new Set(PP.map((p) => p.brand)))];
    const list = PP.filter((p) => (brand === "Toutes" || p.brand === brand) && (!q || (p.brand + p.range + p.name + p.ean).toLowerCase().includes(q.toLowerCase())));
    const nVar = PP.reduce((a, p) => a + p.variants.length, 0);
    return html`<div>
      <${APO.PageH} title="Catalogue" sub="Marques, gammes et variantes (teintes, formats, coffrets). Un seul référentiel pour les 4 boutiques, l'e-shop et les animatrices.">
        <div className="search" style=${{ cursor: "text", minWidth: 240 }}><${Icon} n="search" s=${16} /><input id="cat-q" style=${{ border: 0, outline: 0, background: "none", flex: 1 }} placeholder="Marque, gamme, EAN" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        <button className="btn pri" onClick=${() => { APO.toast("Fiche produit créée", "Brouillon · EAN à scanner, teintes et formats à compléter.", "plus"); APO.log("Catalogue : nouvelle fiche produit (brouillon)", "info"); }}><${Icon} n="plus" s=${15} />Nouveau produit</button></${APO.PageH}>
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Références" value=${PP.length} delta=${nVar + " variantes"} />
        <${APO.Kpi} label="Marques" value=${brands.length - 1} delta="5 distributeurs" />
        <${APO.Kpi} label="Marge moyenne (HT)" value=${APO.n2(PP.filter((p) => !p.banned).reduce((a, p) => a + marginPct(p, 0), 0) / (PP.length - 1)) + " %"} delta="prix fixés par le siège" />
        <${APO.Kpi} label="Bloqués" value="1" delta="interdiction AMMPS" tone="down" />
      </div>
      <div className="adv info" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="grid" s=${16} /></div><span className="src">Catalogue</span><b>Produits sans AMM : cosmétiques et soins</b><p>Cosmétiques et soins : TVA 20 %, prix libres poussés par le siège. La garde de classe produit interdit d'y créer un médicament.</p></div>
      <div className="row" style=${{ marginBottom: 14 }}>${brands.map((b) => html`<button key=${b} className=${"btn sm " + (b === brand ? "pri" : "")} onClick=${() => setBrand(b)}>${b}</button>`)}</div>
      <div className="col" style=${{ gap: 14 }}>${list.map((p) => html`<div key=${p.id} className="card">
        <div className="card-h" style=${{ flexWrap: "wrap" }}><${Thumb} p=${p} s=${38} /><div style=${{ minWidth: 0 }}><h3>${title(p)}</h3><span className="sub">${p.brand}</span></div>
          <div className="r" style=${{ flexWrap: "wrap" }}>${p.banned ? html`<${Badge} tone="bad">Bloqué · Pack Maroc</${Badge}>` : html`<${Badge}>Sans AMM</${Badge}>`}${p.kit && html`<${Badge} tone="acc">Coffret · 3 composants</${Badge}>`}${p.shades && html`<${Badge} tone="acc">${p.variants.length} teintes</${Badge}>`}<${Badge} mono>EAN ${p.ean}</${Badge}><${Badge}>TVA 20 %</${Badge}></div></div>
        ${p.banned && html`<div className="card-b" style=${{ borderBottom: "1px solid var(--line)", background: "var(--bad-soft)", color: "var(--bad)", fontSize: 12.5 }}><${Icon} n="alert" s=${14} /> ${p.banned}${st.quarantine ? " · en quarantaine" : ""}</div>`}
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Variante</th>${LOCS.map((x) => html`<th key=${x.id} className="r">${x.short}</th>`)}<th className="r">Total</th><th className="r">Prix TTC</th><th className="r">Coût HT</th><th className="r">Marge</th></tr></thead>
          <tbody>${p.variants.map((v, i) => { const tot = sumStock(st, p.id, i); const m = marginPct(p, i); return html`<tr key=${v.v}><td>${v.sw && html`<${Swatch} c=${v.sw} />`}<b style=${{ fontWeight: 500 }}>${v.v}</b></td>${st.stock[p.id][i].map((q2, k) => html`<td key=${k} className="r mono" style=${{ color: q2 <= 0 ? "var(--bad)" : q2 < 3 ? "var(--warn)" : "" }}>${q2}</td>`)}<td className="r mono"><b>${tot}</b></td><td className="r mono">${APO.n2(vPrice(p, i))}</td><td className="r mono faint">${APO.n2(vCost(p, i))}</td><td className="r"><${Badge} tone=${m >= 25 ? "ok" : m >= 19 ? "" : "warn"}>${APO.n2(m)} %</${Badge}></td></tr>`; })}</tbody></table></div></div>`)}</div>
    </div>`;
  };

  /* ---------------- STOCK & TRANSFERS ---------------- */
  APO.screens["para:pstock"] = function Stock() {
    const s = APO.use(); const st = s.para; const tab = st.stockTab || "shop"; const setTab = (t) => APO.setV({ stockTab: t }); const [sh, setSh] = useState("s1"); const [modal, setModal] = useState(null);
    const si = sIdx(sh);
    const rows = PP.flatMap((p) => p.variants.map((v, i) => ({ p, i, v, q: st.stock[p.id][i][si] })));
    const value = rows.reduce((a, r) => a + Math.max(r.q, 0) * vCost(r.p, r.i), 0);
    const moving = st.transfers.filter((t) => t.st < 3).length;
    const advance = (t) => {
      const next = t.st + 1;
      APO.setV((c) => {
        let stock = c.stock;
        const mv = (shopId, d) => { const k = sIdx(shopId); stock = { ...stock, [t.pid]: stock[t.pid].map((v, i) => (i === t.vi ? v.map((q, j) => (j === k ? q + d : q)) : v)) }; };
        if (next === 1) mv(t.from, -t.qty);
        if (next === 3 && !t.forSale) mv(t.to, t.qty);
        return { stock, transfers: c.transfers.map((x) => (x.id === t.id ? { ...x, st: next } : x)) };
      });
      APO.toast(`${t.id} : ${TR_STEPS[next]}`, `${pp(t.pid).range} ${vName(pp(t.pid), t.vi)} × ${t.qty} · ${shop(t.from).short} → ${shop(t.to).short}`, "truck");
      APO.log(`Transfert ${t.id} · ${TR_STEPS[next]}${next === 3 ? " · stock " + shop(t.to).short + " mis à jour" : ""}`, next === 3 ? "ok" : "info");
    };
    const openTester = (val) => {
      const [pid, vi] = val.split(":"); const k = +vi; const p = pp(pid);
      if (st.stock[pid][k][sIdx("s1")] <= 0) { APO.toast("Stock vendable insuffisant", "Aucune unité à Maârif pour ouvrir un testeur."); return; }
      APO.setV((c) => ({ stock: { ...c.stock, [pid]: c.stock[pid].map((v, i) => (i === k ? v.map((q, j) => (j === 0 ? q - 1 : q)) : v)) }, testers: [{ id: APO.uid(), pid, vi: k, shop: "s1", opened: "13/11/2026", by: "Équipe Maârif" }, ...c.testers] }));
      APO.toast("Testeur ouvert", `${p.range} ${vName(p, k)} sorti du stock vendable · refacturable à la marque.`, "box"); APO.log(`Testeur ouvert : ${p.range} ${vName(p, k)} (Maârif)`, "info");
    };
    const [tv, setTv] = useState("q2:0");
    return html`<div>
      <${APO.PageH} title="Stock & transferts" sub="Un stock par boutique, des transferts tracés de bout en bout, et le stock hors vente (testeurs, échantillons, dépôt-vente) suivi à part.">
        <button className="btn" onClick=${() => setTab("inv")}><${Icon} n="box" s=${15} />Inventaire</button><button className="btn pri" onClick=${() => setModal({ val: "q1:1", from: "s2", to: "s1", qty: 2 })}><${Icon} n="truck" s=${15} />Nouveau transfert</button></${APO.PageH}>
      <div className="grid" style=${{ marginBottom: 16, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        ${LOCS.map((x, k) => html`<${APO.Kpi} key=${x.id} label=${"Valeur stock · " + x.short} value=${APO.dh(PP.reduce((a, p) => a + p.variants.reduce((b, v, i) => b + Math.max(st.stock[p.id][i][k], 0) * vCost(p, i), 0), 0))} delta=${PP.reduce((a, p) => a + st.stock[p.id].filter((v) => v[k] <= 0).length, 0) + " variante(s) en rupture"} tone=${PP.some((p) => st.stock[p.id].some((v) => v[k] <= 0)) ? "down" : ""} />`)}
        <${APO.Kpi} label="Transferts en cours" value=${moving} delta="navette quotidienne depuis le dépôt · hebdo Marrakech" />
      </div>
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "shop", label: "Stock par boutique" }, { id: "tr", label: "Transferts", count: st.transfers.length }, { id: "test", label: "Testeurs & échantillons", count: st.testers.length + st.samples.length }, { id: "dv", label: "Dépôt-vente", count: st.consign.length }, { id: "inv", label: "Inventaire tournant" }, ...(APO.installed(s, "expiry.para") ? [{ id: "exp", label: "Fin de saison & péremption", count: LOTS.filter((l) => l.months < 9 && !st.markdowns[l.id]).length }] : [])]} />
      ${tab === "inv" && html`<${InventoryTab} />`}
      ${tab === "exp" && APO.installed(s, "expiry.para") && html`<${ExpiryTab} />`}
      ${tab === "shop" && html`<div>
        <div className="row" style=${{ marginBottom: 12 }}><div className="pill-toggle">${LOCS.map((x) => html`<button key=${x.id} className=${sh === x.id ? "on" : ""} onClick=${() => setSh(x.id)}>${x.name}</button>`)}</div><span className="spacer"></span><span className="small muted">Valeur au coût HT : <b className="mono">${APO.dh(value)}</b></span></div>
        <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Variante</th><th className="r">Stock ici</th><th>Autres boutiques</th><th className="r">Valeur HT</th><th></th></tr></thead>
          <tbody>${rows.map((r) => { const others = LOCS.map((x, k) => [x, st.stock[r.p.id][r.i][k]]).filter((x, k) => k !== si); const best = others.slice().sort((a, b) => b[1] - a[1])[0]; return html`<tr key=${r.p.id + r.i}><td><div className="row" style=${{ flexWrap: "nowrap" }}><${Thumb} p=${r.p} s=${30} /><div><b>${r.p.range}</b><div className="faint small">${r.p.brand}</div></div></div></td><td>${r.v.sw && html`<${Swatch} c=${r.v.sw} />`}${r.v.v}</td><td className="r">${r.p.banned ? html`<${Badge} tone="bad">${st.quarantine ? "Quarantaine" : "Bloqué"} · ${r.q}</${Badge}>` : stockBadge(r.q)}</td>
            <td className="small muted">${others.map((o) => o[0].short + " " + o[1]).join(" · ")}</td><td className="r mono">${APO.n2(Math.max(r.q, 0) * vCost(r.p, r.i))}</td>
            <td className="r">${!r.p.banned && r.q < 3 && best[1] > 2 ? html`<button className="btn sm" onClick=${() => setModal({ val: r.p.id + ":" + r.i, from: best[0].id, to: sh, qty: Math.min(2, best[1] - 1) })}><${Icon} n="truck" s=${13} />Depuis ${best[0].short}</button>` : null}</td></tr>`; })}</tbody></table></div></${Card}></div>`}
      ${tab === "tr" && html`<div className="col">${st.transfers.map((t) => { const p = pp(t.pid); return html`<div key=${t.id} className="card"><div className="card-b grid" style=${{ gridTemplateColumns: "minmax(220px,1fr) minmax(300px,1.4fr) auto", alignItems: "center", gap: 18 }}>
        <div className="row" style=${{ flexWrap: "nowrap" }}><${Thumb} p=${p} s=${38} /><div style=${{ minWidth: 0 }}><b>${p.range} · ${vName(p, t.vi)} × ${t.qty}</b><div className="small faint"><span className="mono">${t.id}</span> · ${shop(t.from).short} → ${shop(t.to).short} · ${t.t}</div><div className="small muted">${t.why}</div></div></div>
        <${Steps} steps=${TR_STEPS} at=${t.st} />
        <div>${t.st < 3 ? html`<button className="btn sm pri" onClick=${() => advance(t)}>→ ${TR_STEPS[t.st + 1]}</button>` : html`<${Badge} tone="ok">Reçu · stock à jour</${Badge}>`}</div></div></div>`; })}
        <p className="small faint">Chaque étape est signée par la boutique émettrice puis par la boutique réceptrice. Le stock d'origine baisse à l'expédition, celui de destination monte à la réception.</p></div>`}
      ${tab === "test" && html`<div className="grid g2">
        <${Card} title="Testeurs ouverts" sub="sortis du stock vendable" pad=${false} right=${html`<select className="input" style=${{ width: 190, padding: "4px 8px" }} value=${tv} onChange=${(e) => setTv(e.target.value)}>${variantOptions().map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</select><button className="btn sm pri" onClick=${() => openTester(tv)}>Ouvrir</button>`}>
          <table className="tbl"><thead><tr><th>Produit</th><th>Boutique</th><th>Ouvert le</th><th>Par</th></tr></thead><tbody>${st.testers.map((t) => html`<tr key=${t.id}><td><b>${pp(t.pid).range}</b><div className="faint small">${vName(pp(t.pid), t.vi)}</div></td><td>${shop(t.shop).short}</td><td className="mono small">${t.opened}</td><td className="small">${t.by}</td></tr>`)}</tbody></table></${Card}>
        <${Card} title="Échantillons" sub="offerts par les marques · non vendables" pad=${false}><table className="tbl"><thead><tr><th>Échantillon</th><th>Boutique</th><th className="r">Restant</th><th></th></tr></thead><tbody>${st.samples.map((x) => html`<tr key=${x.id}><td><b>${x.name}</b><div className="faint small">${x.brand}</div></td><td>${shop(x.shop).short}</td><td className="r mono">${x.qty}</td><td className="r"><button className="btn sm" disabled=${x.qty < 10} onClick=${() => { APO.setV((c) => ({ samples: c.samples.map((y) => (y.id === x.id ? { ...y, qty: y.qty - 10 } : y)) })); APO.toast("10 échantillons distribués", x.name + " · rattachés aux ventes du jour pour le rapport marque.", "gift"); APO.log(`Échantillons distribués : ${x.name} × 10`, "info"); }}>Distribuer 10</button></td></tr>`)}</tbody></table></${Card}></div>`}
      ${tab === "dv" && html`<div className="col">
        <div className="adv info"><div className="ic"><${Icon} n="building" s=${16} /></div><span className="src">Stock multi-boutiques · Dépôt-vente</span><b>Stock appartenant au fournisseur</b><p>Hors valeur de stock et hors bilan. Vendu au même ticket, reversé au déposant à la clôture du relevé, commission déduite.</p></div>
        <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Article</th><th>Déposant</th><th>Boutique</th><th className="r">Déposé</th><th className="r">Vendu</th><th className="r">Reste</th><th className="r">À reverser</th><th></th></tr></thead>
          <tbody>${st.consign.map((x) => { const due = x.sold * x.price * (1 - x.com / 100); return html`<tr key=${x.id}><td><b>${x.item}</b><div className="faint small">${APO.n2(x.price)} TTC · commission ${x.com} %</div></td><td className="small">${x.owner}</td><td>${shop(x.shop).short}</td><td className="r mono">${x.dep}</td><td className="r mono">${x.sold}</td><td className="r mono">${x.dep - x.sold}</td><td className="r mono">${APO.n2(due)}</td>
            <td className="r">${x.settled ? html`<${Badge} tone="ok">Relevé émis</${Badge}>` : html`<button className="btn sm" onClick=${() => { APO.setV((c) => ({ consign: c.consign.map((y) => (y.id === x.id ? { ...y, settled: true } : y)) })); APO.toast("Relevé de dépôt émis", `${x.owner} · ${APO.dh(due)} à reverser`, "receipt"); APO.log(`Relevé dépôt-vente ${x.owner} : ${APO.dh(due)}`, "ok"); }}>Générer le relevé</button>`}</td></tr>`; })}</tbody></table></div></${Card}></div>`}
      ${modal && html`<${TransferModal} init=${modal} onClose=${() => setModal(null)} onDone=${() => { setModal(null); setTab("tr"); }} />`}
    </div>`;
  };

  /* ---------------- rolling inventory (blind count) ---------------- */
  function InventoryTab() {
    const s = APO.use(); const st = s.para; const inv = st.inv; const k = sIdx(inv.shop);
    const set = (patch) => APO.setV((c) => ({ inv: { ...c.inv, ...patch } }));
    const rows = INV_ZONE.map(([pid, vi]) => { const p = pp(pid); const key = pid + ":" + vi; const exp = st.stock[pid][vi][k]; const cnt = inv.counts[key]; const diff = cnt === undefined || cnt === "" ? null : +cnt - exp; return { p, vi, key, exp, cnt, diff, val: diff == null ? 0 : diff * vCost(p, vi) }; });
    const nCounted = rows.filter((r) => r.diff != null).length; const filled = nCounted === rows.length;
    const diffs = rows.filter((r) => r.diff); const total = diffs.reduce((a, r) => a + r.val, 0);
    const missing = diffs.some((r) => !inv.reasons[r.key]);
    const demo = () => set({ counts: Object.fromEntries(rows.map((r) => [r.key, String(Math.max(0, r.exp + (INV_DEMO[r.key] || 0)))])) });
    const validate = () => {
      const ref = `INV-${shop(inv.shop).short.slice(0, 3).toUpperCase()}-2611-${String(8 + inv.done.length).padStart(2, "0")}`; const loss = -diffs.filter((r) => r.val < 0).reduce((a, r) => a + r.val, 0);
      APO.setV((c) => { let stock = c.stock; diffs.forEach((r) => (stock = stockMove(stock, r.p.id, r.vi, c.inv.shop, r.diff))); return { stock, shrink: { ...c.shrink, [c.inv.shop]: (c.shrink[c.inv.shop] || 0) + loss }, inv: { ...c.inv, counts: {}, shown: false, reasons: {}, done: [{ ref, shop: c.inv.shop, t: APO.now(), lines: rows.length, diffs: diffs.length, value: total, why: [...new Set(diffs.map((r) => c.inv.reasons[r.key]))].join(", ") }, ...c.inv.done] } }; });
      APO.toast("Inventaire validé", `${ref} · ${diffs.length} écart(s) · ${APO.dh(total)} · stock de ${shop(inv.shop).short} ajusté`, "box");
      APO.log(`Inventaire tournant ${ref} validé · écart valorisé ${APO.dh(total)}`, total < 0 ? "warn" : "ok");
    };
    return html`<div className="split rev">
      <${Card} title="Comptage tournant · rayon solaires & teint" sub=${nCounted + " / " + rows.length + " variantes comptées · à l'aveugle"} pad=${false} right=${html`<div className="pill-toggle">${SHOPS.map((x) => html`<button key=${x.id} className=${inv.shop === x.id ? "on" : ""} onClick=${() => set({ shop: x.id, counts: {}, shown: false, reasons: {} })}>${x.short}</button>`)}</div>`}>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Variante</th><th className="r">Compté</th>${inv.shown && html`<th className="r">Théorique</th>`}${inv.shown && html`<th className="r">Écart</th>`}${inv.shown && html`<th className="r">Valeur HT</th>`}${inv.shown && html`<th>Motif</th>`}</tr></thead>
          <tbody>${rows.map((r) => html`<tr key=${r.key}><td><div className="row" style=${{ flexWrap: "nowrap" }}><${Thumb} p=${r.p} s=${28} /><b>${r.p.range}</b></div></td><td>${r.p.variants[r.vi].sw && html`<${Swatch} c=${r.p.variants[r.vi].sw} />`}${vName(r.p, r.vi)}</td>
            <td className="r"><input id=${"inv-" + r.key.replace(":", "-")} type="number" min="0" className="input mono" style=${{ width: 74, padding: "4px 8px", textAlign: "right" }} disabled=${inv.shown} value=${r.cnt ?? ""} onInput=${(e) => set({ counts: { ...inv.counts, [r.key]: e.target.value } })} /></td>
            ${inv.shown && html`<td className="r mono faint">${r.exp}</td>`}
            ${inv.shown && html`<td className="r mono" style=${{ color: r.diff < 0 ? "var(--bad)" : r.diff > 0 ? "var(--ok)" : "" }}>${r.diff > 0 ? "+" : ""}${r.diff}</td>`}
            ${inv.shown && html`<td className="r mono" style=${{ color: r.val < 0 ? "var(--bad)" : "" }}>${r.diff ? APO.n2(r.val) : "—"}</td>`}
            ${inv.shown && html`<td>${r.diff ? html`<select className="input" style=${{ padding: "4px 6px", minWidth: 150, borderColor: inv.reasons[r.key] ? "" : "var(--warn)" }} value=${inv.reasons[r.key] || ""} onChange=${(e) => set({ reasons: { ...inv.reasons, [r.key]: e.target.value } })}><option value="">Choisir un motif…</option>${REASONS.map((x) => html`<option key=${x}>${x}</option>`)}</select>` : html`<span className="faint small">conforme</span>`}</td>`}</tr>`)}</tbody></table></div>
        <div className="card-b row" style=${{ borderTop: "1px solid var(--line)" }}>
          ${!inv.shown ? html`<button className="btn sm ghost" onClick=${demo}>Remplir (démo)</button><span className="spacer"></span><span className="small faint">Les quantités théoriques restent masquées pendant le comptage.</span><button id="inv-reveal" className="btn sm pri" disabled=${!filled} onClick=${() => set({ shown: true })}>Calculer les écarts</button>`
            : html`<span className="small">Écart valorisé : <b className="mono" style=${{ color: total < 0 ? "var(--bad)" : "" }}>${APO.dh(total)}</b> · ${diffs.length} ligne(s)</span><span className="spacer"></span><button className="btn sm ghost" onClick=${() => set({ shown: false })}>Recompter</button><button id="inv-ok" className="btn sm pri" disabled=${missing} onClick=${validate}><${Icon} n="check" s=${13} />Valider</button>`}
        </div></${Card}>
      <div className="col">
        <${Card} title="Démarque inconnue" sub="% du CA du mois">${SHOPS.map((x) => { const v = shrinkPct(st, x.id); return html`<div key=${x.id} className="row small" style=${{ marginBottom: 6 }}><span>${x.name}</span><span className="spacer"></span><${Badge} tone=${v >= 0.6 ? "warn" : "ok"}>${APO.n2(v)} %</${Badge}></div>`; })}</${Card}>
        <${Card} title="Comptages validés" pad=${false}>${inv.done.length ? html`<table className="tbl"><tbody>${inv.done.map((d) => html`<tr key=${d.ref}><td className="mono small">${d.ref}<div className="faint">${d.t} · ${shop(d.shop).short}</div></td><td className="small">${d.diffs} écart(s)<div className="faint">${d.why || "—"}</div></td><td className="r mono" style=${{ color: d.value < 0 ? "var(--bad)" : "" }}>${APO.n2(d.value)}</td></tr>`)}</tbody></table>` : html`<div className="empty">Aucun comptage aujourd'hui.</div>`}</${Card}>
        <div className="adv info"><div className="ic"><${Icon} n="info" s=${16} /></div><span className="src">Inventaire tournant</span><b>Un rayon par jour, sans fermer la boutique</b><p>Chaque écart a un motif. « Testeur non déclaré » rappelle d'ouvrir les testeurs depuis l'onglet dédié pour les refacturer à la marque.</p></div>
      </div></div>`;
  }

  /* ---------------- season-end markdown & expiry (expiry.para) ---------------- */
  const addMonths = (d, m) => { const [dd, mm, yy] = d.split("/").map(Number); const t = new Date(yy, mm - 1 + m, dd); return t; };
  const fmtD = (t) => t.toLocaleDateString("fr-FR");
  const NOW = new Date(2026, 10, 13);
  function ExpiryTab() {
    const s = APO.use(); const st = s.para;
    const lots = LOTS.filter((l) => l.months < 9).sort((a, b) => a.months - b.months);
    const act = (l, kind) => {
      const p = pp(l.pid); const price = Math.round(vPrice(p, l.vi) * 0.7 * 100) / 100;
      APO.setV((c) => ({ markdowns: { ...c.markdowns, [l.id]: { kind, price, t: APO.now() } } }));
      if (kind === "md") { APO.toast("Démarque appliquée", `${p.range} ${vName(p, l.vi)} lot ${l.lot} · ${APO.dh(price)} · ${l.qty} étiquettes jaunes à poser`, "tag"); APO.log(`Fin de saison : lot ${l.lot} démarqué à ${APO.dh(price)} (financé L'Oréal 70 %)`, "ok"); }
      else { APO.toast("Reprise demandée", `${l.qty} × ${p.range} lot ${l.lot} · bon de retour envoyé à L'Oréal Cosmétique Active`, "truck"); APO.log(`Fin de saison : reprise du lot ${l.lot} demandée au distributeur`, "info"); }
    };
    return html`<div className="col">
      <div className="adv acc"><div className="ic"><${Icon} n="clock" s=${16} /></div><span className="src">Fin de saison & péremption</span><b>Solaires : ${lots.length} lots à moins de 9 mois de la date limite</b><p>Novembre = fin de saison solaire. Sous 5 mois, l'accord L'Oréal prévoit la reprise du stock ; entre 5 et 9 mois, démarque de −30 % financée à 70 % par la marque.</p></div>
      <${Card} title="Lots Anthelios à traiter" pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Lot</th><th>Date limite</th><th>Où</th><th className="r">Qté</th><th className="r">Valeur HT</th><th>Suggestion</th><th></th></tr></thead>
        <tbody>${lots.map((l) => { const p = pp(l.pid); const done = st.markdowns[l.id]; const ret = l.months <= 4; return html`<tr key=${l.id}><td><b>${p.range}</b><div className="faint small">${vName(p, l.vi)}</div></td><td className="mono small">${l.lot}</td><td><span className="mono small">${l.exp}</span> <${Badge} tone=${l.months <= 4 ? "bad" : "warn"}>${l.months} mois</${Badge}></td><td>${shop(l.shop).short}</td><td className="r mono">${l.qty}</td><td className="r mono">${APO.n2(l.qty * vCost(p, l.vi))}</td>
          <td className="small">${ret ? "Retour stock au distributeur (reprise à 100 %)" : `Démarque −30 % → ${APO.n2(vPrice(p, l.vi) * 0.7)} DH · ${fund(70)}`}</td>
          <td className="r">${done ? html`<${Badge} tone="ok">${done.kind === "md" ? "Démarqué · " + APO.n2(done.price) : "Reprise demandée"}</${Badge}>` : html`<div className="row" style=${{ justifyContent: "flex-end", gap: 6 }}><button className=${"btn sm " + (ret ? "" : "pri")} onClick=${() => act(l, "md")}>Démarquer</button><button className=${"btn sm " + (ret ? "pri" : "")} onClick=${() => act(l, "ret")}>Retour stock</button></div>`}</td></tr>`; })}</tbody></table></div></${Card}>
      <${Card} title="Testeurs : durée après ouverture" sub="symbole du pot ouvert (PAO) · à remplacer avant la date" pad=${false}><table className="tbl"><thead><tr><th>Testeur</th><th>Boutique</th><th>Ouvert le</th><th>PAO</th><th>À remplacer le</th><th></th></tr></thead>
        <tbody>${st.testers.map((t) => { const p = pp(t.pid); const m = PAO[t.pid] || 12; const end = addMonths(t.opened, m); const over = end < NOW; const soon = !over && end - NOW < 1000 * 3600 * 24 * 45; return html`<tr key=${t.id}><td><b>${p.range}</b><div className="faint small">${vName(p, t.vi)}</div></td><td>${shop(t.shop).short}</td><td className="mono small">${t.opened}</td><td><${Badge} mono>${m}M</${Badge}></td><td><span className="mono small">${fmtD(end)}</span> ${over ? html`<${Badge} tone="bad">Dépassé</${Badge}>` : soon ? html`<${Badge} tone="warn">Bientôt</${Badge}>` : null}</td>
          <td className="r">${over ? html`<button className="btn sm" onClick=${() => { APO.setV((c) => ({ testers: c.testers.map((x) => (x.id === t.id ? { ...x, opened: "13/11/2026", by: "Équipe " + shop(t.shop).short } : x)), stock: stockMove(c.stock, t.pid, t.vi, t.shop, -1) })); APO.toast("Testeur remplacé", `${p.range} · ancien testeur jeté, nouveau sorti du stock vendable.`, "box"); APO.log(`Testeur remplacé (PAO dépassé) : ${p.range} ${shop(t.shop).short}`, "info"); }}>Remplacer</button>` : null}</td></tr>`; })}</tbody></table></${Card}>
    </div>`;
  }

  function TransferModal({ init, onClose, onDone }) {
    const s = APO.use(); const st = s.para; const [f, setF] = useState(init);
    const [pid, vi] = f.val.split(":"); const avail = st.stock[pid][+vi][sIdx(f.from)];
    const err = f.from === f.to ? "Choisissez deux boutiques différentes." : f.qty < 1 ? "Quantité invalide." : f.qty > avail ? `Seulement ${avail} disponible(s) à ${shop(f.from).short}.` : null;
    const create = () => { APO.setV((c) => { const t = newTransfer(c, pid, +vi, +f.qty, f.from, f.to, "Transfert manuel · " + shop(f.to).short); APO.log(`Transfert ${t.id} demandé : ${pp(pid).range} ${vName(pp(pid), +vi)} × ${f.qty} · ${shop(f.from).short} → ${shop(f.to).short}`, "info"); return { transfers: [t, ...c.transfers] }; }); APO.toast("Transfert demandé", `${pp(pid).range} ${vName(pp(pid), +vi)} × ${f.qty} · ${shop(f.from).short} → ${shop(f.to).short}`, "truck"); onDone(); };
    return html`<${APO.Modal} onClose=${onClose}><div className="card-h"><${Icon} n="truck" /><h3>Nouveau transfert</h3></div>
      <div className="card-b col">
        <label className="field">Produit et variante<select id="tr-p" className="input" value=${f.val} onChange=${(e) => setF({ ...f, val: e.target.value })}>${variantOptions().map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</select></label>
        <div className="grid g3" style=${{ gap: 10 }}>
          <label className="field">Depuis<select className="input" value=${f.from} onChange=${(e) => setF({ ...f, from: e.target.value })}>${LOCS.map((x, k) => html`<option key=${x.id} value=${x.id}>${x.name} (${st.stock[pid][+vi][k]})</option>`)}</select></label>
          <label className="field">Vers<select className="input" value=${f.to} onChange=${(e) => setF({ ...f, to: e.target.value })}>${LOCS.map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}</select></label>
          <label className="field">Quantité<input type="number" min="1" className="input mono" value=${f.qty} onInput=${(e) => setF({ ...f, qty: +e.target.value })} /></label>
        </div>
        ${err ? html`<p className="small" style=${{ color: "var(--bad)" }}>${err}</p>` : html`<p className="small muted">Départ par la prochaine navette. Le stock de ${shop(f.from).short} baisse à l'expédition.</p>`}
        <div className="row" style=${{ justifyContent: "flex-end" }}><button className="btn ghost" onClick=${onClose}>Annuler</button><button className="btn pri" disabled=${!!err} onClick=${create}><${Icon} n="check" s=${15} />Demander le transfert</button></div>
      </div></${APO.Modal}>`;
  }

  /* ---------------- PURCHASING (brand distributors) ---------------- */
  // Central delivery BL-LOR-55812 at the warehouse: only exceptions are shown (officine pattern)
  const RECV = {
    bl: "BL-LOR-55812", po: "BC-MAA-0313", dist: "lor", lines: 46, ok: 40,
    rows: [
      { id: "r1", pid: "q1", vi: 0, kind: "Scan ≠ BL", tone: "warn", detail: "BL : 120 · scanné : 118. Deux unités manquantes au colisage.", def: "claim", impact: { qty: 118 } },
      { id: "r2", pid: "q1", vi: 1, kind: "Gratuité", tone: "warn", detail: "Gratuité 1 pour 10 : reçu 2/3 sur la ligne Anthelios Teinté (30 commandés). 1 UG due.", def: "claim" },
      { id: "r3", pid: "q4", vi: 0, kind: "Article abîmé", tone: "bad", detail: "1 flacon Minéral 89 fêlé, carton humide. Photo jointe.", def: "refuse" },
      { id: "r4", pid: "q1", vi: 1, kind: "Date courte", tone: "warn", detail: "Lot LRP3H07 · date limite 03/2027 (4 mois). Seuil chaîne : 9 mois pour les solaires.", def: "accept" },
      { id: "r5", pid: "q4", vi: 0, kind: "Prix d'achat", tone: "info", detail: "Coût HT 178,00 → 184,50 DH (+3,7 %) · nouveau tarif L'Oréal du 01/11.", def: "accept", cost: 184.5 },
    ],
    split: [["q1", 0, [40, 30, 20, 28]], ["q1", 1, [10, 8, 6, 6]], ["q4", 0, [12, 8, 6, 6]]],
  };
  const DEC = [["accept", "Accepter"], ["refuse", "Refuser"], ["claim", "Réclamation"]];

  function Reception() {
    const s = APO.use(); const st = s.para; const r = st.recv;
    const setDec = (id, v) => APO.setV((c) => ({ recv: { ...c.recv, dec: { ...c.recv.dec, [id]: v } } }));
    const claims = RECV.rows.filter((x) => r.dec[x.id] === "claim").length; const refused = RECV.rows.filter((x) => r.dec[x.id] === "refuse").length;
    const confirm = () => {
      APO.setV((c) => {
        let stock = c.stock; const transfers = c.transfers.slice();
        // Goods land at the warehouse, then the split creates one shuttle transfer per shop
        RECV.split.forEach(([pid, vi, q]) => { const tot = q.reduce((a, b) => a + b, 0); stock = stockMove(stock, pid, vi, "dc", tot); q.forEach((n, k) => { if (n > 0) transfers.unshift({ ...newTransfer({ transfers }, pid, vi, n, "dc", SHOPS[k].id, `Répartition ${RECV.bl}`), st: 0 }); }); });
        if (c.recv.dec.r3 === "refuse") stock = stockMove(stock, "q4", 0, "dc", -1);
        const cost = c.recv.dec.r5 === "accept" ? { ...c.cost, q4: 184.5 } : c.cost;
        return { stock, transfers, cost, recv: { ...c.recv, done: true }, pos: c.pos.map((o) => (o.id === RECV.po ? { ...o, st: 4, note: `Réceptionné · ${claims} réclamation(s) REC-LOR-0118` } : o)) };
      });
      APO.toast("Réception validée", `${RECV.ok} lignes conformes + ${RECV.rows.length} écarts traités · ${claims} réclamation(s) · stock du dépôt à jour, ${RECV.split.length * 4} transferts créés vers les boutiques.`, "check");
      APO.log(`Réception ${RECV.bl} validée au dépôt · réclamation REC-LOR-0118 (${claims} ligne(s)) · ${refused} refus`, "ok");
      if (r.dec.r5 === "accept") APO.log("Prix d'achat Minéral 89 mis à jour : 184,50 DH HT (marge recalculée)", "info");
    };
    if (r.done) return html`<div className="card card-b empty">Aucune réception en attente. La livraison ${RECV.bl} a été validée : stock du dépôt à jour, transferts vers les boutiques créés.</div>`;
    return html`<div className="split rev">
      <${Card} title=${RECV.bl + " · L'Oréal Cosmétique Active"} sub=${RECV.lines + " lignes · livraison centrale au dépôt"} right=${html`<${Badge} tone="warn">${RECV.rows.length} écarts</${Badge}>`} pad=${false}>
        <div className="card-b small muted" style=${{ borderBottom: "1px solid var(--line)" }}><${Icon} n="check" s=${14} /> ${RECV.ok} lignes conformes au scan, masquées. Seuls les écarts demandent une décision.</div>
        <table className="tbl"><tbody>${RECV.rows.map((x) => { const p = pp(x.pid); return html`<tr key=${x.id}><td style=${{ minWidth: 180 }}><b>${p.range}</b><div className="faint small">${vName(p, x.vi)}</div></td><td><${Badge} tone=${x.tone}>${x.kind}</${Badge}></td><td className="small">${x.detail}${x.cost ? html`<div className="faint">Marge au prix actuel : ${APO.n2(marginAt(vPrice(p, x.vi), p.cost))} % → ${APO.n2(marginAt(vPrice(p, x.vi), x.cost))} %</div>` : null}</td>
          <td className="r"><div className="pill-toggle">${DEC.map((d) => html`<button key=${d[0]} className=${r.dec[x.id] === d[0] ? "on" : ""} onClick=${() => setDec(x.id, d[0])}>${d[1]}</button>`)}</div></td></tr>`; })}</tbody></table>
        <div className="card-b" style=${{ borderTop: "1px solid var(--line)" }}>
          <div className="row" style=${{ marginBottom: 8 }}><b>Répartition de la livraison centrale</b><span className="faint small">dépôt → boutiques · navette de ce soir</span></div>
          <table className="tbl"><thead><tr><th>Variante</th>${SHOPS.map((x) => html`<th key=${x.id} className="r">${x.short}</th>`)}<th className="r">Total</th></tr></thead>
            <tbody>${RECV.split.map(([pid, vi, q]) => html`<tr key=${pid + vi}><td>${pp(pid).range} · ${vName(pp(pid), vi)}</td>${q.map((n, k) => html`<td key=${k} className="r mono">${n}</td>`)}<td className="r mono"><b>${q.reduce((a, b) => a + b, 0)}</b></td></tr>`)}</tbody></table>
          <p className="small faint" style=${{ marginTop: 6 }}>Proposée selon les ventes des 4 dernières semaines et la promo en cours. Modifiable boutique par boutique.</p>
        </div>
      </${Card}>
      <div className="col">
        <div className="adv info"><div className="ic"><${Icon} n="shield" s=${16} /></div><span className="src">Réception</span><b>Le distributeur ne modifie jamais votre stock seul</b><p>Le BL arrive en réception en attente. Seule votre validation met à jour le stock du dépôt, le prix d'achat et le solde fournisseur.</p></div>
        <${Card} title="Ce qui sera fait">
          <div className="col small" style=${{ gap: 6 }}>
            <div className="row"><${Icon} n="box" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>Stock du dépôt mis à jour (${RECV.ok} lignes + écarts acceptés)</span></div>
            <div className="row"><${Icon} n="truck" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>${RECV.split.length * 4} transferts vers les 4 boutiques</span></div>
            <div className="row"><${Icon} n="alert" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>${claims} réclamation(s) et ${refused} refus envoyés à L'Oréal</span></div>
            ${r.dec.r5 === "accept" && html`<div className="row"><${Icon} n="tag" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>Prix d'achat Minéral 89 → 184,50 DH HT</span></div>`}
            ${r.dec.r4 === "accept" && html`<div className="row"><${Icon} n="clock" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>Lot LRP3H07 suivi dans « Fin de saison & péremption »</span></div>`}
          </div>
          <div className="sep"></div>
          <button id="recv-ok" className="btn pri" style=${{ width: "100%", justifyContent: "center" }} onClick=${confirm}><${Icon} n="check" s=${15} />Valider la réception</button>
        </${Card}>
      </div></div>`;
  }

  APO.screens["para:ppurch"] = function Purch() {
    const s = APO.use(); const st = s.para; const tab = st.purchTab || (st.recv.done ? "dist" : "recv"); const setTab = (t) => APO.setV({ purchTab: t });
    const sugg = (d) => {
      const out = [];
      PP.filter((p) => d.brands.includes(p.brand)).forEach((p) => p.variants.forEach((v, i) => { const tot = sumStock(st, p.id, i); if (tot < 40) { const qty = Math.ceil((72 - tot) / 12) * 12; out.push({ p, i, qty, amount: qty * vCost(p, i) }); } }));
      const extra = st.topup[d.id] || 0;
      if (extra) { const p = PP.find((x) => x.brand === d.brands[0]); out.push({ p, i: 0, qty: extra * 6, amount: extra * 6 * vCost(p, 0), topup: true }); }
      return out;
    };
    const order = (d, lines, total) => {
      if (!lines.length) { APO.toast("Rien à commander", "Toutes les variantes ont plus de 40 unités sur la chaîne."); return; }
      if (s.offline) { APO.toast("Hors ligne", "Le bon de commande partira au retour du réseau (file du connecteur).", "wifi"); }
      APO.setV((c) => ({ topup: { ...c.topup, [d.id]: 0 }, pos: [{ id: "BC-MAA-03" + (14 + c.pos.length - 3), dist: d.id, lines: lines.length, total, st: 1, t: TODAY, note: total < d.min ? "Sous le minimum · frais de port 150 DH" : "Livraison au dépôt central · " + d.free }, ...c.pos] }));
      APO.toast("Bon de commande envoyé", `${d.name} · ${lines.length} ligne(s) · ${APO.dh(total)}`, "send"); APO.log(`Bon de commande envoyé à ${d.name} · ${APO.dh(total)}`, "ok");
    };
    const done = DIST.reduce((a, d) => a + d.rfa.done, 0);
    const rfaNow = DIST.reduce((a, d) => a + (d.rfa.done >= d.rfa.target ? d.rfa.done : d.rfa.done * 0.6) * d.rfa.rate / 100, 0);
    const rfaMax = DIST.reduce((a, d) => a + d.rfa.target * d.rfa.rate / 100, 0);
    return html`<div>
      <${APO.PageH} title="Achats marques" sub="Commandes directes aux distributeurs des marques (pas aux grossistes pharmaceutiques), livrées au dépôt central : minimums, gratuités, conditions de paiement et remises de fin d'année (RFA)." />
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Achats depuis janvier" value=${APO.dh(done)} delta="5 distributeurs · ≈ 790 000 DH/mois" />
        <${APO.Kpi} label="RFA estimée 2026" value=${APO.dh(rfaNow)} delta=${"si tous les paliers sont atteints : " + APO.dh(rfaMax)} tone="up" />
        <${APO.Kpi} label="Commandes ouvertes" value=${st.pos.filter((p) => p.st < 4).length} delta=${APO.dh(st.pos.filter((p) => p.st < 4).reduce((a, p) => a + p.total, 0))} />
        <${APO.Kpi} label="Échéances à 30 j" value=${APO.dh(189400)} delta="L'Oréal 112 000 · Avène 77 400" />
      </div>
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "recv", label: "Réception en attente", count: st.recv.done ? 0 : 1 }, { id: "dist", label: "Distributeurs", count: DIST.length }, { id: "po", label: "Bons de commande", count: st.pos.length }]} />
      ${tab === "recv" && html`<${Reception} />`}
      ${tab === "dist" && html`<div className="grid g2" style=${{ marginBottom: 16 }}>${DIST.map((d) => { const lines = sugg(d); const total = lines.reduce((a, l) => a + l.amount, 0); const under = lines.length && total < d.min; const rp = pct(d.rfa.done, d.rfa.target); return html`<div key=${d.id} className="card">
        <div className="card-h"><div className="mk-ic"><${Icon} n="truck" s=${18} /></div><div style=${{ minWidth: 0 }}><h3>${d.name}</h3><span className="sub">${d.brands.join(" · ")} · ${d.rep}</span></div></div>
        <div className="card-b col">
          <div className="grid g3" style=${{ gap: 8, gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
            <div><div className="faint small">Minimum</div><b className="mono">${APO.dh(d.min)}</b></div>
            <div><div className="faint small">Gratuités</div><span className="small">${d.free}</span></div>
            <div><div className="faint small">Paiement</div><span className="small">${d.terms}</span></div>
          </div>
          <div><div className="row small" style=${{ marginBottom: 4 }}><span className="muted">RFA ${APO.n2(d.rfa.rate).replace(",00", "")} % · ${APO.int(d.rfa.done)} / ${APO.int(d.rfa.target)} DH</span><span className="spacer"></span><b style=${{ color: rp >= 90 ? "var(--ok)" : "" }}>${Math.round(rp)} %</b></div><div className="bar"><i style=${{ width: rp + "%", background: rp >= 90 ? "var(--ok)" : "" }}></i></div><div className="faint small" style=${{ marginTop: 3 }}>Reste ${APO.dh(d.rfa.target - d.rfa.done)} avant le palier · clôture 31/12</div></div>
          ${lines.length ? html`<div className="draft">${lines.map((l, k) => html`<div key=${k} className="dl"><div><b>${l.p.range} · ${vName(l.p, l.i)}</b><div className="faint small">${l.topup ? "Complément au minimum" : "Chaîne + dépôt : " + sumStock(st, l.p.id, l.i) + " unités"}</div></div><span className="mono">× ${l.qty}</span><span className="mono">${APO.n2(l.amount)}</span></div>`)}</div>` : html`<p className="small faint">Aucune variante sous le seuil de 40 unités sur la chaîne.</p>`}
          <div className="row">${under ? html`<${Badge} tone="warn">Sous le minimum · −${APO.dh(d.min - total)}</${Badge}><button className="btn sm ghost" onClick=${() => { const p = PP.find((x) => x.brand === d.brands[0]); APO.setV((c) => ({ topup: { ...c.topup, [d.id]: (c.topup[d.id] || 0) + Math.ceil((d.min - total) / (6 * vCost(p, 0))) } })); APO.toast("Commande complétée", `Ajout de ${p.range} ${vName(p, 0)} pour atteindre le minimum.`); }}>Compléter</button>` : lines.length ? html`<${Badge} tone="ok">Minimum atteint</${Badge}>` : null}<span className="spacer"></span><b className="mono">${APO.dh(total)}</b><button className="btn pri sm" disabled=${!lines.length} onClick=${() => order(d, lines, total)}><${Icon} n="send" s=${13} />Commander</button></div>
        </div></div>`; })}</div>`}
      ${tab === "po" && html`<${Card} title="Bons de commande" pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>N°</th><th>Distributeur</th><th className="r">Lignes</th><th className="r">Montant HT</th><th style=${{ minWidth: 340 }}>Suivi</th><th>Note</th></tr></thead>
        <tbody>${st.pos.map((o) => html`<tr key=${o.id}><td className="mono">${o.id}<div className="faint small">${o.t}</div></td><td>${DIST.find((d) => d.id === o.dist).name}</td><td className="r mono">${o.lines}</td><td className="r mono">${APO.n2(o.total)}</td><td><${Steps} steps=${PO_STEPS} at=${o.st} /></td><td className="small muted">${o.note}${o.st === 3 && html` <button className="btn sm" onClick=${() => setTab("recv")}>Réceptionner</button>`}</td></tr>`)}</tbody></table></div></${Card}>`}
    </div>`;
  };

  /* ---------------- PROMOTIONS ---------------- */
  const CLAIM_BASE = { lor: 6592, naos: 6109 }; // brand-funded share accrued this month before the demo
  function BrandClaims() {
    const s = APO.use(); const st = s.para; const so = APO.installed(s, "sellout"); const lc = APO.installed(s, "lor.connect");
    const live = {}; st.sales.filter((x) => !x.seed && x.brandFund).forEach((x) => x.brandFund.forEach((b) => { if (b.dist) live[b.dist] = (live[b.dist] || 0) + b.amount; }));
    const rows = DIST.map((d) => ({ d, rules: rulesOf(st, s).filter((r) => r.dist === d.id && r.brand > 0), due: (CLAIM_BASE[d.id] || 0) + (live[d.id] || 0) })).filter((x) => x.due > 0 || x.rules.length);
    const claim = (d, due) => { const ref = `RA-${d.id.toUpperCase()}-2611-0${3 + Object.keys(st.claims).length}`; APO.setV((c) => ({ claims: { ...c.claims, [d.id]: { ref, t: APO.now(), amount: due } } })); APO.toast("Avoir réclamé", `${d.name} · ${APO.dh(due)} · ${ref}${so ? " · preuve sell-out jointe" : ""}`, "receipt"); APO.log(`Créance marque réclamée à ${d.name} : ${APO.dh(due)} (${ref})`, "ok"); };
    return html`<${Card} title="Créances marques" sub="part des remises financée par les marques · novembre" pad=${false} right=${html`<${Badge} tone="acc">${APO.dh(rows.reduce((a, x) => a + x.due, 0))} à recevoir</${Badge}>`}>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Distributeur · promotions financées</th><th className="r">Part due</th><th>Preuve</th><th></th></tr></thead>
        <tbody>${rows.map(({ d, rules, due }) => { const c = st.claims[d.id]; return html`<tr key=${d.id}><td><b>${d.brands.join(" · ")}</b><div className="faint small">${rules.map((r) => r.name + " (marque " + r.brand + " %)").join(" · ") || "—"}</div></td><td className="r mono">${APO.n2(due)}</td>
          <td>${so || (lc && d.id === "lor") ? html`<${Badge} tone="ok">Sell-out joint</${Badge}>` : html`<${Badge} tone="warn">Export manuel</${Badge}>`}</td>
          <td className="r">${c ? html`<${Badge} tone="ok">Demandé · ${c.ref}</${Badge}>` : html`<button className="btn sm pri" onClick=${() => claim(d, due)}>Réclamer l'avoir</button>`}</td></tr>`; })}</tbody></table></div>
      <div className="card-b small faint" style=${{ borderTop: "1px solid var(--line)" }}>Chaque remise encaissée mémorise sa part marque. ${so ? "Le rapport sell-out (agrégats, aucune donnée cliente) est joint automatiquement." : "Installez « Sell-out marques » pour joindre automatiquement la preuve des ventes."}</div></${Card}>`;
  }

  function StackTest() {
    const s = APO.use(); const st = s.para;
    const basket = [{ pid: "q1", vi: 0, qty: 2 }, { pid: "q4", vi: 0, qty: 1 }, { pid: "q2", vi: 1, qty: 1 }];
    const ev = promoEval(st, s, basket, rulesOf(st, s).filter((r) => r.active || ruleState(r) === "scheduled"));
    const sub = basket.reduce((a, l) => a + vPrice(pp(l.pid), l.vi) * l.qty, 0);
    return html`<${Card} title="Test de cumul" sub="panier type, Black Friday simulé comme s'il était actif">
      <div className="small muted" style=${{ marginBottom: 8 }}>2 × Anthelios 50 ml · 1 × Minéral 89 · 1 × Couvrance 2.0 · ${APO.dh(sub)}</div>
      <table className="tbl"><tbody>
        ${ev.lines.map((x) => html`<tr key=${x.id}><td><${Icon} n="check" s=${14} /> ${x.label}</td><td className="r mono" style=${{ color: "var(--ok)" }}>− ${APO.n2(x.amount)}</td></tr>`)}
        ${ev.skipped.map((x) => html`<tr key=${"k" + x.id}><td className="muted"><${Icon} n="x" s=${14} /> ${x.label} : ignorée sur les articles déjà remisés par « ${x.by} »</td><td className="r faint small">non cumulable</td></tr>`)}
      </tbody></table>
      <p className="small faint" style=${{ marginTop: 8 }}>Ordre d'évaluation : priorité 1 d'abord. Une règle « non cumulable » ne partage jamais un article avec une autre remise.</p></${Card}>`;
  }

  APO.screens["para:promos"] = function Promos() {
    const s = APO.use(); const st = s.para; const [modal, setModal] = useState(false);
    const upd = (r, patch) => APO.setV((c) => ({ promos: c.promos.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }));
    const toggle = (r) => { upd(r, { active: !r.active }); APO.toast(r.active ? "Promotion mise en pause" : "Promotion activée", r.name + " · poussée aux 4 boutiques par le siège", "tag"); APO.log(`Promotion ${r.active ? "en pause" : "activée"} : ${r.name}`, r.active ? "warn" : "ok"); };
    const rules = rulesOf(st, s).slice().sort((a, b) => (b.plugin ? 1 : 0) - (a.plugin ? 1 : 0));
    return html`<div>
      <${APO.PageH} title="Promotions" sub="Règles signées poussées par le siège et appliquées automatiquement en caisse, avec priorité, règle de cumul et partage du financement entre marque et boutique.">
        <button className="btn pri" onClick=${() => setModal(true)}><${Icon} n="plus" s=${15} />Nouvelle promotion</button></${APO.PageH}>
      <div className="adv acc" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="shield" s=${16} /></div><span className="src">Moteur de promotions</span><b>Chaque règle est une donnée signée, datée et versionnée</b><p>Calculée sur la caisse, même hors ligne. Aucun code tiers en caisse. Les médicaments sont exclus d'office, quelle que soit la portée choisie.</p></div>
      <div className="grid g2" style=${{ marginBottom: 16 }}>${rules.map((r) => { const state = ruleState(r); const fresh = r.plugin && APO.isNew(s, r.plugin); return html`<div key=${r.id} className=${"card" + (fresh ? " fresh" : "")} style=${{ opacity: state === "paused" ? 0.72 : 1, ...(fresh ? { borderColor: "var(--accent)" } : null) }}>
        <div className="card-h"><div className="mk-ic"><${Icon} n=${r.plugin ? "link" : "tag"} s=${18} /></div><div style=${{ minWidth: 0 }}><h3>${r.name} ${fresh ? html`<${NewTag} />` : null}</h3><span className="sub">${r.scope}${r.plugin ? " · fourni par le partenaire L'Oréal" : ""}</span></div><div className="r"><div className="pill-toggle"><button className=${r.active ? "on" : ""} onClick=${() => !r.active && toggle(r)}>Active</button><button className=${!r.active ? "on" : ""} onClick=${() => r.active && toggle(r)}>${state === "scheduled" || (!r.active && futureDate(r.from)) ? "Programmée" : "Pause"}</button></div></div></div>
        <div className="card-b col">
          <div className="row"><${Badge} tone="acc">${ruleLabel(r)}</${Badge}><${Badge} mono>${r.from || "—"} → ${r.until}</${Badge}><${Badge} tone=${state === "scheduled" ? "info" : ""}>${state === "scheduled" ? "Programmée · démarre le " + r.from : state === "active" ? "Appliquée en caisse" : "En pause"}</${Badge}><span className="spacer"></span><span className="small muted">Utilisations</span><b className="mono" style=${{ fontSize: 18 }}>${APO.int(r.uses)}</b></div>
          <div className="row small"><span className="muted">Cumul</span><div className="pill-toggle"><button className=${!r.excl ? "on" : ""} onClick=${() => upd(r, { excl: false })}>Cumulable</button><button className=${r.excl ? "on" : ""} onClick=${() => upd(r, { excl: true })}>Non cumulable</button></div><span className="spacer"></span><span style=${{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="muted">Priorité</span><select className="input" style=${{ width: 64, padding: "3px 6px" }} value=${r.prio || 5} onChange=${(e) => upd(r, { prio: +e.target.value })}>${[1, 2, 3, 4, 5].map((n) => html`<option key=${n} value=${n}>${n}</option>`)}</select></span></div>
          <div><div className="row small" style=${{ marginBottom: 4 }}><span className="muted">Financement</span><span className="spacer"></span><span>${fund(r.brand)}</span></div>
            <div style=${{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--line)" }}><i style=${{ width: r.brand + "%", background: "var(--accent)" }}></i><i style=${{ width: 100 - r.brand + "%", background: "var(--line-2)" }}></i></div>
            <div className="row small faint" style=${{ marginTop: 3 }}><span><span style=${{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--accent)", marginRight: 5 }}></span>Marque</span><span><span style=${{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--line-2)", marginRight: 5 }}></span>Boutique</span><span className="spacer"></span><span>Portée : ${r.pids.length} gamme(s) · para uniquement</span></div></div>
          ${r.plugin && html`<div className="small faint"><${Icon} n="shield" s=${13} /> Pack signé par la marque · ${r.sig} · conditions : la marque rembourse 70 % de la remise sur preuve de sell-out</div>`}
        </div></div>`; })}</div>
      <div className="grid g2"><${BrandClaims} /><${StackTest} /></div>
      ${modal && html`<${PromoModal} onClose=${() => setModal(false)} />`}
    </div>`;
  };

  function PromoModal({ onClose }) {
    const s = APO.use(); const st = s.para;
    const scopes = [{ v: "visage", label: "Catégorie Visage (4 gammes)", pids: VISAGE }, ...PP.filter((p) => !p.banned).map((p) => ({ v: p.id, label: `${p.brand} · ${p.range}`, pids: [p.id] }))];
    const [f, setF] = useState({ name: "", type: "nth", val: 30, scope: "q5", from: "2026-11-14", to: "2026-11-30", brand: 50, excl: false, prio: 4 });
    const sc = scopes.find((x) => x.v === f.scope);
    const fmt = (d) => d.split("-").reverse().slice(0, 2).join("/");
    const rule = f.type === "nth" ? { n: 2, pct: +f.val } : f.type === "xfory" ? { x: 3, y: 2 } : f.type === "pct" ? { pct: +f.val } : { pct: +f.val, min: 400 };
    const name = f.name || `${sc.label.split(" · ").pop()} : ${ruleLabel({ type: f.type, ...rule })}`;
    const create = () => {
      APO.setV((c) => ({ promos: [{ id: "pr" + (c.promos.length + 1) + APO.uid().slice(0, 2), name, rule: ruleLabel({ type: f.type, ...rule }), scope: sc.label, pids: sc.pids, type: f.type, ...rule, brand: +f.brand, from: fmt(f.from), until: fmt(f.to), active: true, uses: 0, excl: !!f.excl, prio: +f.prio }, ...c.promos] }));
      APO.toast("Promotion créée", `${name} · signée et poussée aux 4 boutiques`, "tag"); APO.log(`Nouvelle promotion : ${name} (${fund(+f.brand)})`, "ok"); onClose();
    };
    return html`<${APO.Modal} onClose=${onClose}><div className="card-h"><${Icon} n="tag" /><h3>Nouvelle promotion</h3></div>
      <div className="card-b col">
        <label className="field">Nom affiché en caisse<input id="pr-name" className="input" placeholder=${name} value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid g2" style=${{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label className="field">Type de règle<select className="input" value=${f.type} onChange=${(e) => setF({ ...f, type: e.target.value })}><option value="nth">2ᵉ article à −X %</option><option value="xfory">3 pour 2</option><option value="pct">Remise simple −X %</option><option value="threshold">−X % dès 400 DH</option></select></label>
          <label className="field">Valeur (%)<input type="number" className="input mono" disabled=${f.type === "xfory"} value=${f.type === "xfory" ? "" : f.val} onInput=${(e) => setF({ ...f, val: e.target.value })} /></label>
        </div>
        <label className="field">Portée<select className="input" value=${f.scope} onChange=${(e) => setF({ ...f, scope: e.target.value })}>${scopes.map((x) => html`<option key=${x.v} value=${x.v}>${x.label}</option>`)}</select></label>
        <div className="grid g3" style=${{ gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <label className="field">Début<input type="date" className="input" value=${f.from} onInput=${(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="field">Fin<input type="date" className="input" value=${f.to} onInput=${(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="field">Part marque<select className="input" value=${f.brand} onChange=${(e) => setF({ ...f, brand: e.target.value })}>${[0, 30, 50, 70, 100].map((b) => html`<option key=${b} value=${b}>${b} %</option>`)}</select></label>
        </div>
        <div className="grid g2" style=${{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label className="field">Cumul<select className="input" value=${f.excl ? "1" : "0"} onChange=${(e) => setF({ ...f, excl: e.target.value === "1" })}><option value="0">Cumulable avec les autres promotions</option><option value="1">Non cumulable</option></select></label>
          <label className="field">Priorité<select className="input" value=${f.prio} onChange=${(e) => setF({ ...f, prio: e.target.value })}>${[1, 2, 3, 4, 5].map((n) => html`<option key=${n} value=${n}>${n}${n === 1 ? " (la plus forte)" : ""}</option>`)}</select></label>
        </div>
        <div className="adv info"><div className="ic"><${Icon} n="shield" s=${16} /></div><span className="src">Garde de classe produit</span><b>Médicaments exclus d'office</b><p>La règle ne s'applique qu'aux produits para (TVA 20 %, sans AMM). Aperçu : ${name} · ${fund(+f.brand)}.</p></div>
        <div className="row" style=${{ justifyContent: "flex-end" }}><button className="btn ghost" onClick=${onClose}>Annuler</button><button className="btn pri" onClick=${create}><${Icon} n="check" s=${15} />Créer et publier</button></div>
      </div></${APO.Modal}>`;
  }

  /* ---------------- CLIENTS & LOYALTY ---------------- */
  APO.screens["para:clients"] = function Clients() {
    const s = APO.use(); const st = s.para; const [open, setOpen] = useState(null); const c = open && D.paraCustomers.find((x) => x.id === open);
    const next = c && SKIN[c.skin] && pp(SKIN[c.skin].pid);
    const send = () => {
      if (!c.optin) { APO.toast("Envoi impossible", `${c.name} n'a pas donné son accord marketing (CNDP). Proposez-le au prochain passage.`, "lock"); return; }
      APO.setV((x) => ({ offers: { ...x.offers, [c.id]: APO.now() } }));
      APO.toast("Offre envoyée par WhatsApp", `${c.name} · −15 % sur ${next ? next.range : "sa routine"} · valable 7 jours`, "send"); APO.log(`Fidélité : offre envoyée à ${c.name} (opt-in)`, "ok");
    };
    return html`<div>
      <${APO.PageH} title="Clientes & fidélité" sub="Une carte unique dans les 4 boutiques. Profils hébergés et traités au Maroc, consentement marketing explicite.">
        <button className="btn" onClick=${() => APO.toast("Export lancé", "Demande d'accès CNDP · toutes les données d'une cliente en un fichier.", "download")}><${Icon} n="download" s=${15} />Droit d'accès</button></${APO.PageH}>
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Membres" value="1 842" delta="+64 ce mois" tone="up" />
        <${APO.Kpi} label="Taux de fidélité" value="62 %" delta="des tickets avec carte" />
        <${APO.Kpi} label="Points en circulation" value=${APO.int(184200 + Object.values(st.points).reduce((a, b) => a + b, 0))} delta="≈ 18 650 DH de remises" />
        <${APO.Kpi} label="Opt-in marketing" value="71 %" delta="consentement daté (CNDP)" tone="up" />
      </div>
      <${Card} pad=${false}><table className="tbl"><thead><tr><th>Cliente</th><th>Palier</th><th>Type de peau</th><th className="r">Points</th><th className="r">Dépense 12 mois</th><th>Dernière visite</th><th>Opt-in</th></tr></thead>
        <tbody>${D.paraCustomers.map((x) => html`<tr key=${x.id} className="click" onClick=${() => setOpen(x.id)}><td><div className="row"><div className="avatar">${x.initials}</div><b>${x.name}</b></div></td><td><${Badge} tone=${tierTone(x.tier)}>${x.tier}</${Badge}></td><td className="small">${x.skin}</td><td className="r mono">${APO.int(st.points[x.id])}</td><td className="r mono">${APO.n2(x.spend)}</td><td className="small muted">${x.last}</td><td>${x.optin ? html`<${Badge} tone="ok">Oui</${Badge}>` : html`<${Badge}>Non</${Badge}>`}</td></tr>`)}</tbody></table></${Card}>
      ${c && html`<${APO.Drawer} title=${c.name} icon=${html`<div className="avatar">${c.initials}</div>`} onClose=${() => setOpen(null)} footer=${html`<button className="btn" onClick=${() => { APO.setV({ customer: c.id, redeem: 0 }); APO.go("pcounter"); APO.toast("Cliente associée à la caisse", c.name, "star"); }}><${Icon} n="scan" s=${15} />Ouvrir en caisse</button><button className="btn pri" disabled=${!c.optin} onClick=${send}><${Icon} n="send" s=${15} />${st.offers[c.id] ? "Offre envoyée · " + st.offers[c.id] : "Envoyer une offre"}</button>`}>
        <div className="row" style=${{ marginBottom: 12 }}><${Badge} tone=${tierTone(c.tier)}>${c.tier}</${Badge}><${Badge}>${c.skin}</${Badge}><${Badge} mono>🇲🇦 MA</${Badge}></div>
        <div className="grid g2" style=${{ marginBottom: 12, gridTemplateColumns: "1fr 1fr" }}><${APO.Kpi} label="Points" value=${APO.int(st.points[c.id])} delta=${"≈ " + APO.dh(Math.floor(st.points[c.id] / 500) * 50) + " de remise"} /><${APO.Kpi} label="Dépense 12 mois" value=${APO.dh(c.spend)} delta=${"dernière visite " + c.last.toLowerCase()} /></div>
        <${Card} title="Routine actuelle"><div className="row">${c.routine.map((r) => html`<${Badge} key=${r} tone="acc">${r}</${Badge}>`)}</div></${Card}>
        <div style=${{ height: 12 }}></div>
        ${next && html`<div className="adv info" style=${{ marginBottom: 12 }}><div className="ic"><${Icon} n="spark" s=${16} /></div><span className="src">Prochain produit suggéré${APO.installed(s, "skin-diag") ? " · Partenaire DermaLab" : " · historique d'achat"}</span><b>${next.brand} ${next.range} · ${APO.dh(next.price)}</b><p>${SKIN[c.skin].why}</p></div>`}
        <${Card} title="Historique d'achats" pad=${false}><table className="tbl"><tbody>${HISTORY[c.id].map((h, i) => html`<tr key=${i}><td className="mono small">${h[0]}</td><td>${h[1]}</td><td className="small muted">${h[3]}</td><td className="r mono">${APO.n2(h[2])}</td></tr>`)}</tbody></table></${Card}>
        <div style=${{ height: 12 }}></div>
        <div className=${"adv " + (c.optin ? "good" : "warn")}><div className="ic"><${Icon} n="lock" s=${16} /></div><span className="src">Pack Maroc · Données personnelles · CNDP ${ORG.cndp}</span><b>${c.optin ? "Consentement marketing donné le 14/03/2026 (WhatsApp, SMS)" : "Pas de consentement marketing"}</b><p>${c.optin ? "Retirable à tout moment par la cliente. Aucun contenu santé dans les messages." : "Les offres sont bloquées. Le programme de points reste actif (intérêt légitime)."}</p></div>
      </${APO.Drawer}>`}
    </div>`;
  };

  /* ---------------- BRANDS & PROMOTERS ---------------- */
  APO.screens["para:brands"] = function Brands() {
    const s = APO.use(); const st = s.para; const so = APO.installed(s, "sellout");
    const maxCa = Math.max(...BRANDPERF.map((b) => b[1])); const totCa = BRANDPERF.reduce((a, x) => a + x[1], 0);
    const checkIn = (p, i) => { APO.setV((c) => ({ promoterIn: { ...c.promoterIn, [i]: APO.now() }, promoterOut: { ...c.promoterOut, [i]: null } })); APO.toast(p.name + " pointée", p.shop + " · apparaît dans « Vendu par » à la caisse jusqu'au départ.", "badge"); APO.log(`Animatrice ${p.name} pointée (${p.shop})`, "info"); };
    const checkOut = (p, i) => { APO.setV((c) => ({ promoterOut: { ...c.promoterOut, [i]: APO.now() }, seller: c.seller === "p" + i ? "u2" : c.seller })); APO.toast(p.name + " : départ pointé", "Les ventes ne lui sont plus attribuées.", "badge"); APO.log(`Animatrice ${p.name} : départ pointé`, "info"); };
    const SHARE = [0.36, 0.26, 0.17];
    return html`<div>
      <${APO.PageH} title="Marques & animatrices" sub="Présence des animatrices, ventes attribuées à la caisse et objectifs ; performance par marque pour préparer les rendez-vous distributeurs." />
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        <${Card} title="Animatrices" sub="aujourd'hui · vendredi 13/11" pad=${false}><table className="tbl"><thead><tr><th>Animatrice</th><th>Boutique</th><th>Jours</th><th>Arrivée</th><th>Départ</th><th></th></tr></thead><tbody>${D.promoters.map((p, i) => { const today = p.days.includes("Ven"); const inT = st.promoterIn[i]; const outT = st.promoterOut[i]; return html`<tr key=${p.name}><td><b>${p.name}</b></td><td>${p.shop}</td><td className="small">${p.days}</td><td className="mono small">${inT || "—"}</td><td className="mono small">${outT || "—"}</td>
          <td className="r">${!today ? html`<span className="faint small">pas aujourd'hui</span>` : !inT || outT ? html`<button className="btn sm" onClick=${() => checkIn(p, i)}>${outT ? "Pointer un retour" : "Pointer l'arrivée"}</button>` : html`<div className="row" style=${{ justifyContent: "flex-end", gap: 6 }}><${Badge} tone="ok">Présente</${Badge}><button className="btn sm ghost" onClick=${() => checkOut(p, i)}>Pointer le départ</button></div>`}</td></tr>`; })}</tbody></table>
          <div className="card-b small faint" style=${{ borderTop: "1px solid var(--line)" }}>Une animatrice pointée apparaît dans « Vendu par » sur le ticket de sa boutique. Seules les lignes de sa marque lui sont attribuées.</div></${Card}>
        <${Card} title="Ventes attribuées vs objectif" sub="novembre · DH TTC">
          <div className="hbars">${D.promoters.map((p, i) => { const tot = p.sales + (st.promoterSales[i] || 0); const r = (tot / p.target) * 100; return html`<div key=${p.name} className="hb"><span>${p.name.split(" ")[0]} · ${p.shop}</span><div><i style=${{ width: Math.min(100, r) + "%", background: r >= 100 ? "var(--ok)" : "" }}></i></div><span className="mono" style=${{ textAlign: "right", color: r >= 100 ? "var(--ok)" : "" }}>${Math.round(r)} %</span></div>`; })}</div>
          <div className="sep"></div>
          <table className="tbl"><tbody>${D.promoters.map((p, i) => html`<tr key=${p.name}><td className="small">${p.name}${st.promoterSales[i] ? html` <${Badge} tone="ok">+${APO.n2(st.promoterSales[i])} aujourd'hui</${Badge}>` : null}</td><td className="r mono small">${APO.int(Math.round(p.sales + (st.promoterSales[i] || 0)))} / ${APO.int(p.target)}</td></tr>`)}</tbody></table>
        </${Card}>
      </div>
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        <${Card} title="Performance par marque" sub="novembre · 4 boutiques">
          <div className="hbars">${BRANDPERF.map((b) => html`<div key=${b[0]} className="hb"><span>${b[0]}</span><div><i style=${{ width: (b[1] / maxCa) * 100 + "%" }}></i></div><span className="mono" style=${{ textAlign: "right" }}>${APO.int(b[1])}</span></div>`)}</div>
        </${Card}>
        <${Card} title="Détail" pad=${false}><table className="tbl"><thead><tr><th>Marque</th><th className="r">Unités</th><th className="r">Marge HT</th><th className="r">Part</th></tr></thead><tbody>${BRANDPERF.map((b) => html`<tr key=${b[0]}><td>${b[0]}</td><td className="r mono">${b[2]}</td><td className="r"><${Badge} tone=${b[3] >= 23 ? "ok" : b[3] < 19 ? "warn" : ""}>${APO.n2(b[3])} %</${Badge}></td><td className="r mono">${APO.n2((b[1] / totCa) * 100)} %</td></tr>`)}</tbody></table>
          <div className="card-b small faint" style=${{ borderTop: "1px solid var(--line)" }}>Les remises de fin d'année (RFA) se suivent dans Achats marques ; les créances de promotions dans Promotions.</div></${Card}>
      </div>
      ${so ? html`<${Card} title="Sell-out marques" sub="agrégats par marque, EAN et boutique · jamais de données clientes" right=${html`<button className="btn sm pri" onClick=${() => { APO.setV({ selloutSent: true }); APO.toast("Rapports sell-out envoyés", "7 marques · portails distributeurs · journalisé.", "chart"); APO.log("Sell-out : rapports novembre envoyés à 7 marques", "ok"); }}><${Icon} n="send" s=${13} />${st.selloutSent ? "Renvoyer" : "Envoyer aux marques"}</button>`} pad=${false}>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Marque</th>${SHOPS.map((x) => html`<th key=${x.id} className="r">${x.short}</th>`)}<th className="r">Unités</th><th>Statut</th></tr></thead>
            <tbody>${BRANDPERF.map((b) => { const q = SHARE.map((f) => Math.round(b[2] * f)); q.push(b[2] - q.reduce((a, x) => a + x, 0)); return html`<tr key=${b[0]}><td>${b[0]}</td>${q.map((n, k) => html`<td key=${k} className="r mono">${n}</td>`)}<td className="r mono"><b>${b[2]}</b></td><td>${st.selloutSent ? html`<${Badge} tone="ok">Envoyé</${Badge}>` : html`<${Badge}>Prêt</${Badge}>`}</td></tr>`; })}</tbody></table></div>
          <div className="card-b small faint" style=${{ borderTop: "1px solid var(--line)" }}>Consentement de la chaîne par marque · aucune donnée cliente, aucun ticket individuel · accès consultable dans le journal du marketplace.</div></${Card}>`
        : html`<div className="adv acc"><div className="ic"><${Icon} n="chart" s=${16} /></div><span className="src">Plugin disponible · Sell-out</span><b>Envoyez le sell-out aux marques en un clic</b><p>Rapports par marque, EAN et boutique vers les portails distributeurs : souvent exigés pour les RFA et le financement des promotions. Agrégats uniquement, jamais de données clientes.</p><div className="acts" style=${{ gridColumn: 2 }}><button className="btn sm pri" onClick=${() => APO.go("market")}>Voir dans le marketplace</button></div></div>`}
    </div>`;
  };

  /* ---------------- SOCIAL INBOX ---------------- */
  APO.screens["para:inbox"] = function Inbox() {
    const s = APO.use(); const st = s.para; const [sel, setSel] = useState("m1"); const [txt, setTxt] = useState("");
    const m = D.inbox.find((x) => x.id === sel); const th = st.threads[sel]; const p = pp(th.pid); const cust = th.cust && D.paraCustomers.find((c) => c.id === th.cust);
    const here = st.stock[th.pid][th.vi][0]; const res = st.reservations.find((r) => r.thread === sel);
    const say = (x) => APO.setV((c) => ({ threads: { ...c.threads, [sel]: { ...c.threads[sel], msgs: [...c.threads[sel].msgs, { me: 1, t: APO.now(), x }] } } }));
    const open = (id) => { setSel(id); APO.setV((c) => ({ read: { ...c.read, [id]: true } })); };
    const createOrder = () => { addLine(th.pid, th.vi, "s1", "here"); if (cust) APO.setV({ customer: cust.id }); say(`C'est noté ✅ ${p.range} ${vName(p, th.vi)} · ${APO.n2(vPrice(p, th.vi))} DH. On vous attend en boutique.`); APO.toast("Commande créée à la caisse C01", `${p.range} ${vName(p, th.vi)}${cust ? " · " + cust.name : ""} · ouvrez la caisse pour encaisser`, "bag"); APO.log(`Vente sociale : commande créée depuis ${m.channel} (${m.from})`, "ok"); };
    const payLink = () => { if (!APO.installed(s, "tpe")) { APO.toast("Plugin paiement requis", "Installez « Paiement carte & wallets »."); return; } const code = APO.uid().toUpperCase(); say(`Lien de paiement sécurisé : pay.paraphar-atlas.ma/l/${code} · ${APO.n2(vPrice(p, th.vi))} DH`); APO.toast("Lien de paiement envoyé", `${APO.dh(vPrice(p, th.vi))} · montant et référence uniquement transmis à l'acquéreur`, "link"); APO.log(`Lien de paiement envoyé (${m.channel}) · ${APO.dh(vPrice(p, th.vi))}`, "info"); };
    const reserve = () => { if (here <= 0) { APO.toast("Rupture à Maârif", "Proposez un retrait à Rabat ou Marrakech."); return; } APO.setV((c) => ({ reservations: [...c.reservations, { thread: sel, pid: th.pid, vi: th.vi, until: "20:00" }], stock: { ...c.stock, [th.pid]: c.stock[th.pid].map((v, i) => (i === th.vi ? v.map((q, j) => (j === 0 ? q - 1 : q)) : v)) } })); say(`Réservé à votre nom à Casablanca · Maârif jusqu'à 20:00 : ${p.range} ${vName(p, th.vi)}.`); APO.toast("Réservé en boutique", `${p.range} ${vName(p, th.vi)} · Maârif · jusqu'à 20:00`, "store"); APO.log(`Réservation click & collect : ${p.range} ${vName(p, th.vi)} (${m.from})`, "ok"); };
    return html`<div>
      <${APO.PageH} title="Messages & commandes" sub="WhatsApp et Instagram dans une seule boîte, reliés au stock et à la caisse."><${Badge} tone="info">Contenu santé exclu des modèles · opt-in</${Badge}></${APO.PageH}>
      <div className="grid" style=${{ gridTemplateColumns: "minmax(250px,.75fr) minmax(0,1.6fr)" }}>
        <div className="col">${D.inbox.map((x) => { const unread = st.read[x.id] ? 0 : x.unread; const last = st.threads[x.id].msgs.slice(-1)[0]; return html`<div key=${x.id} className="task" style=${{ cursor: "pointer", borderColor: x.id === sel ? "var(--accent)" : "" }} onClick=${() => open(x.id)}>
          <div className="h"><div className="avatar">${x.from.startsWith("+") ? html`<${Icon} n="msg" s=${14} />` : x.from.split(" ").map((w) => w[0]).join("")}</div><div style=${{ minWidth: 0, flex: 1 }}><b style=${{ fontSize: 13.5 }}>${x.from}</b><div className="small faint">${x.channel} · ${x.time}</div></div>${unread ? html`<span className="badge acc">${unread}</span>` : null}</div>
          <div className="small muted" style=${{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>${last.me ? "Vous : " : ""}${last.x}</div>
          ${x.intent !== "—" && html`<div className="row"><${Badge} tone=${x.intent === "Réservation" ? "acc" : "info"}>${x.intent}</${Badge}></div>`}</div>`; })}</div>
        <div className="card" style=${{ display: "flex", flexDirection: "column", minHeight: 520 }}>
          <div className="card-h"><h3>${m.from}</h3><${Badge} tone=${m.channel === "WhatsApp" ? "ok" : "acc"}>${m.channel}</${Badge}>${cust && html`<${Badge} tone=${tierTone(cust.tier)}>${cust.tier} · ${APO.int(st.points[cust.id])} pts</${Badge}>`}<div className="r">${res && html`<${Badge} tone="ok">Réservé jusqu'à ${res.until}</${Badge}>`}</div></div>
          <div className="card-b" style=${{ flex: 1, display: "grid", gap: 8, alignContent: "start", background: "var(--panel-2)" }}>${th.msgs.map((x, i) => html`<div key=${i} style=${{ justifySelf: x.me ? "end" : "start", maxWidth: "78%", background: x.me ? "var(--accent-soft)" : "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px", fontSize: 13.5 }}>${x.x}<div className="faint" style=${{ fontSize: 10.5, textAlign: "right", marginTop: 2 }}>${x.t}</div></div>`)}</div>
          <div className="card-b" style=${{ borderTop: "1px solid var(--line)", display: "grid", gap: 10 }}>
            <div className="row" style=${{ flexWrap: "nowrap" }}><${Thumb} p=${p} s=${36} /><div style=${{ minWidth: 0, flex: 1 }}><b>${p.range} · ${vName(p, th.vi)}</b><div className="small faint">Produit détecté dans la conversation · Maârif : ${here} en stock</div></div><b className="mono">${APO.n2(vPrice(p, th.vi))}</b></div>
            <div className="row"><button className="btn sm pri" onClick=${createOrder}><${Icon} n="bag" s=${13} />Créer la commande</button><button className="btn sm" onClick=${payLink}><${Icon} n="link" s=${13} />Envoyer un lien de paiement</button><button className="btn sm" disabled=${!!res} onClick=${reserve}><${Icon} n="store" s=${13} />Réserver en boutique</button></div>
            <div className="row" style=${{ flexWrap: "nowrap" }}><input id="inbox-reply" className="input" placeholder="Répondre…" value=${txt} onInput=${(e) => setTxt(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter" && txt.trim()) { say(txt.trim()); setTxt(""); } }} /><button className="btn pri" disabled=${!txt.trim()} onClick=${() => { say(txt.trim()); setTxt(""); }} aria-label="Envoyer"><${Icon} n="send" s=${15} /></button></div>
            <p className="small faint">Modèles de messages validés · contenu santé exclu des modèles · uniquement aux clientes opt-in.</p>
          </div></div>
      </div></div>`;
  };

  /* ---------------- E-COMMERCE CHANNELS ---------------- */
  APO.screens["para:channels"] = function Channels() {
    const s = APO.use(); const st = s.para; const [synced, setSynced] = useState("10:58");
    const pub = PP.filter((p) => !p.banned).flatMap((p) => p.variants.map((v, i) => ({ p, i, v, tot: sumStock(st, p.id, i) })));
    const sync = () => { if (s.offline) { APO.toast("Hors ligne", "Synchronisation reprise automatiquement au retour du réseau.", "wifi"); return; } setSynced(APO.now()); APO.toast("Stock synchronisé", `E-shop et Jumia · ${pub.length} variantes · 0 médicament`, "refresh"); APO.log("E-commerce : stock synchronisé (e-shop, Jumia)", "ok"); };
    const adv = (w) => { APO.setV((c) => ({ web: c.web.map((x) => (x.id === w.id ? { ...x, st: x.st + 1 } : x)) })); APO.toast(`${w.id} : ${WEB_STEPS[w.st + 1]}`, w.items, "bag"); APO.log(`Commande ${w.ch} ${w.id} · ${WEB_STEPS[w.st + 1]}`, "info"); };
    return html`<div>
      <${APO.PageH} title="E-commerce" sub="Boutique en ligne et Jumia branchées sur le même stock que les 4 boutiques. Une vente en ligne réserve le stock de la boutique la plus proche.">
        <button className="btn pri" onClick=${sync}><${Icon} n="refresh" s=${15} />Synchroniser</button></${APO.PageH}>
      <div className="adv veto" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="shield" s=${16} /></div><span className="src">Garde de classe produit</span><b>Les médicaments ne peuvent jamais être publiés en ligne</b><p>Seuls les produits para (sans AMM, TVA 20 %) sont exportables. Cette garde fait partie du socle certifié : aucun plugin ni réglage ne peut la contourner. Les produits interdits par le Pack Maroc sont aussi retirés.</p>
        <div className="acts" style=${{ gridColumn: 2 }}><button className="btn sm" onClick=${() => { APO.toast("Publication refusée", "Doliprane 1000 mg : médicament (AMM 312/16) · garde de classe produit.", "shield"); APO.log("E-commerce : publication refusée (médicament)", "warn"); }}>Essayer de publier un médicament</button></div></div>
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Commandes en ligne · jour" value=${st.web.length + 8} delta="E-shop 7 · Jumia 5" />
        <${APO.Kpi} label="CA en ligne · jour" value=${APO.dh(4210)} delta="10,6 % du CA chaîne" tone="up" />
        <${APO.Kpi} label="Variantes publiées" value=${pub.length} delta="0 médicament · 1 produit bloqué" />
        <${APO.Kpi} label="Dernière synchro" value=${synced} delta="automatique toutes les 5 min" />
      </div>
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        ${[["E-shop · paraphar-atlas.ma", "globe", "Commandes livrées par Amana ou retrait en boutique", "Synchronisé"], ["Jumia Maroc · vendeur Paraphar Atlas", "store", "Stock publié = stock chaîne − 2 de sécurité par variante", "Synchronisé"]].map((c) => html`<div key=${c[0]} className="card"><div className="card-b row" style=${{ flexWrap: "nowrap", gap: 14 }}><div className="mk-ic" style=${{ width: 44, height: 44 }}><${Icon} n=${c[1]} s=${22} /></div><div style=${{ flex: 1, minWidth: 0 }}><b>${c[0]}</b><div className="small muted">${c[2]}</div></div><${Badge} tone=${s.offline ? "warn" : "ok"}>${s.offline ? "En pause" : c[3] + " · " + synced}</${Badge}></div></div>`)}
      </div>
      <div className="grid g2">
        <${Card} title="Commandes en ligne" sub="flux en direct" pad=${false}><table className="tbl"><tbody>${st.web.map((w) => html`<tr key=${w.id}><td><b className="mono" style=${{ fontSize: 12 }}>${w.id}</b><div className="small faint">${w.ch} · ${w.who} · ${w.t}</div><div className="small">${w.items}</div></td><td className="r mono">${APO.n2(w.total)}</td><td className="r">${w.st < 3 ? html`<div className="col" style=${{ gap: 4, justifyItems: "end" }}><${Badge} tone=${w.st === 0 ? "warn" : "info"}>${WEB_STEPS[w.st]}</${Badge}><button className="btn sm" onClick=${() => adv(w)}>→ ${WEB_STEPS[w.st + 1]}</button></div>` : html`<${Badge} tone="ok">Livrée</${Badge}>`}</td></tr>`)}</tbody></table></${Card}>
        <${Card} title="Stock publié" sub="même stock que les boutiques" pad=${false}><div className="tbl-wrap" style=${{ maxHeight: 420, overflow: "auto" }}><table className="tbl"><thead><tr><th>Variante</th><th className="r">Chaîne</th><th className="r">Publié</th><th>Canaux</th></tr></thead><tbody>${pub.map((r) => { const out = Math.max(0, r.tot - 2); return html`<tr key=${r.p.id + r.i}><td><b style=${{ fontWeight: 500 }}>${r.p.range}</b><div className="small faint">${r.v.sw && html`<${Swatch} c=${r.v.sw} s=${10} />`}${r.v.v}</div></td><td className="r mono">${r.tot}</td><td className="r mono">${out}</td><td>${out > 0 ? html`<${Badge} tone="ok">E-shop · Jumia</${Badge}>` : html`<${Badge} tone="warn">Masqué</${Badge}>`}</td></tr>`; })}</tbody></table></div></${Card}>
      </div></div>`;
  };

  /* ---------------- END OF DAY: CLÔTURE DE CAISSE (core.sales) ---------------- */
  function shopStatus(st, id) {
    const c = st.closed[id];
    return c ? { tone: "ok", label: "Clôturée " + c.t, z: c.z } : { tone: "warn", label: "Ouverte depuis " + SHOP_STATUS[id].open, z: null };
  }
  APO.screens["para:cloture"] = function Cloture() {
    const s = APO.use(); const st = s.para; const id = st.shop; const b = BASE[id]; const tpeOn = APO.installed(s, "tpe");
    const live = st.sales.filter((x) => !x.seed && x.shop === id);
    const by = (m) => live.reduce((a, x) => a + x.pays.filter((p) => p.mode === m).reduce((c, p) => c + p.amount, 0), 0);
    const cash = b.cash + by("cash"), card = b.card + by("card"), wallet = b.wallet + by("wallet"), gift = by("gift");
    const rets = st.returns.filter((r) => r.shop === id);
    const cashOut = rets.filter((r) => r.action === "refund" && r.mode === "cash").reduce((a, r) => a + r.amount, 0);
    const cardOut = rets.filter((r) => r.action === "refund" && r.mode === "card").reduce((a, r) => a + r.amount, 0);
    const avoirs = rets.filter((r) => r.action !== "refund").reduce((a, r) => a + r.amount, 0);
    const gcSold = (st.giftIssued || []).filter((g) => g.shop === id); const gcCash = gcSold.filter((g) => g.mode === "cash").reduce((a, g) => a + g.amount, 0); const gcCard = gcSold.filter((g) => g.mode === "card").reduce((a, g) => a + g.amount, 0);
    const cardNet = Math.round((card - cardOut + gcCard) * 100) / 100;
    const [float, setFloat] = useState(st.float); const [counted, setCounted] = useState(""); const [tpe, setTpe] = useState(null); const [note, setNote] = useState("");
    const tpeVal = tpe == null ? cardNet : +tpe;
    const expected = +float + cash - cashOut + gcCash; const variance = counted === "" ? null : +counted - expected; const tpeVar = tpeVal - cardNet;
    const total = cash + card + wallet + gift; const closed = st.closed[id];
    const needNote = variance != null && (Math.abs(variance) >= 20 || Math.abs(tpeVar) >= 0.01);
    const can = variance != null && (!needNote || note.trim().length > 2);
    const sign = () => {
      const z = `Z-${ORG.site}-${ORG.terminal}-2026-${String(st.zSeries + 1).padStart(4, "0")}`; const hash = APO.hash(st.lastHash + z + total.toFixed(2) + variance.toFixed(2));
      APO.setV((c) => ({ zSeries: c.zSeries + 1, lastHash: hash, closed: { ...c.closed, [id]: { z, hash, prev: c.lastHash, t: APO.now(), cash, card, wallet, gift, cashOut, cardOut, avoirs, float: +float, counted: +counted, expected, variance, tpe: tpeVal, tpeVar, tickets: b.tickets + live.length, total, note, returns: rets.length } },
        exceptions: Math.abs(variance) >= 20 ? [{ id: APO.uid(), t: APO.now(), text: `Écart de caisse ${shop(id).short} : ${variance > 0 ? "+" : ""}${APO.n2(variance)} DH à la clôture${note ? " · " + note : ""}`, ref: z }, ...c.exceptions] : c.exceptions }));
      APO.toast("Z signé", `${z} · ${APO.dh(total)} · écart espèces ${APO.n2(variance)} DH`, "lock");
      APO.log(`Clôture ${shop(id).short} : ${z} signé · CA ${APO.dh(total)} · écart ${APO.n2(variance)} DH`, Math.abs(variance) >= 20 ? "warn" : "ok");
    };
    const Row = ({ l, v, strong, tone, sub }) => html`<tr><td className=${strong ? "" : "muted"}>${strong ? html`<b>${l}</b>` : l}${sub && html`<div className="faint small">${sub}</div>`}</td><td className="r mono" style=${{ color: tone || "" }}>${strong ? html`<b>${v}</b>` : v}</td></tr>`;
    return html`<div>
      <${APO.PageH} title="Clôture de caisse" sub=${`${shop(id).name} · caisse ${ORG.terminal} · session ouverte à ${SHOP_STATUS[id].open} · fin de journée`}>
        <button className="btn" onClick=${() => APO.go("pcounter")}><${Icon} n="scan" s=${15} />Retour à la caisse</button></${APO.PageH}>
      <div className="grid g4" style=${{ marginBottom: 16 }}>${SHOPS.map((x) => { const ss = shopStatus(st, x.id); return html`<div key=${x.id} className="card kpi" style=${x.id === id ? { borderColor: "var(--accent)" } : null}><span className="row"><${Icon} n="store" s=${14} />${x.name}</span><b style=${{ fontSize: 18 }}>${APO.dh(shopSalesToday(st, x.id))}</b><em className=${ss.tone === "ok" ? "up" : "muted"}><${Badge} tone=${ss.tone}>${ss.label}</${Badge}> <span className="mono">${SHOP_STATUS[x.id].term}</span></em><span className="faint small">${ss.z ? "Z du jour " + ss.z : "Dernier Z : " + SHOP_STATUS[x.id].lastZ + " (hier)"}</span></div>`; })}</div>
      <p className="small faint" style=${{ marginTop: -8, marginBottom: 16 }}><${Icon} n="building" s=${13} /> Vue siège : chaque boutique clôture sur place ; le siège voit le statut et les écarts en direct.</p>
      ${closed ? html`<div className="split rev">
        <${Card} title=${"Ticket Z · " + closed.z} sub=${"signé à " + closed.t + " par Nadia T."}>
          <div className="receipt">
            <div className="c"><b>${ORG.name.toUpperCase()}</b></div><div className="c">${shop(id).name} · caisse ${ORG.terminal}</div><div className="c">CLÔTURE JOURNALIÈRE · 13/11/2026</div><hr />
            <div className="rr"><span>Tickets</span><span>${closed.tickets}</span></div>
            <div className="rr"><span>Avoirs émis</span><span>${closed.returns}</span></div>
            <div className="rr"><b>CA TTC</b><b>${APO.n2(closed.total)}</b></div>
            <div className="rr"><span>dont TVA 20 %</span><span>${APO.n2(closed.total - closed.total / 1.2)}</span></div><hr />
            <div className="rr"><span>Espèces</span><span>${APO.n2(closed.cash)}</span></div>
            <div className="rr"><span>Carte bancaire</span><span>${APO.n2(closed.card)}</span></div>
            <div className="rr"><span>Wallet QR</span><span>${APO.n2(closed.wallet)}</span></div>
            <div className="rr"><span>Cartes cadeaux</span><span>${APO.n2(closed.gift)}</span></div>
            <div className="rr"><span>Remboursements</span><span>${closed.cashOut + closed.cardOut ? "-" : ""}${APO.n2(closed.cashOut + closed.cardOut)}</span></div>
            <div className="rr"><span>Avoirs (échanges, bons)</span><span>${closed.avoirs ? "-" : ""}${APO.n2(closed.avoirs)}</span></div>
            <div className="rr"><b>CA net des avoirs</b><b>${APO.n2(closed.total - closed.avoirs - closed.cashOut - closed.cardOut)}</b></div><hr />
            <div className="rr"><span>Fond de caisse</span><span>${APO.n2(closed.float)}</span></div>
            <div className="rr"><span>Espèces attendues</span><span>${APO.n2(closed.expected)}</span></div>
            <div className="rr"><span>Espèces comptées</span><span>${APO.n2(closed.counted)}</span></div>
            <div className="rr"><b>Écart</b><b>${closed.variance > 0 ? "+" : ""}${APO.n2(closed.variance)}</b></div>
            <div className="rr"><span>TPE vs caisse</span><span>${APO.n2(closed.tpeVar)}</span></div>
            ${closed.note && html`<div className="rr"><span>Justification</span><span>${closed.note}</span></div>`}<hr />
            <div className="rr"><span>N°</span><span>${closed.z}</span></div>
            <div className="rr"><span>Chaîne</span><span>${closed.prev} → ${closed.hash}</span></div>
          </div></${Card}>
        <div className="col"><div className="adv good"><div className="ic"><${Icon} n="lock" s=${16} /></div><span className="src">Clôture signée</span><b>Journée scellée dans la chaîne d'intégrité</b><p>Le Z est numéroté dans la série de la caisse et chaîné au dernier ticket. Les ventes suivantes ouvrent une nouvelle session.</p></div>
          <button className="btn" onClick=${() => APO.toast("Z imprimé", closed.z + " · copie envoyée au siège")}><${Icon} n="printer" s=${15} />Imprimer le Z</button></div>
      </div>` : html`<div className="split rev">
        <${Card} title="Comptage" sub="espèces attendues vs comptées · cartes vs TPE" pad=${false}><table className="tbl"><tbody>
          <tr><td className="muted">Fond de caisse (ouverture)</td><td className="r"><input id="z-float" type="number" className="input mono" style=${{ width: 110, padding: "4px 8px", textAlign: "right" }} value=${float} onInput=${(e) => setFloat(e.target.value)} /></td></tr>
          <${Row} l="+ Ventes en espèces" v=${APO.n2(cash)} sub=${live.length ? `dont ${APO.n2(by("cash"))} sur ${live.length} ticket(s) de la démo` : null} />
          ${gcCash > 0 && html`<${Row} l="+ Cartes cadeaux vendues en espèces" v=${APO.n2(gcCash)} sub="hors CA, hors TVA" />`}
          <${Row} l="− Remboursements en espèces" v=${cashOut ? "-" + APO.n2(cashOut) : APO.n2(0)} />
          <${Row} l="Espèces attendues" v=${APO.n2(expected)} strong=${true} />
          <tr><td><b>Espèces comptées</b><div className="faint small">comptage du tiroir par la caissière</div></td><td className="r"><input id="z-counted" type="number" className="input mono" style=${{ width: 110, padding: "4px 8px", textAlign: "right" }} placeholder="0,00" value=${counted} onInput=${(e) => setCounted(e.target.value)} /></td></tr>
          <${Row} l="Écart espèces" v=${variance == null ? "—" : (variance > 0 ? "+" : "") + APO.n2(variance)} strong=${true} tone=${variance == null ? "" : Math.abs(variance) < 0.01 ? "var(--ok)" : Math.abs(variance) >= 20 ? "var(--bad)" : "var(--warn)"} />
          <${Row} l="Cartes bancaires (caisse)" v=${APO.n2(cardNet)} sub=${cardOut ? `après ${APO.n2(cardOut)} de recrédits carte` : null} />
          <tr><td className="muted">Télécollecte TPE<div className="faint small">${tpeOn ? "lue automatiquement auprès de l'acquéreur" : "à saisir depuis le ticket du TPE"}</div></td><td className="r"><input id="z-tpe" type="number" className="input mono" style=${{ width: 110, padding: "4px 8px", textAlign: "right" }} value=${tpe == null ? cardNet : tpe} onInput=${(e) => setTpe(e.target.value)} /></td></tr>
          <${Row} l="Écart cartes vs TPE" v=${(tpeVar > 0 ? "+" : "") + APO.n2(tpeVar)} tone=${Math.abs(tpeVar) < 0.01 ? "var(--ok)" : "var(--bad)"} />
          <${Row} l="Wallet QR" v=${APO.n2(wallet)} />
          <${Row} l="Cartes cadeaux utilisées" v=${APO.n2(gift)} sub="pas d'encaissement : réduit l'encours" />
          <${Row} l="Avoirs émis (échanges, bons d'achat)" v=${APO.n2(avoirs)} sub="sans sortie d'argent" />
        </tbody></table></${Card}>
        <div className="col">
          <${Card} title="Synthèse de la journée">
            <div className="totals">
              <div><span className="muted">Tickets</span><span className="mono">${b.tickets + live.length}</span></div>
              <div><span className="muted">Avoirs émis (${rets.length})</span><span className="mono">${rets.length ? "− " : ""}${APO.dh(avoirs + cashOut + cardOut)}</span></div>
              <div><span className="muted">dont TVA 20 %</span><span className="mono">${APO.dh(total - total / 1.2)}</span></div>
              <div className="big"><span>CA TTC</span><span className="num">${APO.dh(total)}</span></div>
            </div>
            <div className="sep"></div>
            ${needNote && html`<label className="field" style=${{ marginBottom: 10 }}>Justification de l'écart<input id="z-note" className="input" placeholder="ex. erreur de rendu monnaie, ticket TPE annulé…" value=${note} onInput=${(e) => setNote(e.target.value)} /></label>`}
            <button id="z-sign" className="btn pri" style=${{ width: "100%", justifyContent: "center" }} disabled=${!can} onClick=${sign}><${Icon} n="lock" s=${15} />Clôturer et signer le Z</button>
            <p className="small faint" style=${{ marginTop: 8 }}>${variance == null ? "Saisissez les espèces comptées pour calculer l'écart." : "Le Z sera numéroté " + `Z-${ORG.site}-${ORG.terminal}-2026-${String(st.zSeries + 1).padStart(4, "0")}` + " et chaîné au dernier ticket."}</p>
          </${Card}>
          <div className="adv info"><div className="ic"><${Icon} n="info" s=${16} /></div><span className="src">Caisse</span><b>Chaque vente garde son mode de paiement</b><p>Espèces, carte, wallet, carte cadeau ou paiement mixte : la clôture additionne ce qui a été réellement encaissé, ticket par ticket.</p></div>
        </div></div>`}
    </div>`;
  };

  /* ---------------- HQ: PRICE PUSH (chain.hq) ---------------- */
  const FLOOR = 18;
  APO.screens["para:hq"] = function HQ() {
    const s = APO.use(); const st = s.para;
    const [pid, setPid] = useState("q1"); const [chg, setChg] = useState(-5); const [eff, setEff] = useState("16/11"); const [ovOn, setOvOn] = useState(true); const [ack, setAck] = useState(false);
    const p = pp(pid);
    const rows = p.variants.map((v, i) => { const old = vPrice(p, i, "s1"); const nw = Math.round(old * (1 + chg / 100)); const cost = vCost(p, i); return { v, i, old, nw, cost, m0: marginAt(old, cost), m1: marginAt(nw, cost) }; });
    const low = rows.filter((r) => r.m1 < FLOOR);
    const labels = SHOPS.map((x) => ({ x, n: ovOn && x.id === "s3" ? 0 : p.variants.reduce((a, v, i) => a + Math.max(0, st.stock[pid][i][sIdx(x.id)]), 0) + p.variants.length }));
    const nLab = labels.reduce((a, l) => a + l.n, 0);
    const can = chg !== 0 && (!low.length || ack);
    const apply = (entry) => APO.setV((c) => { const prices = { ...c.prices }; entry.rows.forEach((r) => { prices[entry.pid + ":" + r.i] = r.nw; if (entry.ov) prices["s3:" + entry.pid + ":" + r.i] = r.old; }); return { prices, hqLog: c.hqLog.map((x) => (x.id === entry.id ? { ...x, applied: true } : x)) }; });
    const push = () => {
      const id = "PX-2611-0" + String(8 + st.hqLog.length).padStart(2, "0"); const text = `${p.brand} ${p.range} : ${chg > 0 ? "+" : ""}${chg} % (${rows.map((r) => vName(p, r.i) + " " + APO.n2(r.old) + " → " + APO.n2(r.nw)).join(", ")})`;
      const entry = { id, t: TODAY + " " + APO.now(), text, shops: ovOn ? "3 boutiques + exception Marrakech" : "4 boutiques", eff: eff === TODAY ? "immédiat" : eff, labels: nLab, hash: APO.hash(id + text + eff), pid, rows, ov: ovOn, applied: false, floor: low.length > 0 };
      APO.setV((c) => ({ hqLog: [entry, ...c.hqLog] }));
      if (eff === TODAY) apply(entry);
      APO.toast("Prix poussés aux boutiques", `${p.range} · effet ${entry.eff} · ${nLab} étiquettes à réimprimer`, "building");
      APO.log(`Siège : prix ${p.range} ${chg > 0 ? "+" : ""}${chg} % poussé (${entry.shops}) · effet ${entry.eff} · ${id}`, "ok");
      setAck(false);
    };
    return html`<div>
      <${APO.PageH} title="Siège · prix chaîne" sub="Le siège fixe les prix des gammes, programme leur date d'effet et autorise des exceptions par boutique. Chaque poussée est signée et journalisée." />
      <div className="split rev">
        <div className="col">
          <${Card} title="Changer le prix d'une gamme">
            <div className="grid g3" style=${{ gap: 10, gridTemplateColumns: "1.4fr 1fr 1fr" }}>
              <label className="field">Gamme<select id="hq-range" className="input" value=${pid} onChange=${(e) => { setPid(e.target.value); setAck(false); }}>${PP.filter((x) => !x.banned).map((x) => html`<option key=${x.id} value=${x.id}>${x.brand} · ${x.range}</option>`)}</select></label>
              <label className="field">Variation (%)<input id="hq-pct" type="number" step="1" className="input mono" value=${chg} onInput=${(e) => { setChg(+e.target.value); setAck(false); }} /></label>
              <label className="field">Date d'effet<select id="hq-eff" className="input" value=${eff} onChange=${(e) => setEff(e.target.value)}><option value=${TODAY}>Immédiat (13/11)</option><option value="16/11">Lundi 16/11 à l'ouverture</option><option value="01/12">01/12</option></select></label>
            </div>
            <table className="tbl" style=${{ marginTop: 12 }}><thead><tr><th>Variante</th><th className="r">Prix actuel</th><th className="r">Nouveau prix</th><th className="r">Coût HT</th><th className="r">Marge</th></tr></thead>
              <tbody>${rows.map((r) => html`<tr key=${r.i}><td>${r.v.sw && html`<${Swatch} c=${r.v.sw} />`}${r.v.v}</td><td className="r mono faint">${APO.n2(r.old)}</td><td className="r mono"><b>${APO.n2(r.nw)}</b></td><td className="r mono faint">${APO.n2(r.cost)}</td><td className="r"><span className="faint small">${APO.n2(r.m0)} % → </span><${Badge} tone=${r.m1 < FLOOR ? "bad" : r.m1 >= 23 ? "ok" : ""}>${APO.n2(r.m1)} %</${Badge}></td></tr>`)}</tbody></table>
            ${low.length > 0 && html`<div className="adv warn" style=${{ marginTop: 12 }}><div className="ic"><${Icon} n="alert" s=${16} /></div><span className="src">Plancher de marge · ${FLOOR} %</span><b>${low.length} variante(s) passeraient sous le plancher de marge</b><p>${low.map((r) => r.v.v + " : " + APO.n2(r.m1) + " %").join(" · ")}. Négociez un nouveau prix d'achat ou confirmez une baisse volontaire (alignement concurrence).</p>
              <div className="acts" style=${{ gridColumn: 2 }}><label className="row small"><input type="checkbox" checked=${ack} onChange=${(e) => setAck(e.target.checked)} />Je confirme la baisse sous le plancher</label></div></div>`}
          </${Card}>
          <${Card} title="Par boutique" sub="exceptions locales et étiquettes" pad=${false}><table className="tbl"><thead><tr><th>Boutique</th><th>Prix appliqué</th><th className="r">Étiquettes</th></tr></thead>
            <tbody>${labels.map(({ x, n }) => html`<tr key=${x.id}><td><b>${x.name}</b>${x.id === "s3" && html`<div className="row small" style=${{ marginTop: 4 }}><label className="row"><input type="checkbox" checked=${ovOn} onChange=${(e) => setOvOn(e.target.checked)} />Exception : garder l'ancien prix</label><span className="faint">· zone touristique, concurrence Guéliz</span></div>`}</td><td className="small">${x.id === "s3" && ovOn ? html`<${Badge} tone="info">Exception · ${rows.map((r) => APO.n2(r.old)).join(" / ")}</${Badge}>` : rows.map((r) => APO.n2(r.nw)).join(" / ")}</td><td className="r mono">${n}</td></tr>`)}</tbody></table>
            <div className="card-b row" style=${{ borderTop: "1px solid var(--line)" }}><${Icon} n="printer" s=${15} /><span className="small"><b>${nLab} étiquettes à réimprimer</b> par boutique (affichage des prix, loi 31-08) : ${labels.map((l) => l.x.short + " " + l.n).join(" · ")}</span></div></${Card}>
        </div>
        <div className="col">
          <${Card} title="Pousser aux boutiques">
            <div className="col small" style=${{ gap: 6 }}>
              <div className="row"><${Icon} n="tag" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>${p.brand} ${p.range} · ${chg > 0 ? "+" : ""}${chg} %</span></div>
              <div className="row"><${Icon} n="clock" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>Effet : ${eff === TODAY ? "immédiat" : eff}${eff !== TODAY ? " · les caisses basculent seules, même hors ligne" : ""}</span></div>
              <div className="row"><${Icon} n="store" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>${ovOn ? "3 boutiques + exception Marrakech" : "4 boutiques"} · e-shop aligné</span></div>
              <div className="row"><${Icon} n="printer" s=${14} /><span style=${{ flex: 1, minWidth: 0 }}>${nLab} étiquettes envoyées aux imprimantes des boutiques</span></div>
            </div>
            <div className="sep"></div>
            <button id="hq-push" className="btn pri" style=${{ width: "100%", justifyContent: "center" }} disabled=${!can} onClick=${push}><${Icon} n="send" s=${15} />Pousser les prix</button>
          </${Card}>
          <${Card} title="Journal des poussées" pad=${false}><table className="tbl"><tbody>${st.hqLog.map((x) => html`<tr key=${x.id}><td><span className="mono small">${x.id}</span> · <span className="faint small">${x.t}</span><div className="small">${x.text}</div><div className="faint small">${x.shops} · ${x.labels} étiquettes · signé ${x.hash}${x.floor ? " · sous plancher confirmé" : ""}</div></td><td className="r">${x.applied || !x.rows ? html`<${Badge} tone="ok">En vigueur</${Badge}>` : html`<div className="col" style=${{ gap: 4, justifyItems: "end" }}><${Badge} tone="info">Programmé · ${x.eff}</${Badge}><button className="btn sm ghost" onClick=${() => { apply(x); APO.toast("Date d'effet simulée", x.text, "clock"); }}>Simuler la date</button></div>`}</td></tr>`)}</tbody></table></${Card}>
        </div></div></div>`;
  };

  /* ---------------- GIFT CARDS (giftcards) ---------------- */
  APO.screens["para:giftcards"] = function Gift() {
    const s = APO.use(); const st = s.para;
    const [amt, setAmt] = useState(300); const [kind, setKind] = useState("E-carte"); const [buyer, setBuyer] = useState(""); const [mode, setMode] = useState("card"); const [look, setLook] = useState("");
    const enc = st.gift.reduce((a, g) => a + g.balance, 0); const used = st.gift.reduce((a, g) => a + g.uses.reduce((b, u) => b + u.amount, 0), 0);
    const found = look && st.gift.find((g) => g.code.toLowerCase().includes(look.toLowerCase()));
    const issue = () => {
      const code = "GC-" + APO.uid().toUpperCase().slice(0, 4) + "-" + String(57 + st.gift.length);
      APO.setV((c) => ({ gift: [{ code, amount: +amt, balance: +amt, shop: c.shop, issued: TODAY, buyer: buyer || "—", kind, uses: [] }, ...c.gift], giftIssued: [...(c.giftIssued || []), { code, amount: +amt, mode, shop: c.shop }] }));
      APO.toast("Carte cadeau activée", `${code} · ${APO.dh(+amt)} · ${PAYL[mode].toLowerCase()} · ${kind === "E-carte" ? "envoyée par SMS" : "carte remise"}`, "gift");
      APO.log(`Carte cadeau ${code} émise · ${APO.dh(+amt)} · sans TVA à l'émission`, "ok"); setBuyer("");
    };
    return html`<div>
      <${APO.PageH} title="Cartes cadeaux" sub="Cartes physiques, e-cartes et bons d'achat valables dans les 4 boutiques et sur l'e-shop. Paiement partiel, solde consultable partout." />
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Encours" value=${APO.dh(enc)} delta="dû aux clientes · hors chiffre d'affaires" />
        <${APO.Kpi} label="Cartes actives" value=${st.gift.filter((g) => g.balance > 0).length} delta=${st.gift.filter((g) => g.kind === "Bon d'achat").length + " bon(s) d'achat issus d'avoirs"} />
        <${APO.Kpi} label="Utilisé ce mois" value=${APO.dh(used)} delta="TVA collectée à l'utilisation" />
        <${APO.Kpi} label="Validité" value="12 mois" delta="relance SMS 30 j avant expiration" />
      </div>
      <div className="split rev">
        <${Card} title="Soldes" pad=${false} right=${html`<div className="search" style=${{ cursor: "text", minWidth: 200 }}><${Icon} n="search" s=${15} /><input id="gc-look" style=${{ border: 0, outline: 0, background: "none", flex: 1 }} placeholder="Code de la carte" value=${look} onInput=${(e) => setLook(e.target.value)} /></div>`}>
          ${found && html`<div className="card-b" style=${{ borderBottom: "1px solid var(--line)", background: "var(--accent-soft)" }}><b className="mono">${found.code}</b> · solde <b className="mono">${APO.dh(found.balance)}</b> sur ${APO.dh(found.amount)} · ${found.uses.length} utilisation(s)</div>`}
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Carte</th><th>Émise</th><th className="r">Montant</th><th style=${{ minWidth: 150 }}>Solde</th><th>Statut</th></tr></thead>
            <tbody>${st.gift.map((g) => html`<tr key=${g.code}><td><b className="mono" style=${{ fontSize: 12.5 }}>${g.code}</b><div className="faint small">${g.kind} · ${g.buyer}</div>${g.uses.map((u, i) => html`<div key=${i} className="small muted">${u.t} · ${u.shop} · −${APO.n2(u.amount)} <span className="mono faint">${u.ticket}</span></div>`)}</td><td className="small">${g.issued} · ${shop(g.shop).short}</td><td className="r mono">${APO.n2(g.amount)}</td>
              <td><div className="row small" style=${{ marginBottom: 3 }}><b className="mono">${APO.n2(g.balance)}</b></div><div className="bar"><i style=${{ width: pct(g.balance, g.amount) + "%" }}></i></div></td><td>${g.balance <= 0 ? html`<${Badge}>Utilisée</${Badge}>` : g.balance < g.amount ? html`<${Badge} tone="info">Utilisée en partie</${Badge}>` : html`<${Badge} tone="ok">Active</${Badge}>`}</td></tr>`)}</tbody></table></div></${Card}>
        <div className="col">
          <${Card} title="Émettre une carte">
            <div className="col">
              <div className="field">Montant</div>
              <div className="row">${[100, 200, 300, 500, 1000].map((v) => html`<button key=${v} className=${"btn sm " + (+amt === v ? "pri" : "")} onClick=${() => setAmt(v)}>${v}</button>`)}<input type="number" className="input mono" style=${{ width: 90, padding: "4px 8px" }} value=${amt} onInput=${(e) => setAmt(e.target.value)} /></div>
              <div className="grid g2" style=${{ gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                <div className="field">Support<div className="pill-toggle">${["Physique", "E-carte"].map((k) => html`<button key=${k} className=${kind === k ? "on" : ""} onClick=${() => setKind(k)}>${k}</button>`)}</div></div>
                <div className="field">Réglée par<div className="pill-toggle">${[["card", "Carte"], ["cash", "Espèces"]].map((k) => html`<button key=${k[0]} className=${mode === k[0] ? "on" : ""} onClick=${() => setMode(k[0])}>${k[1]}</button>`)}</div></div>
              </div>
              <label className="field">Offerte par (facultatif)<input id="gc-buyer" className="input" placeholder="Nom ou entreprise" value=${buyer} onInput=${(e) => setBuyer(e.target.value)} /></label>
              <div className="adv info"><div className="ic"><${Icon} n="receipt" s=${16} /></div><span className="src">Fiscalité</span><b>Pas de TVA à l'émission</b><p>La carte est un moyen de paiement, pas une vente : la TVA 20 % est collectée sur le ticket où elle est utilisée. L'encours n'entre pas dans le CA.</p></div>
              <button id="gc-issue" className="btn pri" disabled=${!(+amt > 0)} onClick=${issue}><${Icon} n="gift" s=${15} />Encaisser et activer ${APO.dh(+amt || 0)}</button>
            </div></${Card}>
          <p className="small faint">À la caisse : « Paiement mixte » permet de régler une partie avec la carte cadeau, le reste par carte bancaire ou en espèces.</p>
        </div></div></div>`;
  };
})();

/* ---------------- GUIDED TOUR (parapharmacie) ---------------- */
(function () {
  const APO = window.APO;
  const L = (pid, vi, qty) => ({ key: pid + ":" + vi + ":s1", pid, vi, from: "s1", mode: "here", qty });
  const setP = (patch) => APO.set((s) => ({ para: { ...s.para, picker: null, receipt: null, returnOpen: false, ...patch } }));
  const isOn = (id) => APO.installed(APO.get(), id);
  APO.tour.para = [
    { kicker: "L'idée", title: "La même plateforme, un autre métier", go: "home", text: "Même socle, mêmes garanties fiscales que l'officine, mais d'autres plugins : promotions, fidélité, animatrices, vente sociale, siège de chaîne. Ici, une chaîne de 4 boutiques et un dépôt central. Le menu et l'accueil se recomposent selon ce qui est installé.",
      run: () => { APO.installPlugin("ecom", false); APO.installPlugin("skin-diag", false); if (!isOn("promoters")) APO.installPlugin("promoters", true); APO.set({ offline: false, fresh: null, newPlugins: { ...(APO.get().newPlugins || {}), para: {} } }); } },
    { kicker: "Caisse", title: "Promotions, fidélité et « Vendu par »", go: "pcounter", text: "Le moteur de promotions applique les règles signées du siège, même hors ligne : 2ᵉ Anthelios à −50 %, Sensibio 3 pour 2, avec la part payée par la marque. La carte de Salma propose ses points. Hind, l'animatrice La Roche-Posay pointée ce matin, est créditée des lignes de sa marque.", try: "Cliquer « Utiliser 500 pts · −50 DH », puis encaisser : le ticket affiche « Vendu par ».",
      run: () => setP({ basket: [L("q1", 0, 2), L("q3", 0, 3)], customer: "k1", redeem: 0, promoterIn: { ...APO.get().para.promoterIn, 0: APO.get().para.promoterIn[0] || "09:30" }, promoterOut: {}, seller: "p0" }) },
    { kicker: "Pack Maroc", title: "Un cosmétique interdit est bloqué partout", go: "pcounter", text: "La liste d'interdictions AMMPS est une donnée signée et datée. Le produit à l'hydroquinone est bloqué à la caisse, mis en quarantaine dans les 4 boutiques et au dépôt, et un retour fournisseur est préparé. Seul le socle certifié peut bloquer une vente.",
      run: () => setP({ basket: [L("q9", 0, 1)], customer: null }) },
    { kicker: "Extension en direct", title: "Installer le diagnostic de peau d'un partenaire", go: "pcounter", text: "DermaLab vient d'être installé : sa carte conseil apparaît aussitôt pour Imane (peau sèche), marquée « Nouveau », et ajoute la routine en un clic. Le partenaire lit le profil peau au Maroc, avec consentement. Il ne peut ni bloquer une vente ni changer un prix.",
      run: () => { APO.installPlugin("skin-diag", true); setP({ basket: [L("q6", 0, 1)], customer: "k2" }); APO.toast("Diagnostic de peau installé", "Ajouté : carte conseil en caisse", "puzzle"); } },
    { kicker: "Extension en direct", title: "Retirer un plugin… puis le remettre", go: "pcounter", text: "Retirez « Animatrices marques » : l'entrée de menu « Marques & animatrices » et la ligne « Vendu par » du ticket disparaissent immédiatement. Réinstallez-le : tout revient, données intactes. La caisse n'a jamais cessé de fonctionner.",
      run: () => { if (!isOn("promoters")) APO.installPlugin("promoters", true); setP({ basket: [L("q1", 0, 1)], customer: null, seller: "p0" }); },
      action: { get label() { return isOn("promoters") ? "Retirer « Animatrices marques »" : "Réinstaller « Animatrices marques »"; }, run: () => { const on = isOn("promoters"); APO.installPlugin("promoters", !on); APO.toast(on ? "Animatrices marques retiré" : "Animatrices marques réinstallé", on ? "Menu et « Vendu par » retirés · données conservées" : "Menu et « Vendu par » de retour", "puzzle"); APO.log(on ? "Plugin retiré : Animatrices marques" : "Plugin installé : Animatrices marques", on ? "warn" : "ok"); } } },
    { kicker: "Canaux", title: "WhatsApp, puis un e-shop sur le même stock", go: "inbox", text: "Une demande de teinte sur WhatsApp devient une réservation, un lien de paiement ou une commande en caisse, uniquement pour les clientes qui ont donné leur accord. Ensuite, installez l'e-commerce : e-shop et Jumia sont publiés depuis le même stock, et aucun médicament ne peut y apparaître.",
      action: { label: "Installer l'e-commerce", run: () => { APO.installPlugin("ecom", true); APO.go("channels"); APO.toast("E-shop & marketplaces installé", "Ajouté : menu « E-commerce » · tuile d'accueil", "puzzle"); } } },
    { kicker: "Siège", title: "Changer un prix pour toute la chaîne", go: "hq", text: "Le siège baisse l'Anthelios de 5 % à partir de lundi, garde l'ancien prix à Marrakech, voit tout de suite la marge passer sous le plancher de 18 %, et sait combien d'étiquettes chaque boutique doit réimprimer (loi 31-08). La poussée est signée et journalisée ; les caisses basculent seules à la date d'effet." },
    { kicker: "Récapitulatif", title: "Ce que vous avez vu", go: "home", text: "Ce que vous avez vu : une caisse qui applique promotions, fidélité et attribution aux animatrices sans saisie ; un veto légal que seul le Pack Maroc peut poser ; un plugin partenaire installé puis un plugin retiré et remis à chaud ; la vente sociale et l'e-commerce sur un seul stock ; le siège qui pousse un prix daté avec exception locale. À explorer ensuite : retours et avoirs, clôture de caisse, réception distributeur, inventaire, cartes cadeaux." },
  ];
})();
