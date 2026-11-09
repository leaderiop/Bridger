/* PROTOTYPE — Officine variant. Throwaway code. */
(function () {
  const { useState, useEffect } = React;
  const APO = window.APO, D = window.APO_DATA, html = APO.html, Icon = APO.Icon, Badge = APO.Badge, Card = APO.Card;
  const prod = (id) => D.products.find((p) => p.id === id);
  const wh = (id) => D.wholesalers.find((w) => w.id === id);
  const listBadge = (p) => p.list === "B" ? html`<${Badge} tone="bad">Tableau B</${Badge}>` : p.list === "I" ? html`<${Badge} tone="warn">Liste I</${Badge}>` : p.list === "II" ? html`<${Badge}>Liste II</${Badge}>` : null;
  const qtyOf = (st, pid) => (st.stock[pid] || []).filter((l) => !l.recalled).reduce((a, l) => a + l.qty, 0);
  const custOf = (st) => D.customers.find((c) => c.id === st.customer);
  const r2 = (n) => Math.round(n * 100) / 100;
  const PAY = { cash: "Espèces", card: "Carte", credit: "Carnet", mixed: "Mixte" };
  const hasCover = (c) => !!(c && c.cover !== "Sans couverture");
  const isDirect = (c) => !!(c && (c.ald || c.tiersPayant)); // tiers payant only for ALD/ALC patients and conventions (FAR)
  const tpLabel = (c) => (c && c.ald ? "ALD" : c && c.tiersPayant ? "convention" : "");
  const whsOn = (s) => D.wholesalers.filter((w) => APO.installed(s, w.plugin));
  const firstLot = (st, pid) => { const lots = st.stock[pid].filter((l) => !l.recalled && l.qty > 0).sort((a, b) => a.exp.localeCompare(b.exp)); return lots[0] ? lots[0].lot : (st.stock[pid].find((l) => !l.recalled) || st.stock[pid][0]).lot; };
  const Z_NUM = "Z-2026-0312";
  const pctL = (x) => Math.round(x * 100) + " %";

  /* ---------------- initial state ---------------- */
  APO.init.officine = () => ({
    basket: [], customer: null, pay: "cash", split: { with: "card", cash: "" }, rx: {}, fse: false, notes: {}, series: 123, lastHash: "9f3c2a71",
    stock: Object.fromEntries(D.products.map((p) => [p.id, p.lots.map((l) => ({ ...l }))])),
    carnet: Object.fromEntries(D.customers.map((c) => [c.id, c.carnet])),
    sales: D.daySales.map((x) => ({ ...x })), avoirs: [], avoirSeq: 17, exceptions: [{ id: "e0", t: "08:40", text: "Écart caisse T01 : +20,00 DH à la clôture d'hier", ref: "Z-2026-0311" }],
    parked: [], ticketSubs: [], subLog: [{ t: "09:41", from: "Coversyl 5 mg", to: "Périndopril Sothema 5 mg", saving: 34 }],
    garde: { on: false, fee: 20, count: 0 }, cashOuts: [], cloture: { counted: "", deposit: 0, depositRef: null }, z: null,
    inv: { counts: {}, reveal: false, posted: null }, purchTab: null,
    imports: { winpharm: { at: null, shadow: false }, sobrus: { at: null, shadow: false } },
    orders: D.orders.map((o) => ({ ...o })), reception: { ...D.reception, done: false, decisions: Object.fromEntries(D.reception.exceptions.map((e, i) => [i, e.def || "accept"])) }, quote: null, picks: Object.fromEntries(D.suggestions.map((s) => [s.pid, s.pick])),
    returns: D.supplierReturns.map((r) => ({ ...r })),
    claims: D.claims, rejections: D.rejections.map((r) => ({ ...r, fixed: false })), ordonnancier: D.ordonnancier.slice(), stup: D.stup.slice(),
    specials: [{ id: "SO-0091", pid: "p13", cust: "Youssef Karimi", deposit: 10, status: "Commandé · Dawa T2" }],
    receipt: null, rxFor: null,
    tasks: [
      { id: "t1", title: "Brouillon de commande de nuit", state: "approval", skill: "nightly-order-draft", tools: ["smart-buy.suggestions", "core.stock.positions", "wh.quoteOrder", "wh.deliverySchedule"], cost: "0,42 DH", tainted: false, kind: "order", summary: "5 produits sous le seuil. Répartition proposée : Dawa Maghreb (tournée 2, UG 20+3 sur Doliprane) et Grossiste Atlas (Ventoline indisponible chez Dawa, Gaviscon 12+1).", lines: D.suggestions.map((s) => ({ label: `${prod(s.pid).name} × ${s.qty}`, why: `${s.reason} · ${wh(s.pick).name}${s.offers[s.pick].ug !== "—" ? " · UG " + s.offers[s.pick].ug : ""}`, amount: APO.n2(s.qty * s.offers[s.pick].price), wh: s.pick, pid: s.pid, qty: s.qty })) },
      { id: "t2", title: "Impact du décret PPV d'août", state: "done", skill: "ppv-impact", tools: ["ma.pricing.decreeDiff", "core.stock.byPrice"], cost: "0,18 DH", tainted: false, summary: "37 références concernées, 212 boîtes en stock à l'ancien prix. Perte de marge estimée : 1 184 DH. 64 étiquettes à réimprimer (liste prête dans Stock).", lines: [] },
      { id: "t3", title: "Rapprochement BL DM-778120", state: "done", skill: "bl-reconcile", tools: ["core.purchasing.pendingReceptions", "wh.deliveryNotes"], cost: "0,09 DH", tainted: true, summary: "18 lignes conformes. 4 écarts préparés pour la réception (ligne manquante, UG, péremption courte, PPV). Le texte du BL est un contenu tiers : aucune validation automatique.", lines: [] },
    ],
  });

  /* ---------------- pricing: what the patient pays, what the insurer pays ---------------- */
  // Ordinary CNSS/AMO patient: pays everything, the pharmacy issues the FSE, the patient is reimbursed later (rate × base).
  // ALD/ALC patients and conventions (Mutuelle FAR): tiers payant, rate × base deducted at the counter.
  function calc(s) {
    const st = s.officine; const cust = custOf(st);
    const sub = st.basket.reduce((a, l) => a + prod(l.pid).ppv * l.qty, 0);
    const garde = APO.installed(s, "garde") && st.garde.on && st.basket.length ? +st.garde.fee || 0 : 0;
    const total = r2(sub + garde);
    const covLines = st.basket.filter((l) => prod(l.pid).rate > 0);
    const reimb = hasCover(cust) ? r2(covLines.reduce((a, l) => { const p = prod(l.pid); return a + p.base * p.rate * l.qty; }, 0)) : 0;
    const baseSum = r2(covLines.reduce((a, l) => a + prod(l.pid).base * l.qty, 0));
    const rates = Array.from(new Set(covLines.map((l) => prod(l.pid).rate)));
    const direct = isDirect(cust);
    const insurer = direct ? reimb : 0;
    const fseEst = !direct && hasCover(cust) ? reimb : 0;
    const vat = st.basket.reduce((a, l) => { const p = prod(l.pid); return a + (p.vat ? (p.ppv * l.qty * p.vat) / (1 + p.vat) : 0); }, 0);
    const patient = r2(total - insurer);
    let parts;
    if (st.pay === "mixed") { const cash = r2(Math.min(Math.max(+st.split.cash || 0, 0), patient)); parts = { cash, [st.split.with]: r2(patient - cash) }; }
    else parts = { [st.pay]: patient };
    return { cust, sub, garde, total, reimb, baseSum, rateLabel: rates.sort().map(pctL).join(" / ") || "taux", direct, insurer, fseEst, vat, patient, parts };
  }
  const partsText = (parts) => Object.entries(parts).filter(([, v]) => v > 0).map(([k, v]) => `${PAY[k]} ${APO.n2(v)}`).join(" + ") || "—";

  /* ---------------- advisory / veto contributions ---------------- */
  APO.advisors.officine = [
    { plugin: "ma.dispensing", id: "rx-required", label: "Ordonnance obligatoire (listes I et B)", run: (st) => st.basket.filter((l) => ["I", "B"].includes(prod(l.pid).list) && !st.rx[l.pid]).map((l) => { const p = prod(l.pid); return { tone: "veto", icon: "shield", src: "Pack Maroc · Bloquant", title: p.list === "B" ? `${p.name} : ordonnance sur carnet à souches requise` : `${p.name} : ordonnance requise (liste I)`, text: p.list === "B" ? "Tableau B : saisie de l'ordonnance sur carnet à souches et inscription au registre des stupéfiants." : "Sera inscrite à l'ordonnancier avec le prescripteur (INPE).", actions: [{ label: "Saisir l'ordonnance", pri: true, run: () => APO.setV({ rxFor: l.pid }) }] }; }) },
    { plugin: "ma.recalls", id: "recall", label: "Lot rappelé bloqué", run: (st) => st.basket.filter((l) => (st.stock[l.pid] || []).some((x) => x.recalled)).map((l) => ({ tone: "warn", icon: "alert", src: "Pack Maroc · Rappel de lot", title: `Lot ${(st.stock[l.pid].find((x) => x.recalled) || {}).lot} rappelé (AMMPS) : bloqué`, text: `Lot ${l.lot} utilisé à la place (premier périmé, premier sorti). 7 boîtes en quarantaine, retour grossiste préparé.` })) },
    { plugin: "generics", id: "generic", label: "Générique moins cher disponible", run: (st) => { const c = custOf(st); const cov = hasCover(c); return st.basket.filter((l) => prod(l.pid).generic).map((l) => { const p = prod(l.pid), g = prod(p.generic); const rest = (x) => (cov ? x.ppv - x.base * x.rate : x.ppv) * l.qty; return { tone: "acc", icon: "copy", src: "Apotheka · Conseil générique", title: `Générique disponible : ${g.name}`, text: `${APO.n2(g.ppv)} DH au lieu de ${APO.n2(p.ppv)} DH (−${APO.dh((p.ppv - g.ppv) * l.qty)}). Reste à charge du patient${cov ? " après remboursement" : ""} : ${APO.dh(rest(g))} au lieu de ${APO.dh(rest(p))}. En stock : ${qtyOf(st, g.id)}.`, actions: [{ label: "Substituer", pri: true, run: () => substitute(l.pid) }] }; }); } },
    { plugin: "dup-therapy", id: "dup", label: "Doublon de DCI dans le panier", run: (st) => { const seen = {}; const out = []; st.basket.forEach((l) => { const d = prod(l.pid).dci; if (d !== "—") { if (seen[d] && !out.find((o) => o.d === d)) out.push({ d, a: seen[d], b: prod(l.pid).name }); seen[d] = prod(l.pid).name; } }); return out.map((o) => ({ tone: "warn", icon: "copy", src: "Apotheka · Conseil", title: `Doublon : ${o.d}`, text: `${o.a} et ${o.b} contiennent la même molécule. Vérifier la posologie totale.`, actions: [{ label: "Noté", run: () => APO.toast("Conseil noté", "Tracé dans le journal de la vente.") }] })); } },
    { plugin: "interactions", id: "ddi", label: "Interaction médicamenteuse", run: (st) => { const ids = st.basket.map((l) => l.pid); return ids.includes("p9") && ids.includes("p8") ? [{ tone: "warn", icon: "pill", src: "Partenaire MedRef · Conseil", title: "Interaction majeure : acénocoumarol + aspirine", text: "Risque hémorragique accru. Source : MedRef 2026.4, évaluée sur ce poste, aucune donnée patient transmise. Ne bloque pas la vente : décision du pharmacien.", actions: [{ label: "Conseil donné", run: () => APO.toast("Conseil tracé", "Ajouté au dossier de la vente.") }, { label: "Retirer l'aspirine", run: () => APO.setV((c) => ({ basket: c.basket.filter((l) => l.pid !== "p8") })) }] }] : []; } },
    { plugin: "special-orders", id: "oos", label: "Rupture → commande client", run: (st) => st.basket.filter((l) => qtyOf(st, l.pid) <= 0).map((l) => ({ tone: "info", icon: "bag", src: "Commandes clients", title: `${prod(l.pid).name} : rupture de stock`, text: "Vente possible en stock négatif (signalée), ou commande client avec acompte et SMS à l'arrivée.", actions: [{ label: "Créer une commande client", pri: true, run: () => { APO.setV((c) => ({ basket: c.basket.filter((x) => x.pid !== l.pid), specials: [{ id: "SO-0" + (92 + c.specials.length), pid: l.pid, cust: (custOf(c) || { name: "Client comptoir" }).name, deposit: 10, status: "Ajoutée au prochain brouillon" }, ...c.specials] })); APO.toast("Commande client créée", "Acompte 10 DH · ajoutée au brouillon de commande de l'assistant."); } }] })) },
    { plugin: "ma.cnss-fse", id: "fse", label: "FSE et e-ordonnance", run: (st) => { const c = custOf(st); if (!c || !/CNSS|AMO/.test(c.cover) || !st.basket.some((l) => prod(l.pid).rate > 0) || st.fse) return []; return [{ tone: "info", icon: "qr", src: "FSE · CNSS", title: c.ald ? "Tiers payant ALD : FSE à transmettre" : "Feuille de soins électronique", text: c.ald ? `${c.name} · ${c.immat} · ${c.aldLabel}. La part CNSS est déduite au comptoir. Scanner la e-ordonnance pour préremplir la FSE.` : `${c.name} · ${c.immat}. Le patient règle la totalité ; la FSE générée lui permet d'être remboursé par la CNSS. Scanner le QR pour la préremplir.`, actions: [{ label: "Scanner le QR", pri: true, run: () => { APO.setV({ fse: true }); APO.toast("e-ordonnance lue", "FSE préremplie : prescripteur Dr. K. Alaoui (INPE 11028)."); } }] }]; } },
    { plugin: "core.credit", id: "carnet", label: "Solde carnet", run: (st) => { const c = custOf(st); if (!c || !st.carnet[c.id]) return []; return [{ tone: "acc", icon: "users", src: "Carnet client", title: `Carnet : ${APO.dh(st.carnet[c.id])} dus`, text: `Plafond ${APO.dh(c.ceiling)} · ${c.family}`, actions: [{ label: "Encaisser 100 DH", run: () => { APO.setV((x) => ({ carnet: { ...x.carnet, [c.id]: Math.max(0, x.carnet[c.id] - 100) } })); APO.toast("Paiement partiel encaissé", "100,00 DH déduits du carnet."); APO.log(`Carnet ${c.name} : paiement partiel 100,00 DH`, "ok"); } }] }]; } },
    { plugin: "cold-chain", id: "cold", label: "Produit froid", run: (st) => st.basket.filter((l) => prod(l.pid).cold).map((l) => ({ tone: "info", icon: "snow", src: "Partenaire FrigoSense · Conseil", title: `${prod(l.pid).name} : produit froid`, text: "Frigo 1 à 4,8 °C, aucune excursion sur ce lot. Remettre avec une pochette isotherme." })) },
  ];

  function substitute(pid) {
    const st = APO.get().officine; const p = prod(pid), g = prod(p.generic); const lot = firstLot(st, g.id);
    const line = st.basket.find((l) => l.pid === pid); const saving = r2((p.ppv - g.ppv) * line.qty);
    APO.setV((c) => {
      const has = c.basket.some((l) => l.pid === g.id);
      const basket = has ? c.basket.filter((l) => l.pid !== pid).map((l) => (l.pid === g.id ? { ...l, qty: l.qty + line.qty } : l)) : c.basket.map((l) => (l.pid === pid ? { pid: g.id, qty: l.qty, lot } : l));
      return { basket, rx: c.rx[pid] ? { ...c.rx, [g.id]: c.rx[pid] } : c.rx, ticketSubs: [...c.ticketSubs, { from: p.name, to: g.name }], subLog: [{ t: APO.now(), from: p.name, to: g.name, saving }, ...c.subLog] };
    });
    APO.toast("Substitution enregistrée", `${p.name} → ${g.name} · −${APO.dh(saving)} pour le patient. Mention portée sur le ticket.`, "copy");
    APO.log(`Substitution générique : ${p.name} → ${g.name} (accord du patient)`, "info");
  }

  /* ---------------- commands for the palette ---------------- */
  const toggleGarde = () => { const on = !APO.get().officine.garde.on; APO.setV((c) => ({ garde: { ...c.garde, on } })); APO.toast(on ? "Mode garde activé" : "Mode garde désactivé", on ? "Majoration ajoutée à chaque ticket · registre de garde ouvert." : "Registre de garde clôturé.", "moon"); APO.log(on ? "Mode garde activé · registre de garde ouvert" : "Mode garde désactivé", "info"); };
  const goReturns = () => { APO.setV({ purchTab: "returns" }); APO.go("purchasing"); };
  APO.commands.officine = [
    { plugin: "core.sales", id: "sale.new", label: "Nouvelle vente", icon: "scan", run: () => APO.go("counter") },
    { plugin: "core.sales", id: "sale.close", label: "Clôture de caisse (Z du jour)", icon: "receipt", run: () => APO.go("cloture") },
    { plugin: "core.sales", id: "sale.return", label: "Annuler une vente / émettre un avoir", icon: "refresh", run: () => APO.go("cloture") },
    { plugin: "core.purchasing", id: "reception", label: "Traiter la réception en attente (BL Dawa)", icon: "truck", run: () => { APO.setV({ purchTab: "reception" }); APO.go("purchasing"); } },
    { plugin: "core.purchasing", id: "returns", label: "Retours grossiste et avoirs attendus", icon: "truck", run: goReturns },
    { plugin: "smart-buy", id: "smartbuy.run", label: "Préparer les commandes du jour (smart-buy)", icon: "spark", run: () => APO.go("smartbuy") },
    { plugin: "agent", id: "agent.claims", label: "Relancer les rejets CNSS avec l'assistant", icon: "bot", run: () => APO.go("agent") },
    { plugin: "ma.registers", id: "inspect", label: "Exporter le dossier d'inspection", icon: "download", run: () => APO.toast("Dossier d'inspection généré", "Ordonnancier, stupéfiants, températures : PDF signé, empreinte vérifiable.") },
    { plugin: "ma.conformity", id: "verify", label: "Vérifier la chaîne d'intégrité", icon: "shield", run: () => APO.go("conformity") },
    { plugin: "core.stock", id: "inventory", label: "Démarrer un inventaire tournant", icon: "box", run: () => APO.go("inventory") },
    { plugin: "garde", id: "garde.toggle", label: "Activer / désactiver le mode garde", icon: "moon", run: () => { toggleGarde(); APO.go("counter"); } },
    { plugin: "generics", id: "generics.log", label: "Journal des substitutions génériques", icon: "copy", run: () => APO.go("cloture") },
    { plugin: "import.winpharm", id: "import.winpharm", label: "Migration Winpharm : import et mode ombre", icon: "download", run: () => APO.go("migration") },
    { plugin: "import.sobrus", id: "import.sobrus", label: "Migration Sobrus : import et mode ombre", icon: "download", run: () => APO.go("migration-sobrus") },
    { plugin: "preparations", id: "prep.new", label: "Nouvelle préparation magistrale", icon: "flask", run: () => APO.go("doc:preparations") },
    { plugin: "cold-chain", id: "cold.read", label: "Relevés de température du jour", icon: "snow", run: () => APO.toast("Frigo 1 : 4,8 °C · Frigo 2 : 5,1 °C", "Aucune excursion depuis 14 jours.") },
    { plugin: "sms", id: "sms.arrived", label: "Prévenir les clients : produit arrivé", icon: "msg", run: () => APO.toast("2 SMS envoyés", "Numéro et référence uniquement, aucun contenu santé.") },
    { plugin: "accounting", id: "acc.export", label: "Exporter le journal vers Sage", icon: "book", run: () => APO.toast("Journal exporté", "Octobre 2026 · 1 284 écritures · envoyé à la fiduciaire.") },
  ];

  APO.homeTiles.officine = [
    { plugin: "core.sales", label: "Caisse T02" }, { plugin: "expiry-radar", label: "Péremptions & retours" }, { plugin: "smart-buy", label: "Suggestions d'achat" }, { plugin: "ma.tiers-payant", label: "Rejets tiers payant" }, { plugin: "agent", label: "Brouillons à valider" }, { plugin: "garde", label: "Registre de garde" }, { plugin: "generics", label: "Substitutions génériques" }, { plugin: "wh.sud", label: "Répartiteur Sud" }, { plugin: "import.winpharm", label: "Migration Winpharm" }, { plugin: "import.sobrus", label: "Migration Sobrus" }, { plugin: "cold-chain", label: "Température frigos" },
  ];

  APO.agentPrompts = APO.agentPrompts || {};
  APO.agentPrompts.officine = [
    { title: "Relancer les rejets CNSS", skill: "claim-chaser", tools: ["ma.tiers-payant.rejections", "références patient pseudonymes"], kind: "claims", cost: "0,11 DH", summary: "4 rejets analysés sans nom de patient. 3 corrigeables : INPE ajouté depuis l'ordonnance, date vérifiée, immatriculation rectifiée. 1 non remboursable : à facturer au patient.", lines: D.rejections.slice(0, 3).map((r) => ({ label: `${r.id} · ${r.reason}`, why: "Correction préparée · renvoi dans le prochain bordereau", amount: APO.n2(r.amount), rid: r.id })) },
    { title: "Expliquer une suggestion", skill: "explain-suggestion", tools: ["smart-buy.suggestions", "core.sales.dailyByProduct"], cost: "0,04 DH", summary: "Doliprane 1000 : 61 boîtes vendues sur 14 jours (+40 % vs moyenne, saison grippale). Stock 48, couverture 11 jours, délai Dawa 0,5 jour. Commander 60 avec l'UG 20+3 ramène la couverture à 25 jours, sous le plafond de 30 jours fixé pour ce produit.", lines: [] },
  ];

  APO.onApprove.officine = (task, lines) => {
    if (task.kind === "order") {
      const by = {}; lines.forEach((l) => { by[l.wh] = by[l.wh] || []; by[l.wh].push(l); });
      APO.setV((c) => ({ orders: [...Object.entries(by).map(([w, ls], i) => ({ id: "CMD-2611-00" + (43 + i + c.orders.length - 2), wh: w, lines: ls.length, total: ls.reduce((a, l) => a + parseFloat(l.amount.replace(/\s/g, "").replace(",", ".")), 0), status: 0, placed: APO.now(), eta: wh(w).round })), ...c.orders] }));
      Object.keys(by).forEach((w) => APO.log(`Commande envoyée à ${wh(w).name} (validée par le pharmacien)`, "ok"));
    }
    if (task.kind === "claims") { const ids = lines.map((l) => l.rid); APO.setV((c) => ({ rejections: c.rejections.map((r) => (ids.includes(r.id) ? { ...r, fixed: true } : r)) })); APO.log(`${ids.length} FSE corrigées et renvoyées (CNSS)`, "ok"); }
  };

  /* ---------------- shared day totals (home + clôture) ---------------- */
  function dayTotals(st) {
    const B = D.dayBase; const sum = (k) => st.sales.reduce((a, x) => a + (x.parts[k] || 0), 0); const av = (k) => st.avoirs.reduce((a, x) => a + ((x.parts || {})[k] || 0), 0);
    const modes = [["cash", "Espèces", B.cash], ["card", "Carte bancaire", B.card], ["credit", "Carnet (crédit client)", B.credit]].map(([k, label, b]) => ({ k, label, gross: r2(b + sum(k)), av: r2(av(k)) }));
    const ins = { k: "insurer", label: "Part organismes (tiers payant ALD, FAR)", gross: r2(B.insurer + st.sales.reduce((a, x) => a + (x.insurer || 0), 0)), av: r2(st.avoirs.reduce((a, x) => a + (x.insurer || 0), 0)) };
    const rows = [...modes, ins];
    const gross = r2(rows.reduce((a, r) => a + r.gross, 0)); const avT = r2(rows.reduce((a, r) => a + r.av, 0));
    const fse = st.sales.filter((x) => x.fseEst > 0 && !x.avoir);
    return { rows, gross, net: r2(gross - avT), avT, n: B.n + st.sales.length, fseN: B.fse + fse.length, fseAmt: r2(fse.reduce((a, x) => a + x.fseEst, 0)) };
  }

  /* ---------------- HOME ---------------- */
  APO.screens["officine:home"] = function Home() {
    const s = APO.use(); const st = s.officine; const inst = (id) => APO.installed(s, id);
    const T = dayTotals(st); const ca = T.gross; const n = T.n;
    const waiting = st.tasks.filter((t) => t.state === "approval").length;
    const toRecover = st.returns.filter((r) => r.st < 3);
    const imp = (src) => { const j = st.imports[src]; return !j.at ? "À lancer" : (Date.now() - j.at) / 1000 > 5 ? (j.shadow ? "Mode ombre actif" : "Import terminé") : "Import en cours…"; };
    const tiles = [
      { plugin: "core.sales", icon: "receipt", label: "Caisse T02", value: st.z ? "Clôturée" : "Ouverte", sub: st.z ? `${st.z.n} signé · empreinte ${st.z.hash}` : "depuis 08:02 · fond 500,00 DH · Z à signer ce soir", go: "cloture", tone: st.z ? "ok" : "" },
      inst("expiry-radar") && { plugin: "expiry-radar", icon: "clock", label: "Péremptions & retours", value: toRecover.length + " retours", sub: "3 lots à 3 mois + 1 rappel · retour Dawa jusqu'au 30/11", run: goReturns, tone: "warn" },
      inst("smart-buy") && { plugin: "smart-buy", icon: "spark", label: "Suggestions d'achat", value: D.suggestions.length + " produits", sub: whsOn(s).length + " grossistes comparés · tournée 2 avant 11:30", go: "smartbuy" },
      { plugin: "ma.tiers-payant", icon: "card", label: "Rejets tiers payant", value: st.rejections.filter((r) => !r.fixed).length + " FSE", sub: "552,80 DH bloqués", go: "claims", tone: "bad" },
      inst("agent") && { plugin: "agent", icon: "bot", label: "Brouillons à valider", value: String(waiting), sub: "L'assistant ne valide jamais seul", go: "agent" },
      inst("garde") && st.garde.on && { plugin: "garde", icon: "moon", label: "Registre de garde", value: st.garde.count + " passage(s)", sub: `Majoration ${APO.dh(+st.garde.fee || 0)} par ticket`, go: "counter" },
      inst("generics") && { plugin: "generics", icon: "copy", label: "Substitutions génériques", value: String(st.subLog.length), sub: `économie patients ${APO.dh(st.subLog.reduce((a, x) => a + x.saving, 0))} aujourd'hui`, go: "cloture" },
      inst("wh.sud") && { plugin: "wh.sud", icon: "truck", label: "Répartiteur Sud", value: "Connecté", sub: "Nouvelle colonne dans smart-buy · 2 meilleures offres", go: "smartbuy", tone: "ok" },
      inst("import.winpharm") && { plugin: "import.winpharm", icon: "download", label: "Migration Winpharm", value: imp("winpharm"), sub: "Smart-buy alimenté par votre logiciel actuel", go: "migration" },
      inst("import.sobrus") && { plugin: "import.sobrus", icon: "download", label: "Migration Sobrus", value: imp("sobrus"), sub: "Import puis coexistence", go: "migration-sobrus" },
      inst("cold-chain") && { plugin: "cold-chain", icon: "snow", label: "Température frigos", value: "4,8 °C", sub: "FrigoSense · aucune excursion 14 j", go: "home", tone: "ok" },
    ].filter(Boolean);
    return html`<div>
      <${APO.PageH} title="Bonjour Dr. Bennani" sub=${"Mercredi 11 novembre · " + D.org.officine.name + " · terminal " + D.org.officine.terminal}>
        <button className="btn" onClick=${() => APO.set({ palette: true })}><${Icon} n="search" s=${15} />⌘K</button><button className="btn pri" onClick=${() => APO.go("counter")}><${Icon} n="scan" s=${15} />Ouvrir le comptoir</button></${APO.PageH}>
      ${inst("garde") && st.garde.on && html`<div className="adv acc" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="moon" s=${16} /></div><span className="src">Mode garde</span><b>Pharmacie de garde cette nuit · majoration ${APO.dh(+st.garde.fee || 0)} par ticket</b><p>Registre de garde : ${st.garde.count} passage(s). Désactivez depuis le comptoir à la fin de la garde.</p></div>`}
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Chiffre d'affaires du jour" value=${APO.dh(ca)} delta="+8,4 % vs mercredi dernier" tone="up" />
        <${APO.Kpi} label="Ventes" value=${n} delta=${"panier moyen " + APO.dh(ca / n)} />
        <${APO.Kpi} label="Part organismes au comptoir" value=${pctL(T.rows[3].gross / ca)} delta=${"tiers payant ALD & FAR · " + T.fseN + " FSE émises"} />
        <${APO.Kpi} label="Marge brute" value="28,1 %" delta="-0,6 pt (décret PPV)" tone="down" />
      </div>
      <div className="grid g3" style=${{ marginBottom: 16 }}>${tiles.map((t) => html`<div key=${t.label} className="card kpi" style=${{ cursor: "pointer" }} onClick=${() => (t.run ? t.run() : APO.go(t.go))}><span className="row"><${Icon} n=${t.icon} s=${15} />${t.label}${APO.isNew(s, t.plugin) ? html`<${Badge} tone="acc">Nouveau</${Badge}>` : t.plugin.startsWith("core") || t.plugin.startsWith("ma.") ? null : html`<${Badge} mono>plugin</${Badge}>`}</span><b>${t.value}</b><em className=${t.tone === "bad" ? "down" : t.tone === "ok" ? "up" : "muted"}>${t.sub}</em></div>`)}</div>
      <div className="grid g2">
        <div className="col">
          <${Card} title="Ventes · 7 jours" sub="DH TTC" right=${html`<${Badge} tone="ok">+11 %</${Badge}>`}><${APO.Spark} data=${[...D.sales7.slice(0, 6), ca]} /><div className="row small faint" style=${{ justifyContent: "space-between", marginTop: 4 }}>${["jeu", "ven", "sam", "dim", "lun", "mar", "auj."].map((d) => html`<span key=${d}>${d}</span>`)}</div></${Card}>
          <${Card} title="Commandes en cours" pad=${false}><table className="tbl"><tbody>${st.orders.slice(0, 3).map((o) => html`<tr key=${o.id}><td><b>${wh(o.wh).name}</b><div className="faint small mono">${o.id}</div></td><td style=${{ width: "55%" }}><${Steps} at=${o.status} /></td></tr>`)}</tbody></table></${Card}>
        </div>
        <div className="col">
          <${Card} title="File d'exceptions" sub="faits acceptés, à revoir" right=${html`<${Badge} tone=${st.exceptions.length ? "warn" : "ok"}>${st.exceptions.length}</${Badge}>`} pad=${false}>
            ${st.exceptions.length ? html`<table className="tbl"><tbody>${st.exceptions.map((e) => html`<tr key=${e.id}><td className="mono faint" style=${{ width: 54 }}>${e.t}</td><td>${e.text}<div className="faint small mono">${e.ref}</div></td><td className="r"><button className="btn sm" onClick=${() => APO.setV((c) => ({ exceptions: c.exceptions.filter((x) => x.id !== e.id) }))}>Résolu</button></td></tr>`)}</tbody></table>` : html`<div className="empty">Rien à revoir.</div>`}</${Card}>
          <${APO.Events} limit=${6} />
        </div></div></div>`;
  };

  function Steps({ at, steps }) {
    const list = steps || ["Envoyée", "Acceptée", "Préparée", "En tournée", "Livrée"];
    return html`<div className="timeline">${list.map((x, i) => html`<div key=${x} className=${"st" + (i < at ? " done" : i === at ? " cur" : "")}><i></i><span>${x}</span></div>`)}</div>`;
  }

  /* ---------------- COUNTER ---------------- */
  APO.screens["officine:counter"] = function Counter() {
    const s = APO.use(); const st = s.officine; const [q, setQ] = useState(""); const [pickCust, setPickCust] = useState(false);
    const results = D.products.filter((p) => !q || (p.name + p.dci + p.ean).toLowerCase().includes(q.toLowerCase()));
    const add = (p) => {
      const lot = firstLot(st, p.id);
      APO.setV((c) => { const ex = c.basket.find((l) => l.pid === p.id); return { basket: ex ? c.basket.map((l) => (l.pid === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c.basket, { pid: p.id, qty: 1, lot }] }; });
      setQ("");
    };
    const setQty = (pid, d) => APO.setV((c) => ({ basket: c.basket.map((l) => (l.pid === pid ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0) }));
    const cards = APO.cards(s);
    const veto = cards.some((c) => c.tone === "veto");
    const k = calc(s); const cust = k.cust;
    const gardeOn = APO.installed(s, "garde") && st.garde.on;
    const overCeiling = !!(k.parts.credit && cust && st.carnet[cust.id] + k.parts.credit > cust.ceiling);
    const short = (c) => { const x = custOf(c); if (!x) return "Comptoir"; const w = x.name.split(" "); return w[0][0] + ". " + w[w.length - 1]; };
    const park = () => { APO.setV((c) => ({ parked: [...c.parked, { id: APO.uid(), t: APO.now(), label: short(c), items: c.basket.reduce((a, l) => a + l.qty, 0), basket: c.basket, customer: c.customer, rx: c.rx, fse: c.fse, ticketSubs: c.ticketSubs }], basket: [], customer: null, rx: {}, fse: false, ticketSubs: [], pay: "cash" })); APO.toast("Panier mis en attente", "Reprenez-le d'un clic dans la barre du ticket.", "clock"); };
    const restore = (id) => APO.setV((c) => { const p = c.parked.find((x) => x.id === id); const rest = c.parked.filter((x) => x.id !== id); const cur = c.basket.length ? [{ id: APO.uid(), t: APO.now(), label: short(c), items: c.basket.reduce((a, l) => a + l.qty, 0), basket: c.basket, customer: c.customer, rx: c.rx, fse: c.fse, ticketSubs: c.ticketSubs }] : []; return { parked: [...rest, ...cur], basket: p.basket, customer: p.customer, rx: p.rx, fse: p.fse, ticketSubs: p.ticketSubs || [] }; });
    const finalize = () => finalizeSale(s);
    return html`<div className="pos">
      <section>
        <div className="ph">
          <div className="scan"><${Icon} n="scan" /><input id="pos-search" autoFocus placeholder="Scanner un code ou chercher (nom, DCI, EAN)" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && results[0] && add(results[0])} /><kbd className="faint mono small">F2</kbd></div>
          <div className="row small faint"><span>${results.length} produits</span><span className="spacer"></span><span>Prix verrouillés au PPV officiel</span></div>
        </div>
        <div className="scroll">${results.map((p) => { const qty = qtyOf(st, p.id); return html`<div key=${p.id} className="prod" onClick=${() => add(p)}>
          <div><b>${p.name}</b><div className="meta">${p.form} · ${p.dci}</div></div><div className="price">${APO.n2(p.ppv)}</div>
          <div className="flags">${listBadge(p)}${p.para && html`<${Badge} tone="acc">Para · TVA 20 %</${Badge}>`}${p.rate > 0 && html`<${Badge}>Remb. ${Math.round(p.rate * 100)} %${p.base < p.ppv ? " · base " + APO.n2(p.base) : ""}</${Badge}>`}${p.isGeneric && html`<${Badge} tone="info">Générique</${Badge}>`}${qty <= 0 ? html`<${Badge} tone="bad">Rupture</${Badge}>` : qty < 10 ? html`<${Badge} tone="warn">Stock ${qty}</${Badge}>` : html`<${Badge} tone="ok">Stock ${qty}</${Badge}>`}${p.cold && html`<${Badge} tone="info">Froid</${Badge}>`}${st.stock[p.id].some((l) => l.recalled) && html`<${Badge} tone="warn">Lot rappelé</${Badge}>`}</div></div>`; })}</div>
      </section>
      <section>
        <div className="ph"><div className="row"><h3 style=${{ fontSize: 16 }}>Ticket en cours</h3><span className="spacer"></span>
            ${APO.installed(s, "garde") && html`<button id="garde-toggle" className=${"btn sm" + (gardeOn ? " pri" : "")} onClick=${toggleGarde} title="Mode garde : majoration et registre"><${Icon} n="moon" s=${14} />${gardeOn ? "Garde activée" : "Garde"}</button>`}
            ${s.offline && html`<${Badge} tone="warn">Hors ligne · série ${D.org.officine.terminal}</${Badge}>`}<${Badge} mono>N° ${D.org.officine.site}-${D.org.officine.terminal}-2026-${String(st.series + 1).padStart(6, "0")}</${Badge}></div>
          <div className="row" style=${{ gap: 6 }}>
            <button id="park-btn" className="btn sm ghost" disabled=${!st.basket.length} onClick=${park}><${Icon} n="clock" s=${14} />Mettre en attente</button>
            ${st.parked.map((p) => html`<button key=${p.id} className="btn sm" style=${{ borderColor: "var(--accent-line)", background: "var(--accent-soft)" }} onClick=${() => restore(p.id)} title="Reprendre ce panier"><${Icon} n="bag" s=${14} />${p.label} · ${p.items} art. · ${p.t}</button>`)}
            ${!st.parked.length && html`<span className="small faint">Aucun panier en attente</span>`}
          </div></div>
        <div className="scroll">
          ${gardeOn && html`<div className="adv acc" style=${{ marginBottom: 10 }}><div className="ic"><${Icon} n="moon" s=${16} /></div><span className="src">Mode garde · nuit du 11 au 12/11</span><b>Pharmacie de garde · majoration ${APO.dh(+st.garde.fee || 0)} par ticket</b><p>Registre de garde : ${st.garde.count} passage(s) cette nuit. Bandeau affiché sur l'écran client.</p>
            <div className="acts" style=${{ gridColumn: 2, alignItems: "center" }}><span className="small muted">Majoration</span><input id="garde-fee" className="input mono" type="number" min="0" style=${{ width: 80, padding: "4px 8px" }} value=${st.garde.fee} onInput=${(e) => APO.setV((c) => ({ garde: { ...c.garde, fee: e.target.value } }))} /><span className="small muted">DH</span></div></div>`}
          ${!st.basket.length ? html`<div className="empty" style=${{ paddingTop: 50 }}><${Icon} n="scan" s=${32} /><p style=${{ marginTop: 10 }}>Scannez ou cliquez un produit.</p><p className="small" style=${{ marginTop: 6 }}>Essayez : Rivotril (blocage), Smecta (lot rappelé), Augmentin (générique), Doliprane + Dafalgan (doublon), Sintrom + Aspégic après avoir installé « Interactions ».</p></div>` :
          st.basket.map((l) => { const p = prod(l.pid); return html`<div key=${l.pid} className="line"><div><b>${p.name}</b></div><div className="qty"><button onClick=${() => setQty(l.pid, -1)} aria-label="moins">−</button><span>${l.qty}</span><button onClick=${() => setQty(l.pid, 1)} aria-label="plus">+</button></div><div className="amount">${APO.n2(p.ppv * l.qty)}</div>
            <div className="meta">Lot ${l.lot} · ${p.form}${st.rx[l.pid] ? " · Ord. " + st.rx[l.pid].n : ""}${st.ticketSubs.some((x) => x.to === p.name) ? " · substitué" : ""} ${listBadge(p)}</div></div>`; })}
          ${k.garde > 0 && html`<div className="line"><div><b>Majoration de garde</b></div><span className="small faint">forfait</span><div className="amount">${APO.n2(k.garde)}</div><div className="meta">Mode garde · non remboursable · inscrite au registre de garde</div></div>`}
          ${cards.length > 0 && html`<div className="col" style=${{ marginTop: 14 }}><div className="row small faint"><${Icon} n="puzzle" s=${14} />Cartes fournies par les plugins installés</div>${cards.map((c, i) => html`<${APO.Adv} key=${i} c=${c} />`)}</div>`}
        </div>
      </section>
      <section>
        <div className="ph">
          ${cust ? html`<div className="cust" onClick=${() => setPickCust(true)}><div className="avatar">${cust.initials}</div><div style=${{ minWidth: 0 }}><b>${cust.name}</b><div className="small faint">${cust.cover}${cust.ald ? " · ALD" : ""} · ${cust.immat}</div><div className="row" style=${{ gap: 4, marginTop: 3 }}>${isDirect(cust) ? html`<${Badge} tone="ok">Tiers payant ${tpLabel(cust)}</${Badge}>` : hasCover(cust) ? html`<${Badge} tone="info">Paie tout · FSE</${Badge}>` : html`<${Badge}>Sans couverture</${Badge}>`}</div></div><button className="btn ghost sm" style=${{ marginLeft: "auto" }} onClick=${(e) => { e.stopPropagation(); APO.setV({ customer: null, fse: false }); }}>Retirer</button></div>`
            : html`<button className="cust" onClick=${() => setPickCust(true)} style=${{ width: "100%" }}><div className="avatar"><${Icon} n="users" s=${16} /></div><div style=${{ textAlign: "left" }}><b>Client comptoir</b><div className="small faint">Associer un patient (FSE, tiers payant, carnet)</div></div></button>`}
          ${pickCust && html`<div className="card" style=${{ padding: 6 }}>${D.customers.map((c) => html`<div key=${c.id} className="cust" style=${{ marginBottom: 4, background: "none", border: 0 }} onClick=${() => { APO.setV({ customer: c.id, fse: false }); setPickCust(false); }}><div className="avatar">${c.initials}</div><div><b>${c.name}</b><div className="small faint">${c.cover}${c.ald ? " · " + c.aldLabel : ""} · carnet ${APO.dh(st.carnet[c.id])}</div></div>${isDirect(c) && html`<span style=${{ marginLeft: "auto" }}><${Badge} tone="ok">Tiers payant</${Badge}></span>`}</div>`)}</div>`}
        </div>
        <div className="scroll">
          <div className="totals">
            <div><span className="muted">Total TTC</span><span className="mono">${APO.dh(k.total)}</span></div>
            ${k.garde > 0 && html`<div><span className="muted">dont majoration de garde</span><span className="mono">${APO.dh(k.garde)}</span></div>`}
            ${k.vat > 0 && html`<div><span className="muted">dont TVA 20 % (para)</span><span className="mono">${APO.dh(k.vat)}</span></div>`}
            ${k.insurer > 0 && html`<div><span className="muted">Part ${cust.cover} · tiers payant ${tpLabel(cust)}</span><span className="mono" style=${{ color: "var(--ok)" }}>− ${APO.dh(k.insurer)}</span></div>`}
            <div className="big"><span>À payer</span><span className="num">${APO.dh(k.patient)}</span></div>
          </div>
          ${k.fseEst > 0 && html`<div className="adv info" style=${{ marginTop: 10 }}><div className="ic"><${Icon} n="card" s=${16} /></div><span className="src">FSE · CNSS</span><b>FSE générée : remboursement estimé ${APO.dh(k.fseEst)}</b><p>${k.rateLabel} × base de remboursement ${APO.dh(k.baseSum)}${k.baseSum < k.sub ? " (inférieure au PPV pour les princeps)" : ""}. Le patient paie la totalité ici ; la CNSS le rembourse directement.</p></div>`}
          ${k.insurer > 0 && html`<p className="small faint" style=${{ marginTop: 8 }}>${k.rateLabel} × base ${APO.dh(k.baseSum)} déduit au comptoir · ${cust.ald ? "patient en ALD : la pharmacie est payée par la CNSS sur bordereau" : "convention Mutuelle FAR : facturée sur bordereau"}.</p>`}
          <div className="sep"></div>
          <div className="field" style=${{ marginBottom: 8 }}>Mode de paiement</div>
          <div className="pay" style=${{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <button className=${st.pay === "cash" ? "on" : ""} onClick=${() => APO.setV({ pay: "cash" })}><${Icon} n="receipt" s=${18} />Espèces</button>
            <button className=${st.pay === "card" ? "on" : ""} onClick=${() => APO.setV({ pay: "card" })}><${Icon} n="card" s=${18} />Carte${APO.installed(s, "tpe") ? " · TPE" : ""}</button>
            <button className=${st.pay === "credit" ? "on" : ""} disabled=${!cust} onClick=${() => APO.setV({ pay: "credit" })}><${Icon} n="book" s=${18} />Carnet</button>
            <button id="pay-mixed" className=${st.pay === "mixed" ? "on" : ""} onClick=${() => APO.setV((c) => ({ pay: "mixed", split: { ...c.split, with: c.split.with === "credit" && !custOf(c) ? "card" : c.split.with } }))}><${Icon} n="grid" s=${18} />Mixte</button>
          </div>
          ${st.pay === "mixed" && html`<div className="card" style=${{ padding: 10, marginTop: 8, display: "grid", gap: 8 }}>
            <div className="row"><span className="small muted">Espèces</span><input id="split-cash" className="input mono" type="number" min="0" placeholder="0,00" style=${{ width: 100, padding: "5px 8px" }} value=${st.split.cash} onInput=${(e) => APO.setV((c) => ({ split: { ...c.split, cash: e.target.value } }))} /><span className="small muted">reste en</span>
              <div className="pill-toggle"><button className=${st.split.with === "card" ? "on" : ""} onClick=${() => APO.setV((c) => ({ split: { ...c.split, with: "card" } }))}>Carte</button><button className=${st.split.with === "credit" ? "on" : ""} disabled=${!cust} onClick=${() => APO.setV((c) => ({ split: { ...c.split, with: "credit" } }))}>Carnet</button></div></div>
            <div className="row small"><span>Espèces <b className="mono">${APO.n2(k.parts.cash || 0)}</b></span><span className="spacer"></span><span>${PAY[st.split.with]} <b className="mono">${APO.n2(k.parts[st.split.with] || 0)}</b></span></div></div>`}
          ${overCeiling && html`<div className="adv veto" style=${{ marginTop: 10 }}><div className="ic"><${Icon} n="users" s=${16} /></div><span className="src">Carnet client</span><b>Plafond du carnet dépassé</b><p>Encaisser une partie (paiement mixte) ou choisir un autre mode.</p></div>`}
          <div className="sep"></div>
          <button className="btn pri lg" style=${{ width: "100%", justifyContent: "center" }} disabled=${!st.basket.length || veto || overCeiling} onClick=${finalize}><${Icon} n="check" />Encaisser ${APO.dh(k.patient)}</button>
          ${veto && html`<p className="small" style=${{ color: "var(--bad)", marginTop: 8, textAlign: "center" }}>Vente bloquée par le pack Maroc : seul le code certifié peut bloquer.</p>`}
          <p className="small faint" style=${{ marginTop: 10, textAlign: "center" }}>${s.offline ? "Hors ligne : la vente est un fait définitif, synchronisé au retour du réseau." : "Les partenaires conseillent ; seul le pack Maroc peut bloquer une vente."}</p>
        </div>
      </section>
      ${st.rxFor && html`<${RxModal} pid=${st.rxFor} />`}
      ${st.receipt && html`<${Receipt} r=${st.receipt} />`}
    </div>`;
  };

  function finalizeSale(s) {
    const st = s.officine; const org = D.org.officine; const seq = st.series + 1; const k = calc(s);
    const n = `${org.site}-${org.terminal}-2026-${String(seq).padStart(6, "0")}`;
    const hash = APO.hash(st.lastHash + n + k.total.toFixed(2));
    const cust = k.cust;
    let negative = null;
    const stock = { ...st.stock };
    st.basket.forEach((l) => { stock[l.pid] = stock[l.pid].map((x) => (x.lot === l.lot ? { ...x, qty: x.qty - l.qty } : x)); if (stock[l.pid].find((x) => x.lot === l.lot).qty < 0) negative = prod(l.pid).name; });
    const ord = st.basket.filter((l) => prod(l.pid).list === "I" && st.rx[l.pid]).map((l, i) => ({ n: "ORD-2026-00" + (4813 + i + st.ordonnancier.length - 3), date: "11/11 " + APO.now(), pid: l.pid, qty: l.qty, prescriber: st.rx[l.pid].prescriber, patient: cust ? "Pat. #" + cust.id.toUpperCase() : "Pat. comptoir" }));
    const stp = st.basket.filter((l) => prod(l.pid).list === "B" && st.rx[l.pid]).map((l) => ({ date: "11/11", pid: l.pid, in: 0, out: l.qty, balance: (st.stup[0] ? st.stup[0].balance : 20) - l.qty, ref: `Ordonnance sur carnet à souches ${st.rx[l.pid].n} · ${st.rx[l.pid].prescriber}` }));
    const lines = st.basket.map((l) => ({ pid: l.pid, name: prod(l.pid).name, qty: l.qty, lot: l.lot, amount: r2(prod(l.pid).ppv * l.qty), para: !!prod(l.pid).para }));
    const sale = { n, t: APO.now(), cust: cust ? cust.name : null, cover: cust && hasCover(cust) ? cust.cover + (cust.ald ? " · ALD" : "") : null, total: k.total, garde: k.garde, insurer: k.insurer, fseEst: k.fseEst, patient: k.patient, pay: st.pay, parts: k.parts, lines, subs: st.ticketSubs };
    const receipt = { ...sale, hash, prev: st.lastHash, vat: k.vat, offline: s.offline, fse: st.fse, fseN: k.fseEst > 0 || (k.insurer > 0 && cust.ald) ? "FSE-8" + String(8200 + seq) : null, tp: tpLabel(cust), coverName: cust ? cust.cover : null, rateLabel: k.rateLabel, baseSum: k.baseSum };
    APO.setV((c) => ({ series: seq, lastHash: hash, stock, basket: [], rx: {}, fse: false, receipt, pay: "cash", split: { ...c.split, cash: "" }, ticketSubs: [], sales: [...c.sales, sale], ordonnancier: [...ord, ...c.ordonnancier], stup: [...stp, ...c.stup], carnet: k.parts.credit && cust ? { ...c.carnet, [cust.id]: c.carnet[cust.id] + k.parts.credit } : c.carnet, garde: k.garde ? { ...c.garde, count: c.garde.count + 1 } : c.garde }));
    if (s.offline) APO.set((x) => ({ queue: [...x.queue, { n, exception: negative ? `Stock négatif : ${negative} (vente hors ligne ${n})` : null }] }));
    APO.log(`Vente ${n} · ${APO.dh(k.total)} · ${partsText(k.parts)}${k.insurer ? " · tiers payant " + APO.dh(k.insurer) : ""}${k.fseEst ? " · FSE (remb. patient " + APO.dh(k.fseEst) + ")" : ""}${s.offline ? " · hors ligne" : ""}`, "ok");
    if (k.garde) APO.log(`Registre de garde : passage ${n} · majoration ${APO.dh(k.garde)}`, "info");
    if (ord.length) APO.log(`${ord.length} inscription(s) à l'ordonnancier`, "info");
    if (stp.length) APO.log(`Registre des stupéfiants : sortie ${stp.map((x) => prod(x.pid).name).join(", ")}`, "warn");
  }

  /* returns: a linked credit note, stock back into the lot, the ticket is never deleted */
  function makeAvoir(n) {
    const st = APO.get().officine; const sale = st.sales.find((x) => x.n === n); if (!sale || sale.avoir) return;
    const av = "AV-2026-" + String(st.avoirSeq + 1).padStart(4, "0");
    const hash = APO.hash(st.lastHash + av + sale.total.toFixed(2));
    const stock = { ...st.stock }; sale.lines.forEach((l) => { if (stock[l.pid]) stock[l.pid] = stock[l.pid].map((x) => (x.lot === l.lot ? { ...x, qty: x.qty + l.qty } : x)); });
    const cust = D.customers.find((c) => c.name === sale.cust);
    APO.setV((c) => ({ avoirSeq: c.avoirSeq + 1, lastHash: hash, stock, sales: c.sales.map((x) => (x.n === n ? { ...x, avoir: av } : x)), avoirs: [{ n: av, t: APO.now(), sale: n, total: sale.total, amount: sale.patient, parts: sale.parts, insurer: sale.insurer, hash }, ...c.avoirs], carnet: sale.parts.credit && cust ? { ...c.carnet, [cust.id]: Math.max(0, c.carnet[cust.id] - sale.parts.credit) } : c.carnet, receipt: c.receipt && c.receipt.n === n ? { ...c.receipt, avoir: av } : c.receipt }));
    APO.toast(`Avoir ${av} émis`, `Lié au ticket ${n}, qui reste au journal. ${sale.lines.reduce((a, l) => a + l.qty, 0)} boîte(s) remise(s) dans leur lot. Remboursé : ${partsText(sale.parts)}.`, "receipt");
    APO.log(`Avoir ${av} · ${APO.dh(sale.patient)} · ticket ${n} conservé, stock réintégré`, "warn");
    if (sale.insurer) APO.log(`Part organisme ${APO.dh(sale.insurer)} retirée du prochain bordereau`, "info");
  }

  function RxModal({ pid }) {
    const p = prod(pid); const B = p.list === "B";
    const [n, setN] = useState(B ? "CS-55" + Math.floor(100 + Math.random() * 800) : "ORD-" + Math.floor(1000 + Math.random() * 8000)); const [pr, setPr] = useState(B ? "30417" : "11028");
    const doc = D.prescribers.find((d) => d.inpe === pr);
    const close = () => APO.setV({ rxFor: null });
    return html`<${APO.Modal} onClose=${close}><div className="card-h"><${Icon} n="shield" /><h3>${B ? "Ordonnance sur carnet à souches" : "Ordonnance"} · ${p.name}</h3></div>
      <div className="card-b col">
        <label className="field">${B ? "N° du feuillet (carnet à souches)" : "N° d'ordonnance"}<input id="rx-n" className="input mono" value=${n} onInput=${(e) => setN(e.target.value)} /></label>
        <label className="field">Prescripteur · annuaire INPE<select id="rx-p" className="input" value=${pr} onChange=${(e) => setPr(e.target.value)}>${D.prescribers.map((d) => html`<option key=${d.inpe} value=${d.inpe}>${d.name} · INPE ${d.inpe} · ${d.spec}</option>`)}</select></label>
        <div className="row small faint"><${Icon} n="check" s=${14} />INPE vérifié dans l'annuaire : évite le rejet « INPE prescripteur manquant » sur la FSE.</div>
        <div className="adv info"><div className="ic"><${Icon} n="book" s=${16} /></div><span className="src">Registres légaux</span><b>${B ? "Inscription au registre des stupéfiants" : "Inscription à l'ordonnancier"}</b><p>Numérotée, horodatée, chaînée par hachage. Consultable par l'inspecteur.</p></div>
        <div className="row" style=${{ justifyContent: "flex-end" }}><button className="btn ghost" onClick=${close}>Annuler</button><button className="btn pri" onClick=${() => { APO.setV((c) => ({ rx: { ...c.rx, [pid]: { n, prescriber: `${doc.name} · INPE ${doc.inpe}` } }, rxFor: null })); APO.toast("Ordonnance enregistrée", "Le blocage est levé pour " + p.name + "."); }}>Enregistrer</button></div></div></${APO.Modal}>`;
  }

  function Receipt({ r }) {
    const org = D.org.officine; const close = () => APO.setV({ receipt: null });
    const para = r.lines.filter((l) => l.para).reduce((a, l) => a + l.amount, 0);
    const meds = r.lines.filter((l) => !l.para).reduce((a, l) => a + l.amount, 0);
    return html`<${APO.Modal} onClose=${close}><div className="card-h"><${Icon} n="receipt" /><h3>${r.avoir ? "Vente annulée par avoir" : "Vente encaissée"}</h3><span className="spacer"></span>${r.avoir ? html`<${Badge} tone="warn">Avoir ${r.avoir}</${Badge}>` : r.offline ? html`<${Badge} tone="warn">Hors ligne · en file</${Badge}>` : html`<${Badge} tone="ok">Synchronisée</${Badge}>`}</div>
      <div className="card-b col">
        <div className="receipt">
          <div className="c"><b>${org.name.toUpperCase()}</b></div><div className="c">${org.city} · ${org.pharmacist}</div><div className="c">ICE ${org.ice} · IF ${org.if} · RC ${org.rc}</div><hr />
          ${r.lines.map((l, i) => html`<div key=${i} className="rr"><span>${l.qty} × ${l.name}</span><span>${APO.n2(l.amount)}</span></div>`)}
          ${r.garde > 0 && html`<div className="rr"><span>Majoration de garde</span><span>${APO.n2(r.garde)}</span></div>`}<hr />
          <div className="rr"><span>TOTAL TTC</span><span>${APO.n2(r.total)}</span></div>
          <div className="rr"><span>Médicaments TVA 0 %</span><span>${APO.n2(meds)}</span></div>
          ${para > 0 && html`<div className="rr"><span>Para (dont TVA 20 % ${APO.n2(r.vat)})</span><span>${APO.n2(para)}</span></div>`}
          ${r.insurer > 0 && html`<div className="rr"><span>Part ${r.coverName} (tiers payant ${r.tp})</span><span>-${APO.n2(r.insurer)}</span></div>`}
          <div className="rr"><b>NET À PAYER</b><b>${APO.n2(r.patient)}</b></div>
          ${Object.entries(r.parts).filter(([, v]) => v > 0).map(([kk, v]) => html`<div key=${kk} className="rr"><span>Paiement ${PAY[kk]}</span><span>${APO.n2(v)}</span></div>`)}
          ${r.fseEst > 0 && html`<${React.Fragment}><hr /><div className="rr"><span>${r.fseN} · ${r.coverName}</span><span>générée</span></div><div className="rr"><span>Remb. estimé au patient (${r.rateLabel} × base ${APO.n2(r.baseSum)})</span><span>${APO.n2(r.fseEst)}</span></div></${React.Fragment}>`}
          ${r.subs && r.subs.length > 0 && html`<${React.Fragment}><hr />${r.subs.map((x, i) => html`<div key=${i} className="rr"><span>Substitution : ${x.from} → ${x.to}</span><span>accord patient</span></div>`)}</${React.Fragment}>`}<hr />
          <div className="rr"><span>N°</span><span>${r.n}</span></div>
          <div className="rr"><span>Chaîne</span><span>${r.prev} → ${r.hash}</span></div>
          ${r.avoir && html`<div className="rr"><b>AVOIR ${r.avoir}</b><b>-${APO.n2(r.total)}</b></div>`}
          <div className="c" style=${{ marginTop: 6 }}>شكرا لزيارتكم · Merci de votre visite</div>
        </div>
        <p className="small faint">Mentions légales verrouillées par le pack Maroc. Numéro définitif attribué par le terminal : jamais renuméroté, même hors ligne. Une annulation crée un avoir lié ; le ticket n'est jamais supprimé.</p>
        <div className="row" style=${{ justifyContent: "flex-end" }}><button id="receipt-return" className="btn danger" disabled=${!!r.avoir} onClick=${() => makeAvoir(r.n)}><${Icon} n="refresh" s=${15} />Annuler / retour</button><span className="spacer"></span><button className="btn" onClick=${() => APO.toast("Ticket imprimé", "Imprimante thermique du comptoir.")}><${Icon} n="printer" s=${15} />Imprimer</button><button className="btn pri" onClick=${close}>Nouvelle vente</button></div></div></${APO.Modal}>`;
  }

  /* ---------------- CLÔTURE DE CAISSE ---------------- */
  APO.screens["officine:cloture"] = function Cloture() {
    const s = APO.use(); const st = s.officine; const B = D.dayBase; const cl = st.cloture; const T = dayTotals(st);
    const [outAmt, setOutAmt] = useState(""); const [outWhy, setOutWhy] = useState("Rouleaux de tickets");
    const cash = T.rows[0]; const outs = r2(st.cashOuts.reduce((a, x) => a + x.amount, 0)); const dep = +cl.deposit || 0;
    const expected = r2(B.float + cash.gross - cash.av - outs - dep);
    const diff = cl.counted === "" ? null : r2(+cl.counted - expected);
    const closed = !!st.z;
    const [depIn, setDepIn] = useState(String(Math.max(0, Math.floor((expected - B.float) / 1000) * 1000)));
    const setCl = (patch) => APO.setV((c) => ({ cloture: { ...c.cloture, ...patch } }));
    const addOut = () => { const a = +outAmt; if (!a) return; APO.setV((c) => ({ cashOuts: [...c.cashOuts, { id: "SC-" + String(31 + c.cashOuts.length).padStart(4, "0"), t: APO.now(), amount: a, why: outWhy }] })); APO.log(`Sortie de caisse ${APO.dh(a)} · ${outWhy}`, "info"); setOutAmt(""); };
    const deposit = () => { const a = +depIn; if (!a) return; setCl({ deposit: a, depositRef: "RB-2026-0187" }); APO.log(`Remise en banque préparée RB-2026-0187 · ${APO.dh(a)} espèces`, "info"); APO.toast("Bordereau de remise prêt", "RB-2026-0187 · " + APO.dh(a) + " · à déposer à la banque demain matin.", "download"); };
    const close = () => {
      const hash = APO.hash(st.lastHash + Z_NUM + T.net.toFixed(2) + expected.toFixed(2));
      APO.setV((c) => ({ z: { n: Z_NUM, hash, t: APO.now(), ca: T.net, diff, expected }, lastHash: hash, exceptions: diff ? [{ id: APO.uid(), t: APO.now(), text: `Écart caisse T02 : ${diff > 0 ? "+" : ""}${APO.n2(diff)} DH à la clôture (compté ${APO.n2(+c.cloture.counted)} / attendu ${APO.n2(expected)})`, ref: Z_NUM }, ...c.exceptions] : c.exceptions }));
      APO.log(`Clôture ${Z_NUM} signée · CA net ${APO.dh(T.net)} · écart ${APO.n2(diff)} DH · empreinte ${hash}`, diff ? "warn" : "ok");
      APO.toast(`${Z_NUM} signé`, diff ? `Écart de ${APO.n2(diff)} DH envoyé dans la file d'exceptions de l'accueil.` : "Caisse juste. Série du terminal scellée pour la journée.", "receipt");
    };
    const sales = st.sales.slice().reverse();
    return html`<div>
      <${APO.PageH} title="Clôture de caisse" sub=${`Terminal ${D.org.officine.terminal} · session ouverte à 08:02 par ${D.org.officine.pharmacist} · fond de caisse ${APO.dh(B.float)}`}>
        <button id="z-sign" className="btn pri" disabled=${closed || cl.counted === ""} onClick=${close}><${Icon} n="lock" s=${15} />${closed ? st.z.n + " signé" : "Clôturer et signer le Z"}</button></${APO.PageH}>
      ${closed && html`<div className="adv good" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="check" s=${16} /></div><span className="src">Ticket Z · ${st.z.t}</span><b>${st.z.n} signé · empreinte ${st.z.hash} · CA net ${APO.dh(st.z.ca)}</b><p>${st.z.diff ? `Écart de ${APO.n2(st.z.diff)} DH placé dans la file d'exceptions de l'accueil.` : "Aucun écart de caisse."} Le Z est chaîné au registre fiscal : il ne peut plus être modifié.</p></div>`}
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="Chiffre d'affaires net" value=${APO.dh(T.net)} delta=${`brut ${APO.dh(T.gross)}`} />
        <${APO.Kpi} label="Tickets" value=${T.n} delta=${st.avoirs.length + " avoir(s) · " + APO.dh(T.avT)} tone=${st.avoirs.length ? "down" : ""} />
        <${APO.Kpi} label="Espèces attendues" value=${APO.dh(expected)} delta="fond + espèces − sorties − remise" />
        <${APO.Kpi} label="FSE émises" value=${T.fseN} delta=${"remb. patients hors caisse · dont " + APO.dh(T.fseAmt) + " ici"} />
      </div>
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        <${Card} title="Totaux par mode de paiement" sub="calculés depuis les tickets du jour" pad=${false}><table className="tbl"><thead><tr><th>Mode</th><th className="r">Ventes</th><th className="r">Avoirs</th><th className="r">Net</th></tr></thead>
          <tbody>${T.rows.map((r) => html`<tr key=${r.k}><td>${r.label}</td><td className="r mono">${APO.n2(r.gross)}</td><td className="r mono">${r.av ? "− " + APO.n2(r.av) : "—"}</td><td className="r mono"><b>${APO.n2(r.gross - r.av)}</b></td></tr>`)}
            <tr><td><b>Total</b></td><td className="r mono">${APO.n2(T.gross)}</td><td className="r mono">${T.avT ? "− " + APO.n2(T.avT) : "—"}</td><td className="r mono"><b>${APO.n2(T.net)}</b></td></tr></tbody></table>
          <div className="card-b small faint">Les patients CNSS ordinaires paient tout au comptoir : leur remboursement passe par la FSE et n'entre pas en caisse.</div></${Card}>
        <${Card} title="Comptage des espèces" sub="compté vs attendu" right=${diff === null ? html`<${Badge}>À compter</${Badge}>` : html`<${Badge} tone=${diff === 0 ? "ok" : "warn"}>${diff === 0 ? "Caisse juste" : "Écart " + (diff > 0 ? "+" : "") + APO.n2(diff)}</${Badge}>`}>
          <div className="totals">
            <div><span className="muted">Fond de caisse</span><span className="mono">${APO.n2(B.float)}</span></div>
            <div><span className="muted">+ Espèces nettes (ventes − avoirs)</span><span className="mono">${APO.n2(cash.gross - cash.av)}</span></div>
            <div><span className="muted">− Sorties de caisse</span><span className="mono">${APO.n2(outs)}</span></div>
            <div><span className="muted">− Remise en banque</span><span className="mono">${APO.n2(dep)}</span></div>
            <div className="big"><span>Attendu</span><span className="num">${APO.dh(expected)}</span></div>
          </div>
          <div className="row" style=${{ marginTop: 12 }}><label className="field" style=${{ flex: 1 }}>Espèces comptées (DH)<input id="cash-count" className="input mono" type="number" disabled=${closed} placeholder=${APO.n2(expected)} value=${cl.counted} onInput=${(e) => setCl({ counted: e.target.value })} /></label>
            <button className="btn sm" disabled=${closed} style=${{ alignSelf: "end" }} onClick=${() => setCl({ counted: String(expected) })}>Égal à l'attendu</button></div>
          ${diff !== null && diff !== 0 && html`<p className="small" style=${{ color: "var(--warn)", marginTop: 8 }}>L'écart de ${APO.n2(diff)} DH sera inscrit sur le Z et ajouté à la file d'exceptions de l'accueil.</p>`}</${Card}>
      </div>
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        <${Card} title="Sorties de caisse" sub="petite caisse, justifiées" pad=${false}>
          ${st.cashOuts.length ? html`<table className="tbl"><tbody>${st.cashOuts.map((x) => html`<tr key=${x.id}><td className="mono">${x.id}</td><td className="mono faint">${x.t}</td><td>${x.why}</td><td className="r mono">− ${APO.n2(x.amount)}</td></tr>`)}</tbody></table>` : html`<div className="empty" style=${{ padding: 16 }}>Aucune sortie aujourd'hui.</div>`}
          <div className="card-b row"><input id="out-amt" className="input mono" type="number" placeholder="Montant" style=${{ width: 110 }} disabled=${closed} value=${outAmt} onInput=${(e) => setOutAmt(e.target.value)} /><select className="input" style=${{ flex: 1, minWidth: 160 }} disabled=${closed} value=${outWhy} onChange=${(e) => setOutWhy(e.target.value)}>${["Rouleaux de tickets", "Produits d'entretien", "Course coursier", "Remboursement monnaie"].map((o) => html`<option key=${o}>${o}</option>`)}</select><button className="btn sm" disabled=${closed || !outAmt} onClick=${addOut}><${Icon} n="minus" s=${14} />Sortie</button></div></${Card}>
        <${Card} title="Remise en banque" sub="espèces déposées" right=${cl.depositRef && html`<${Badge} tone="ok" mono>${cl.depositRef}</${Badge}>`}>
          <p className="small muted" style=${{ marginBottom: 10 }}>On garde le fond de caisse pour demain ; le reste part en banque avec un bordereau numéroté.</p>
          <div className="row"><input id="dep-amt" className="input mono" type="number" style=${{ width: 140 }} disabled=${closed || !!cl.depositRef} value=${depIn} onInput=${(e) => setDepIn(e.target.value)} /><button className="btn" disabled=${closed || !!cl.depositRef} onClick=${deposit}><${Icon} n="download" s=${15} />${cl.depositRef ? "Bordereau préparé" : "Préparer le bordereau"}</button></div>
          ${cl.depositRef && html`<p className="small faint" style=${{ marginTop: 8 }}>${cl.depositRef} · ${APO.dh(dep)} · Banque Populaire, agence Maârif.</p>`}</${Card}>
      </div>
      <${Card} title="Ventes du jour" sub=${"terminal " + D.org.officine.terminal + " · depuis l'ouverture de la démo"} right=${html`<${Badge}>${sales.length} tickets</${Badge}>`} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>N°</th><th>Heure</th><th>Client</th><th>Paiement</th><th className="r">Total</th><th className="r">Part org.</th><th>Statut</th><th></th></tr></thead>
        <tbody>${sales.map((x) => html`<tr key=${x.n}><td className="mono small">${x.n}</td><td className="mono faint">${x.t}</td><td className="small">${x.cust || "Comptoir"}${x.cover ? html`<div className="faint small">${x.cover}${x.fseEst ? " · FSE" : ""}</div>` : null}</td><td className="small">${partsText(x.parts)}</td><td className="r mono">${APO.n2(x.total)}</td><td className="r mono">${x.insurer ? APO.n2(x.insurer) : "—"}</td>
          <td>${x.avoir ? html`<${Badge} tone="warn" mono>Avoir ${x.avoir}</${Badge}>` : html`<${Badge} tone="ok">Encaissée</${Badge}>`}</td><td className="r"><button className="btn sm" disabled=${!!x.avoir || closed} onClick=${() => makeAvoir(x.n)}>Annuler / retour</button></td></tr>`)}</tbody></table></div></${Card}>
      <div className="grid g2" style=${{ marginTop: 16 }}>
        ${APO.installed(s, "generics") && html`<${Card} title="Journal des substitutions" sub="plugin Substitution générique" pad=${false}><table className="tbl"><tbody>${st.subLog.map((x, i) => html`<tr key=${i}><td className="mono faint">${x.t}</td><td>${x.from} → <b>${x.to}</b></td><td className="r mono" style=${{ color: "var(--ok)" }}>− ${APO.n2(x.saving)}</td></tr>`)}</tbody></table></${Card}>`}
        ${APO.installed(s, "garde") && html`<${Card} title="Registre de garde" sub="plugin Mode garde"><div className="row"><${Icon} n="moon" s=${16} /><b>${st.garde.count} passage(s)</b><span className="muted small">majoration ${APO.dh(+st.garde.fee || 0)} · ${st.garde.on ? "garde en cours" : "garde inactive"}</span></div><p className="small faint" style=${{ marginTop: 6 }}>Total majorations : ${APO.dh(st.sales.reduce((a, x) => a + (x.garde || 0), 0))} · reporté sur le Z.</p></${Card}>`}
      </div>
    </div>`;
  };

  /* ---------------- STOCK ---------------- */
  APO.screens["officine:stock"] = function Stock() {
    const s = APO.use(); const st = s.officine; const [tab, setTab] = useState("all"); const [open, setOpen] = useState(null);
    const rows = D.products.map((p) => { const lots = st.stock[p.id]; const ok = lots.filter((l) => !l.recalled); return { p, qty: ok.reduce((a, l) => a + l.qty, 0), exp: ok.map((l) => l.exp).sort()[0], lots }; });
    const soon = rows.filter((r) => r.exp && r.exp <= "2026-12");
    const sel = open && rows.find((r) => r.p.id === open);
    return html`<div>
      <${APO.PageH} title="Stock" sub="Lots, péremptions et prix réglementés. Chaque mouvement est un événement du registre de stock.">
        <button className="btn" onClick=${() => APO.go("inventory")}><${Icon} n="box" s=${15} />Inventaire</button><button className="btn" onClick=${() => APO.toast("64 étiquettes envoyées", "Imprimante d'étiquettes · décret PPV 2.25.631")}><${Icon} n="printer" s=${15} />Étiquettes PPV</button></${APO.PageH}>
      <div className="adv warn" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="alert" s=${16} /></div><span className="src">Pack Maroc · Rappel AMMPS du 07/11/2026</span><b>Rappel Smecta 3 g, lot SM4410 : 7 boîtes en quarantaine, vente bloquée</b><p>Le comptoir utilise automatiquement le lot SM4502. Retour grossiste préparé.</p><div className="acts" style=${{ gridColumn: 2 }}><button className="btn sm" onClick=${goReturns}>Voir les retours grossiste</button></div></div>
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "all", label: "Tous les produits", count: rows.length }, { id: "exp", label: "Radar péremptions", count: APO.installed(s, "expiry-radar") ? soon.length : null }, { id: "out", label: "Ruptures", count: rows.filter((r) => r.qty <= 0).length }]} />
      ${tab === "exp" && !APO.installed(s, "expiry-radar") ? html`<div className="card card-b empty">Le radar des péremptions est un plugin. <button className="btn sm pri" onClick=${() => APO.go("market")}>Voir dans le marketplace</button></div>` : html`
      <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>DCI</th><th>Statut</th><th className="r">Stock</th><th>Péremption</th><th className="r">PPV</th><th className="r">Base remb.</th><th className="r">Valeur (PPH)</th></tr></thead>
        <tbody>${(tab === "exp" ? soon : tab === "out" ? rows.filter((r) => r.qty <= 0) : rows).map((r) => html`<tr key=${r.p.id} className="click" onClick=${() => setOpen(r.p.id)}><td><b>${r.p.name}</b><div className="faint small">${r.p.form}</div></td><td className="small">${r.p.dci}</td><td><div className="row" style=${{ gap: 4 }}>${listBadge(r.p)}${r.p.isGeneric && html`<${Badge} tone="info">Générique</${Badge}>`}${r.lots.some((l) => l.recalled) && html`<${Badge} tone="warn">Rappel</${Badge}>`}${r.p.cold && html`<${Badge} tone="info">Froid</${Badge}>`}${r.p.para && html`<${Badge} tone="acc">Para</${Badge}>`}</div></td>
          <td className="r mono">${r.qty <= 0 ? html`<span style=${{ color: "var(--bad)" }}>${r.qty}</span>` : r.qty}</td><td className="mono small">${r.exp && r.exp <= "2026-12" ? html`<span style=${{ color: "var(--warn)" }}>${r.exp}</span>` : r.exp}</td><td className="r mono">${APO.n2(r.p.ppv)}</td><td className="r mono">${r.p.rate ? APO.n2(r.p.base) : "—"}</td><td className="r mono">${APO.n2(Math.max(r.qty, 0) * r.p.pph)}</td></tr>`)}</tbody></table></div></${Card}>`}
      ${sel && html`<${APO.Drawer} title=${sel.p.name} onClose=${() => setOpen(null)}>
        <div className="row" style=${{ marginBottom: 12 }}>${listBadge(sel.p)}<${Badge} mono>${sel.p.amm || "Sans AMM"}</${Badge}><${Badge} mono>EAN ${sel.p.ean}</${Badge}></div>
        <${Card} title="Référence produit partagée" sub="AMM + EAN + historique PPV"><table className="tbl"><tbody><tr><td className="muted">DCI</td><td>${sel.p.dci}</td></tr><tr><td className="muted">PPV actuel</td><td className="mono">${APO.n2(sel.p.ppv)} (décret 01/08/2026)</td></tr><tr><td className="muted">PPV précédent</td><td className="mono">${APO.n2(sel.p.ppv * 1.04)}</td></tr><tr><td className="muted">Remboursement</td><td>${Math.round(sel.p.rate * 100)} %${sel.p.rate ? " de la base " + APO.n2(sel.p.base) + " DH" : ""}</td></tr>${sel.p.generic && html`<tr><td className="muted">Générique</td><td>${prod(sel.p.generic).name} · ${APO.n2(prod(sel.p.generic).ppv)} DH</td></tr>`}</tbody></table></${Card}>
        <div style=${{ height: 12 }}></div>
        <${Card} title="Lots" pad=${false}><table className="tbl"><thead><tr><th>Lot</th><th>Péremption</th><th className="r">Qté</th><th></th></tr></thead><tbody>${sel.lots.map((l) => html`<tr key=${l.lot}><td className="mono">${l.lot}</td><td className="mono">${l.exp}</td><td className="r mono">${l.qty}</td><td>${l.recalled ? html`<${Badge} tone="warn">Quarantaine</${Badge}>` : html`<${Badge} tone="ok">Vendable</${Badge}>`}</td></tr>`)}</tbody></table></${Card}>
      </${APO.Drawer}>`}
    </div>`;
  };

  /* ---------------- INVENTAIRE ---------------- */
  APO.screens["officine:inventory"] = function Inventory() {
    const s = APO.use(); const st = s.officine; const inv = st.inv;
    const items = D.inventory.items.map((pid) => { const p = prod(pid); const sys = qtyOf(st, pid); const raw = inv.counts[pid]; const cnt = raw === undefined || raw === "" ? null : +raw; return { p, sys, cnt, diff: cnt === null ? null : cnt - sys }; });
    const done = items.filter((i) => i.cnt !== null).length; const all = done === items.length;
    const show = inv.reveal || !!inv.posted;
    const diffs = items.filter((i) => i.diff);
    const valDiff = r2(diffs.reduce((a, i) => a + i.diff * i.p.pph, 0));
    const stockVal = D.products.reduce((a, p) => a + Math.max(qtyOf(st, p.id), 0) * p.pph, 0);
    const shelfVal = items.reduce((a, i) => a + Math.max(i.sys, 0) * i.p.pph, 0);
    const setCount = (pid, v) => APO.setV((c) => ({ inv: { ...c.inv, counts: { ...c.inv.counts, [pid]: v } } }));
    const post = () => {
      APO.setV((c) => { const stock = { ...c.stock }; diffs.forEach((i) => { const lots = stock[i.p.id].filter((l) => !l.recalled).sort((a, b) => a.exp.localeCompare(b.exp)); const target = (lots.find((l) => l.qty > 0) || lots[0]).lot; stock[i.p.id] = stock[i.p.id].map((l) => (l.lot === target ? { ...l, qty: Math.max(0, l.qty + i.diff) } : l)); }); return { stock, inv: { ...c.inv, posted: { n: "INV-2026-0019", t: APO.now(), lines: diffs.length, val: valDiff } } }; });
      diffs.forEach((i) => APO.log(`Ajustement d'inventaire : ${i.p.name} ${i.diff > 0 ? "+" : ""}${i.diff} (${APO.n2(i.diff * i.p.pph)} DH PPH)`, i.diff < 0 ? "warn" : "info"));
      APO.log(`Inventaire INV-2026-0019 validé · ${D.inventory.shelf} · ${diffs.length} écart(s) · ${APO.n2(valDiff)} DH`, "ok");
      APO.toast("Écarts validés", `${diffs.length} ajustement(s) passés au stock · écart valorisé ${APO.dh(valDiff)} (PPH).`, "box");
    };
    return html`<div>
      <${APO.PageH} title="Inventaire tournant" sub=${D.inventory.shelf + " · comptage à l'aveugle : le stock théorique reste masqué jusqu'à la fin du comptage."}>
        <button className="btn ghost" disabled=${!!inv.posted} onClick=${() => APO.setV((c) => ({ inv: { ...c.inv, counts: Object.fromEntries(Object.entries(D.inventory.sample).map(([k, v]) => [k, String(v)])) } }))}>Remplir l'exemple</button>
        <button id="inv-reveal" className="btn" disabled=${!all || show} onClick=${() => APO.setV((c) => ({ inv: { ...c.inv, reveal: true } }))}><${Icon} n="eye" s=${15} />Calculer les écarts</button>
        <button id="inv-post" className="btn pri" disabled=${!show || !!inv.posted} onClick=${post}><${Icon} n="check" s=${15} />${inv.posted ? "Écarts validés" : "Valider les écarts"}</button></${APO.PageH}>
      ${inv.posted && html`<div className="adv good" style=${{ marginBottom: 16 }}><div className="ic"><${Icon} n="check" s=${16} /></div><span className="src">Inventaire ${inv.posted.n} · ${inv.posted.t}</span><b>${inv.posted.lines} ajustement(s) passé(s) au stock · écart valorisé ${APO.dh(inv.posted.val)} (PPH)</b><p>Chaque ajustement est un mouvement de stock journalisé, signé par ${D.org.officine.pharmacist}. Prochain rayon : A4 · ORL et toux.</p></div>`}
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <div className="card kpi"><span>Progression du comptage</span><b>${done} / ${items.length}</b><div className="bar" style=${{ marginTop: 6 }}><i style=${{ width: (done / items.length) * 100 + "%" }}></i></div></div>
        <${APO.Kpi} label="Valeur du stock (PPH)" value=${APO.dh(stockVal)} delta="toute l'officine" />
        <${APO.Kpi} label="Valeur du rayon (PPH)" value=${APO.dh(shelfVal)} delta=${items.length + " références"} />
        <${APO.Kpi} label="Écart valorisé" value=${show ? APO.dh(valDiff) : "—"} delta=${show ? diffs.length + " ligne(s) en écart" : "masqué pendant le comptage"} tone=${show && valDiff < 0 ? "down" : ""} />
      </div>
      <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Lots</th><th className="r">Théorique</th><th style=${{ width: 130 }}>Compté</th><th className="r">Écart</th><th className="r">Valeur écart (PPH)</th></tr></thead>
        <tbody>${items.map((i) => html`<tr key=${i.p.id}><td><b>${i.p.name}</b><div className="faint small">${i.p.form}</div></td><td className="mono small">${st.stock[i.p.id].filter((l) => !l.recalled).map((l) => l.lot).join(", ")}</td>
          <td className="r mono">${show ? i.sys : html`<span className="faint">•••</span>`}</td>
          <td><input className="input mono" type="number" min="0" style=${{ padding: "5px 8px" }} disabled=${!!inv.posted} placeholder="—" value=${inv.counts[i.p.id] || ""} onInput=${(e) => setCount(i.p.id, e.target.value)} /></td>
          <td className="r mono">${!show || i.diff === null ? "" : i.diff === 0 ? html`<span className="faint">0</span>` : html`<span style=${{ color: i.diff < 0 ? "var(--bad)" : "var(--ok)" }}>${i.diff > 0 ? "+" : ""}${i.diff}</span>`}</td>
          <td className="r mono">${show && i.diff ? APO.n2(i.diff * i.p.pph) : ""}</td></tr>`)}</tbody></table></div></${Card}>
      <p className="small faint" style=${{ marginTop: 10 }}>Le comptage peut se faire sur téléphone. Les ventes pendant le comptage sont prises en compte au moment de la validation.</p>
    </div>`;
  };

  /* ---------------- SMART-BUY ---------------- */
  APO.screens["officine:smartbuy"] = function SmartBuy() {
    const s = APO.use(); const st = s.officine; const whs = whsOn(s);
    const pickOf = (x) => { const p = st.picks[x.pid]; if (whs.some((w) => w.id === p) && x.offers[p] && x.offers[p].avail) return p; const alt = whs.find((w) => x.offers[w.id] && x.offers[w.id].avail); return alt ? alt.id : p; };
    const unit = (o, qty) => { if (!o || !o.avail) return Infinity; const m = /(\d+)\+(\d+)/.exec(o.ug); return m ? (o.price * qty) / (qty + Math.floor(qty / +m[1]) * +m[2]) : o.price; };
    const by = {}; D.suggestions.forEach((x) => { const w = pickOf(x); by[w] = (by[w] || 0) + x.qty * x.offers[w].price; });
    const quote = () => { if (s.offline) { APO.toast("Hors ligne", "Le devis partira au retour du réseau (file du connecteur)."); return; } APO.setV({ quote: "loading" }); setTimeout(() => APO.setV({ quote: "ok" }), 1100); APO.log("Demande de devis envoyée à " + Object.keys(by).map((w) => wh(w).name).join(", "), "info"); };
    const order = () => { const groups = Object.keys(by); APO.setV((c) => ({ quote: null, orders: [...groups.map((w, i) => ({ id: "CMD-2611-00" + (50 + i + c.orders.length), wh: w, lines: D.suggestions.filter((x) => pickOf(x) === w).length, total: by[w], status: 0, placed: APO.now(), eta: wh(w).round })), ...c.orders] })); groups.forEach((w) => APO.log(`Commande envoyée à ${wh(w).name} (${wh(w).mode})`, "ok")); APO.toast(`${groups.length} commande(s) envoyée(s)`, "Suivi dans Achats · réception préremplie à l'arrivée du BL électronique."); APO.go("purchasing"); };
    const isNewW = (w) => APO.isNew(s, w.plugin);
    return html`<div>
      <${APO.PageH} title="Smart-buy" sub="Quantités calculées sur vos ventes (révision périodique, niveau de service par classe ABC). Comparaison neutre : chaque grossiste ne voit que sa propre commande.">
        <button className="btn" onClick=${() => APO.go("agent")}><${Icon} n="bot" s=${15} />Expliquer</button><button className="btn" onClick=${quote}><${Icon} n="refresh" s=${15} />${st.quote === "loading" ? "Devis en cours…" : "Demander les devis"}</button><button className="btn pri" onClick=${order}><${Icon} n="send" s=${15} />Commander</button></${APO.PageH}>
      <div className=${"grid " + (whs.length > 3 ? "g4" : "g3")} style=${{ marginBottom: 16 }}>${whs.map((w) => html`<div key=${w.id} className="card kpi" style=${isNewW(w) ? { boxShadow: "0 0 0 2px var(--accent-line)" } : null}><span className="row">${w.name}${isNewW(w) ? html`<${Badge} tone="acc">Nouveau</${Badge}>` : html`<${Badge} tone=${w.mode.startsWith("Whole") ? "ok" : "warn"}>${w.mode}</${Badge}>`}</span><b>${APO.dh(by[w.id] || 0)}</b><em className="muted">${w.round} · crédit ${w.credit}</em></div>`)}</div>
      <${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Raison</th><th className="r">Qté</th>${whs.map((w) => html`<th key=${w.id} style=${isNewW(w) ? { color: "var(--accent)" } : null}>${w.name}${isNewW(w) ? " · nouveau" : ""}</th>`)}</tr></thead>
        <tbody>${D.suggestions.map((x) => { const p = prod(x.pid); const best = whs.reduce((b, w) => (unit(x.offers[w.id], x.qty) < unit(x.offers[b.id], x.qty) ? w : b), whs[0]); const pk = pickOf(x); return html`<tr key=${x.pid}><td><b>${p.name}</b><div className="faint small">stock ${qtyOf(st, x.pid)}</div></td><td className="small">${x.reason}</td><td className="r mono">${x.qty}</td>
          ${whs.map((w) => { const o = x.offers[w.id] || { avail: false, ug: "—", eta: "—" }; const on = pk === w.id; return html`<td key=${w.id}><button className="btn sm" disabled=${!o.avail} style=${{ borderColor: on ? "var(--accent)" : "", background: on ? "var(--accent-soft)" : "", width: "100%", justifyContent: "space-between" }} onClick=${() => APO.setV((c) => ({ picks: { ...c.picks, [x.pid]: w.id } }))}>
            <span className="mono">${o.avail ? APO.n2(o.price) : "indispo."}</span>${o.ug !== "—" && o.avail ? html`<${Badge} tone="ok">UG ${o.ug}</${Badge}>` : html`<span className="faint small">${o.eta}</span>`}</button>
            ${o.avail && best.id === w.id && html`<div className="small" style=${{ color: "var(--accent)", marginTop: 3 }}>Meilleur coût net</div>`}
            ${st.quote === "ok" && on && html`<div className="small" style=${{ color: "var(--ok)", marginTop: 3 }}>Devis : servi ${x.qty}/${x.qty}</div>`}</td>`; })}</tr>`; })}</tbody></table></div></${Card}>
      <p className="small faint" style=${{ marginTop: 10 }}>Chaque grossiste connecté renvoie son prix net pour votre pharmacie, sa disponibilité et sa prochaine tournée. Un nouveau grossiste apparaît ici dès que son plugin est installé. Le grossiste sans API reçoit un bon de commande PDF par e-mail.</p>
    </div>`;
  };

  /* ---------------- PURCHASING ---------------- */
  const DEC = { accept: "Accepter", refuse: "Refuser → retour", claim: "Réclamation" };
  const RST = ["Brouillon", "Envoyé", "Accepté", "Avoir reçu"];
  APO.screens["officine:purchasing"] = function Purchasing() {
    const s = APO.use(); const st = s.officine; const r = st.reception;
    const [tab, setTab] = useState(st.purchTab || (r.done ? "orders" : "reception"));
    useEffect(() => { if (st.purchTab) { setTab(st.purchTab); APO.setV({ purchTab: null }); } }, [st.purchTab]);
    const dec = r.decisions; const cnt = (k) => r.exceptions.filter((e, i) => dec[i] === k).length;
    const summary = [cnt("accept") && cnt("accept") + " accepté(s)", cnt("refuse") && cnt("refuse") + " retour(s)", cnt("claim") && cnt("claim") + " réclamation(s)"].filter(Boolean).join(" · ");
    const setDec = (i, v) => APO.setV((c) => ({ reception: { ...c.reception, decisions: { ...c.reception.decisions, [i]: v } } }));
    const confirm = () => {
      const refused = r.exceptions.filter((e, i) => dec[i] === "refuse"); const claims = r.exceptions.filter((e, i) => dec[i] === "claim");
      APO.setV((c) => ({ reception: { ...c.reception, done: true }, orders: c.orders.map((o) => (o.id === r.order ? { ...o, status: 4 } : o)), returns: [...refused.map((e, k) => ({ id: "RG-2026-00" + (46 + k + c.returns.length - 5), wh: r.wh, pid: e.pid, lot: e.lot || "—", qty: e.qty || 1, reason: "Refusé à la réception · " + e.detail, kind: "Refus réception", st: 0 })), ...c.returns] }));
      APO.toast("Réception confirmée", `${r.ok} lignes conformes · ${summary}. Stock mis à jour. Le grossiste reçoit automatiquement le résultat de votre contrôle.`, "check");
      APO.log(`Réception ${r.bl} confirmée · ${summary}${claims.length ? " · réclamation REC-0207 ouverte" : ""}`, "ok");
    };
    const advRet = (id) => { APO.setV((c) => ({ returns: c.returns.map((x) => (x.id === id ? { ...x, st: Math.min(x.st + 1, 3), avoir: x.st + 1 === 3 ? "AVG-" + (x.wh === "w1" ? "DM" : "AT") + "-" + (900 + parseInt(x.id.slice(-2), 10)) : x.avoir } : x)) })); const x = st.returns.find((y) => y.id === id); APO.log(`Retour ${id} → ${RST[Math.min(x.st + 1, 3)]} (${wh(x.wh).name})`, "info"); };
    const retVal = (x) => x.qty * prod(x.pid).pph;
    const open = st.returns.filter((x) => x.st < 3);
    return html`<div>
      <${APO.PageH} title="Achats" sub="Commandes envoyées par les plugins grossistes, suivi en temps réel, réception préremplie depuis le BL électronique, retours et avoirs." />
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "reception", label: "Réception en attente", count: r.done ? 0 : 1 }, { id: "orders", label: "Commandes", count: st.orders.length }, { id: "returns", label: "Retours grossiste", count: open.length }, { id: "specials", label: "Commandes clients", count: st.specials.length }]} />
      ${tab === "reception" && (r.done ? html`<div className="card card-b empty">Aucune réception en attente.</div>` : html`<div className="split rev">
        <${Card} title=${r.bl + " · " + wh(r.wh).name} sub=${r.lines + " lignes"} right=${html`<${Badge} tone="warn">${r.exceptions.length} écarts</${Badge}>`} pad=${false}>
          <div className="card-b" style=${{ borderBottom: "1px solid var(--line)" }}><div className="row"><${Icon} n="check" s=${16} /><b>${r.ok} lignes conformes</b><span className="muted small">masquées : quantité, lot, péremption et prix identiques à la commande</span></div></div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Produit</th><th>Écart</th><th>Décision</th></tr></thead><tbody>${r.exceptions.map((e, i) => html`<tr key=${i}><td><b>${prod(e.pid).name}</b><div className="small muted">${e.detail}</div></td><td><${Badge} tone=${e.tone}>${e.kind}</${Badge}></td>
            <td><div className="pill-toggle">${Object.keys(DEC).map((kk) => html`<button key=${kk} className=${dec[i] === kk ? "on" : ""} disabled=${kk === "refuse" && e.noRefuse} style=${kk === "refuse" && e.noRefuse ? { opacity: 0.4, cursor: "not-allowed" } : null} onClick=${() => setDec(i, kk)}>${DEC[kk]}</button>`)}</div></td></tr>`)}</tbody></table></div>
          <div className="card-b row"><button id="rec-confirm" className="btn pri" onClick=${confirm}><${Icon} n="check" s=${15} />Confirmer · ${summary}</button><span className="small faint">Vendre avant confirmation reste possible.</span></div></${Card}>
        <div className="col"><div className="adv info"><div className="ic"><${Icon} n="shield" s=${16} /></div><span className="src">Votre stock, votre décision</span><b>Le grossiste ne modifie jamais votre stock seul</b><p>Le BL arrive en réception en attente. Seule votre confirmation met à jour le stock et le solde fournisseur. Le grossiste reçoit automatiquement le résultat de votre contrôle.</p></div>
          <div className="adv acc"><div className="ic"><${Icon} n="truck" s=${16} /></div><span className="src">Décisions par ligne</span><b>Refuser → retour crée un bon de retour</b><p>La ligne manquante part en réclamation (reliquat). La Ventoline à péremption courte est refusée et rejoint les retours grossiste.</p></div>
          <div className="adv warn"><div className="ic"><${Icon} n="bot" s=${16} /></div><span className="src">Assistant · texte tiers lu</span><b>Écarts préparés par l'assistant</b><p>Le contenu du BL vient d'un tiers : aucune validation automatique possible.</p></div></div></div>`)}
      ${tab === "orders" && html`<${Card} pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Commande</th><th>Grossiste</th><th className="r">Lignes</th><th className="r">Montant</th><th style=${{ minWidth: 320 }}>Suivi</th><th>Livraison</th></tr></thead>
        <tbody>${st.orders.map((o) => html`<tr key=${o.id}><td className="mono">${o.id}<div className="faint small">${o.placed}</div></td><td>${wh(o.wh).name}<div className="faint small">${wh(o.wh).mode}</div></td><td className="r mono">${o.lines}</td><td className="r mono">${APO.n2(o.total)}</td><td><${Steps} at=${o.status} /></td><td className="small">${o.eta}</td></tr>`)}</tbody></table></div></${Card}>`}
      ${tab === "returns" && html`<div>
        <div className="grid g4" style=${{ marginBottom: 16 }}>
          <${APO.Kpi} label="À récupérer (PPH)" value=${APO.dh(open.reduce((a, x) => a + retVal(x), 0))} delta=${open.length + " retour(s) ouverts"} />
          <${APO.Kpi} label="Avoirs reçus" value=${APO.dh(st.returns.filter((x) => x.st === 3).reduce((a, x) => a + retVal(x), 0))} delta=${st.returns.filter((x) => x.st === 3).length + " avoir(s) grossiste"} tone="up" />
          <${APO.Kpi} label="Fenêtre Dawa Maghreb" value="30/11" delta="péremptions < 3 mois" />
          <${APO.Kpi} label="Fenêtre Grossiste Atlas" value="15/12" delta="péremptions < 3 mois" />
        </div>
        <${Card} title="Retours grossiste" sub="préparés par le radar péremptions, les rappels et la réception" pad=${false}><div className="tbl-wrap"><table className="tbl"><thead><tr><th>N°</th><th>Grossiste</th><th>Produit · lot</th><th className="r">Qté</th><th>Motif</th><th className="r">Valeur PPH</th><th>Avoir</th><th></th></tr></thead>
          <tbody>${st.returns.map((x) => html`<tr key=${x.id}><td className="mono">${x.id}</td><td>${wh(x.wh).name}</td><td><b>${prod(x.pid).name}</b><div className="faint small mono">${x.lot}</div></td><td className="r mono">${x.qty}</td><td><${Badge} tone=${x.kind === "Rappel" ? "bad" : x.kind === "Casse" ? "info" : "warn"}>${x.kind}</${Badge}><div className="faint small">${x.reason}</div></td><td className="r mono">${APO.n2(retVal(x))}</td>
            <td>${x.st === 3 ? html`<${Badge} tone="ok" mono>${x.avoir || "Reçu"}</${Badge}>` : html`<${Badge} tone=${x.st === 0 ? "" : "info"}>${RST[x.st]}</${Badge}>`}</td><td className="r">${x.st < 3 && html`<button className="btn sm" onClick=${() => advRet(x.id)}>${x.st === 0 ? "Envoyer" : "→ " + RST[x.st + 1]}</button>`}</td></tr>`)}</tbody></table></div></${Card}></div>`}
      ${tab === "specials" && html`<${Card} pad=${false}><table className="tbl"><thead><tr><th>N°</th><th>Produit</th><th>Client</th><th className="r">Acompte</th><th>Statut</th></tr></thead><tbody>${st.specials.map((x) => html`<tr key=${x.id}><td className="mono">${x.id}</td><td>${prod(x.pid).name}</td><td>${x.cust}</td><td className="r mono">${APO.n2(x.deposit)}</td><td><${Badge} tone="info">${x.status}</${Badge}></td></tr>`)}</tbody></table></${Card}>`}
    </div>`;
  };

  /* ---------------- CLAIMS ---------------- */
  APO.screens["officine:claims"] = function Claims() {
    const s = APO.use(); const st = s.officine; const open = st.rejections.filter((r) => !r.fixed);
    return html`<div>
      <${APO.PageH} title="Tiers payant" sub="CNSS (dont l'ex-CNOPS à partir du 1ᵉʳ février 2027), AMO et mutuelles. FSE des patients remboursés, bordereaux du tiers payant (ALD, conventions), rejets et relances.">
        <button className="btn pri" onClick=${() => APO.go("agent")}><${Icon} n="bot" s=${15} />Relancer les rejets avec l'assistant</button></${APO.PageH}>
      <div className="grid g4" style=${{ marginBottom: 16 }}>
        <${APO.Kpi} label="À recevoir (tiers payant)" value=${APO.dh(9619.4)} delta="3 bordereaux en cours" />
        <${APO.Kpi} label="Rejets ouverts" value=${open.length} delta=${APO.dh(open.reduce((a, r) => a + r.amount, 0))} tone="down" />
        <${APO.Kpi} label="Délai moyen CNSS" value="17 j" delta="-3 j depuis la FSE" tone="up" />
        <${APO.Kpi} label="FSE aujourd'hui" value=${dayTotals(st).fseN} delta="QR e-ordonnance 74 %" />
      </div>
      <div className="grid g2">
        <${Card} title="Bordereaux" pad=${false}><table className="tbl"><thead><tr><th>Bordereau</th><th>Organisme</th><th className="r">Dossiers</th><th className="r">Montant</th><th>Statut</th></tr></thead><tbody>${st.claims.map((c) => html`<tr key=${c.id}><td className="mono">${c.id}</td><td>${c.org}</td><td className="r mono">${c.files}</td><td className="r mono">${APO.n2(c.amount)}</td><td><${Badge} tone=${c.tone}>${c.status}</${Badge}></td></tr>`)}</tbody></table></${Card}>
        <${Card} title="Rejets CNSS" sub="motifs normalisés" pad=${false}><table className="tbl"><tbody>${st.rejections.map((r) => html`<tr key=${r.id}><td className="mono">${r.id}<div className="faint small">${r.patient}</div></td><td className="small">${r.reason}</td><td className="r mono">${APO.n2(r.amount)}</td><td>${r.fixed ? html`<${Badge} tone="ok">Renvoyé</${Badge}>` : html`<${Badge} tone="bad">Rejeté</${Badge}>`}</td></tr>`)}</tbody></table></${Card}>
      </div></div>`;
  };

  /* ---------------- CUSTOMERS ---------------- */
  APO.screens["officine:customers"] = function Customers() {
    const s = APO.use(); const st = s.officine; const [open, setOpen] = useState(null); const c = open && D.customers.find((x) => x.id === open);
    return html`<div>
      <${APO.PageH} title="Clients & carnet" sub="Données personnelles hébergées et traitées au Maroc. Comptes famille, plafonds, paiements partiels." />
      <div className="grid g4" style=${{ marginBottom: 16 }}><${APO.Kpi} label="Encours carnet" value=${APO.dh(Object.values(st.carnet).reduce((a, b) => a + b, 0))} delta="38 comptes actifs" /><${APO.Kpi} label="Patients chroniques" value="214" delta="renouvellements cette semaine : 26" /><${APO.Kpi} label="Patients en ALD" value="37" delta="tiers payant au comptoir" /><${APO.Kpi} label="Consentements CNDP" value="100 %" delta="pack Maroc · données personnelles" tone="up" /></div>
      <${Card} pad=${false}><table className="tbl"><thead><tr><th>Client</th><th>Couverture</th><th>Règlement</th><th>Famille</th><th>Suivi</th><th className="r">Carnet</th></tr></thead><tbody>${D.customers.map((x) => html`<tr key=${x.id} className="click" onClick=${() => setOpen(x.id)}><td><div className="row"><div className="avatar">${x.initials}</div><b>${x.name}</b></div></td><td>${x.cover}${x.ald ? html` <${Badge} tone="info">${x.aldLabel}</${Badge}>` : null}</td><td>${isDirect(x) ? html`<${Badge} tone="ok">Tiers payant</${Badge}>` : hasCover(x) ? html`<${Badge}>Paie tout · FSE</${Badge}>` : "—"}</td><td className="small">${x.family}</td><td className="small">${x.chronic}</td><td className="r mono">${st.carnet[x.id] ? html`<span style=${{ color: "var(--warn)" }}>${APO.n2(st.carnet[x.id])}</span>` : "—"}</td></tr>`)}</tbody></table></${Card}>
      ${c && html`<${APO.Drawer} title=${c.name} onClose=${() => setOpen(null)} footer=${html`<button className="btn" onClick=${() => APO.toast("Export envoyé", "Demande d'accès CNDP · export de toutes les données du client.")}>Exporter (droit d'accès)</button><button className="btn pri" disabled=${!st.carnet[c.id]} onClick=${() => { APO.setV((x) => ({ carnet: { ...x.carnet, [c.id]: Math.max(0, x.carnet[c.id] - 200) } })); APO.toast("200,00 DH encaissés", "Carnet mis à jour."); }}>Encaisser 200 DH</button>`}>
        <div className="row" style=${{ marginBottom: 12 }}><${Badge}>${c.cover}</${Badge}><${Badge} mono>${c.immat}</${Badge}>${c.ald && html`<${Badge} tone="info">${c.aldLabel}</${Badge}>`}<${Badge} mono>🇲🇦 MA</${Badge}></div>
        <div className="grid g2" style=${{ marginBottom: 12 }}><${APO.Kpi} label="Carnet" value=${APO.dh(st.carnet[c.id])} delta=${"plafond " + APO.dh(c.ceiling)} /><${APO.Kpi} label="Suivi" value=${c.chronic === "—" ? "—" : "Chronique"} delta=${c.chronic} /></div>
        <${Card} title="Historique carnet" pad=${false}><table className="tbl"><tbody><tr><td className="mono">05/11</td><td>Vente ORD-2026-004701</td><td className="r mono">+ 186,40</td></tr><tr><td className="mono">28/10</td><td>Paiement espèces</td><td className="r mono">− 300,00</td></tr><tr><td className="mono">21/10</td><td>Vente · famille</td><td className="r mono">+ 263,60</td></tr></tbody></table></${Card}>
        <p className="small faint" style=${{ marginTop: 12 }}>Ce profil n'est jamais envoyé à l'assistant ni hors du Maroc. À l'expiration de la rétention, la clé est détruite (crypto-effacement).</p></${APO.Drawer}>`}
    </div>`;
  };

  /* ---------------- MIGRATION & COEXISTENCE ---------------- */
  function Migration({ src }) {
    const s = APO.use(); const st = s.officine; const J = D.imports[src]; const job = st.imports[src]; const [, tick] = useState(0);
    const el = job.at ? (Date.now() - job.at) / 1000 : 0;
    const pct = J.rows.map((_, i) => Math.max(0, Math.min(1, (el - i * 0.9) / 1.6)));
    const done = !!job.at && pct.every((p) => p >= 1);
    useEffect(() => { if (!job.at || done) return; const id = setInterval(() => tick((x) => x + 1), 200); return () => clearInterval(id); }, [job.at, done]);
    const setJob = (patch) => APO.setV((c) => ({ imports: { ...c.imports, [src]: { ...c.imports[src], ...patch } } }));
    const start = () => { setJob({ at: Date.now() }); APO.log(`Import ${J.name} lancé · ${J.file}`, "info"); };
    const shadow = () => { setJob({ shadow: true }); APO.log(`Mode ombre activé : smart-buy alimenté chaque nuit par ${J.name}`, "ok"); APO.toast("Mode ombre activé", `${J.name} reste votre caisse. Smart-buy lit ses ventes chaque nuit.`, "refresh"); };
    const stage = job.shadow ? 1 : done ? 1 : 0;
    return html`<div>
      <${APO.PageH} title=${"Import & coexistence · " + J.name} sub=${`Essayez Apotheka sans quitter ${J.name} : import complet, puis mode ombre en parallèle de votre logiciel actuel. Vous basculez quand vous êtes prêt.`}>
        <button id="import-start" className="btn pri" disabled=${!!job.at} onClick=${start}><${Icon} n="download" s=${15} />${!job.at ? "Lancer l'import" : done ? "Import terminé" : "Import en cours…"}</button></${APO.PageH}>
      <${Card} style=${{ marginBottom: 16 }}><${Steps} at=${job.shadow ? 2 : stage} steps=${["Import", "Mode ombre", "Bascule"]} /></${Card}>
      <div className="grid g2" style=${{ marginBottom: 16 }}>
        <${Card} title="Import des données" sub=${J.file} pad=${false}><table className="tbl"><tbody>${J.rows.map((r, i) => html`<tr key=${r[0]}><td style=${{ width: 110 }}><b>${r[0]}</b></td><td><div className="small">${r[1]}</div><div className="faint small">${r[2]}</div><div className="bar" style=${{ marginTop: 6 }}><i style=${{ width: pct[i] * 100 + "%" }}></i></div></td><td className="r" style=${{ width: 110 }}>${pct[i] >= 1 ? html`<${Badge} tone="ok">Importé</${Badge}>` : pct[i] > 0 ? html`<${Badge} tone="info">${Math.round(pct[i] * 100)} %</${Badge}>` : html`<${Badge}>En attente</${Badge}>`}</td></tr>`)}</tbody></table>
          <div className="card-b small faint">Lecture seule : rien n'est écrit dans ${J.name}. Les données personnelles restent au Maroc.</div></${Card}>
        <div className="col">
          <div className="adv acc"><div className="ic"><${Icon} n="refresh" s=${16} /></div><span className="src">Mode ombre</span><b>Mode ombre : smart-buy alimenté par votre logiciel actuel</b><p>${J.name} reste votre caisse et votre registre fiscal. Chaque nuit, Apotheka lit ses ventes et son stock, prépare les suggestions d'achat et demande les devis aux grossistes.</p>
            <div className="acts" style=${{ gridColumn: 2 }}><button id="shadow-on" className="btn sm pri" disabled=${!done || job.shadow} onClick=${shadow}>${job.shadow ? "Mode ombre actif" : "Activer le mode ombre"}</button><button className="btn sm" disabled=${!job.shadow} onClick=${() => APO.go("smartbuy")}>Voir smart-buy</button></div></div>
          <${Card} title="Rapprochement" sub="contrôlé avant toute bascule" pad=${false}><table className="tbl"><tbody>
            <tr><td>Stock</td><td className="small muted">écart 0,4 % sur ${J.rows[0][1]}</td><td className="r">${done ? html`<${Badge} tone="ok">OK</${Badge}>` : html`<${Badge}>—</${Badge}>`}</td></tr>
            <tr><td>Carnet</td><td className="small muted">${J.rows[2][1]} · 0,00 DH d'écart</td><td className="r">${done ? html`<${Badge} tone="ok">OK</${Badge}>` : html`<${Badge}>—</${Badge}>`}</td></tr>
            <tr><td>Séries fiscales</td><td className="small muted">restent celles de ${J.name} jusqu'à la bascule</td><td className="r"><${Badge} tone="info">Inchangées</${Badge}></td></tr>
            <tr><td>Dernière lecture</td><td className="small muted">${job.shadow ? "cette nuit 02:00 · 412 ventes lues" : "—"}</td><td className="r">${job.shadow ? html`<${Badge} tone="ok">À jour</${Badge}>` : html`<${Badge}>—</${Badge}>`}</td></tr></tbody></table></${Card}>
        </div></div>
      <${Card} title="Bascule" sub="quand vous êtes prêt"><div className="row"><p className="muted small" style=${{ flex: 1, minWidth: 240 }}>Le Z de ${J.name} clôture la journée, Apotheka ouvre sa propre série fiscale le lendemain matin. Retour arrière possible pendant 30 jours.</p><button className="btn" disabled=${!job.shadow} onClick=${() => APO.toast("Bascule planifiée", `Lundi 16/11 à l'ouverture · un technicien Apotheka est présent.`, "clock")}><${Icon} n="clock" s=${15} />Planifier la bascule</button></div></${Card}>
    </div>`;
  }
  APO.screens["officine:migration"] = () => html`<${Migration} src="winpharm" />`;
  APO.screens["officine:migration-sobrus"] = () => html`<${Migration} src="sobrus" />`;

  /* ---------------- GUIDED TOUR ---------------- */
  const setBasket = (ids, extra) => APO.set((s) => ({ officine: { ...s.officine, basket: ids.map((pid) => ({ pid, qty: 1, lot: (s.officine.stock[pid].find((l) => !l.recalled && l.qty > 0) || s.officine.stock[pid].find((l) => !l.recalled)).lot })), rx: {}, fse: false, receipt: null, rxFor: null, ticketSubs: [], ...(extra || {}) } }));
  APO.tour.officine = [
    { kicker: "L'idée", title: "Un logiciel d'officine fait de plugins", go: "home", text: "Le menu à gauche, les tuiles de l'accueil, les cartes du comptoir et la palette ⌘K sont générés par les plugins installés. Le noyau ne contient aucune logique de pharmacie.", run: () => { APO.installPlugin("interactions", false); APO.installPlugin("wh.sud", false); APO.set({ offline: false, fresh: null }); } },
    { kicker: "Comptoir", title: "Le pack Maroc protège chaque vente", go: "counter", text: "Rivotril (tableau B) est bloqué tant que l'ordonnance sur carnet à souches n'est pas saisie : seul le code certifié peut bloquer. Le lot de Smecta rappelé est écarté automatiquement. Patiente CNSS : elle paie tout, la FSE estime son remboursement.", try: "« Saisir l'ordonnance », puis encaisser et regarder le ticket.", run: () => setBasket(["p10", "p7", "p1", "p2"], { customer: "c1" }) },
    { kicker: "Extension en direct", title: "Installer un plugin partenaire", go: "market", text: "« Interactions médicamenteuses » est un pack de données d'un partenaire. Il s'exécute dans le bac à sable marocain, sans aucune donnée patient ni sortie réseau. Le consentement est généré depuis son manifeste.", try: "Ouvrir la carte « Interactions » et cliquer « Autoriser et installer ».", action: { label: "Installer pour moi", run: () => { APO.installPlugin("interactions"); APO.toast("Interactions médicamenteuses installé", "Ajouté : carte conseil au comptoir", "puzzle"); APO.log("Plugin installé : interactions (MedRef Maroc)", "ok"); } } },
    { kicker: "Extension en direct", title: "La nouvelle carte apparaît au comptoir", go: "counter", text: "Sintrom + Aspégic : le plugin ajoute une carte conseil marquée « Nouveau ». Un partenaire ne peut jamais bloquer une vente : il conseille, le pharmacien décide.", run: () => { APO.installPlugin("interactions"); setBasket(["p9", "p8"], { customer: null, rx: { p9: { n: "ORD-5520", prescriber: "Dr. M. Fassi · INPE 20914" } } }); } },
    { kicker: "Hors ligne", title: "Internet coupé, la caisse continue", go: "counter", text: "Chaque terminal attribue ses numéros fiscaux définitifs dans sa propre série. Au retour du réseau, l'autorité accepte les faits et signale les exceptions sans rejeter aucune vente.", try: "Encaisser une vente, puis cliquer « Hors ligne » en haut pour revenir en ligne.", run: () => { if (!APO.get().offline) APO.toggleOffline(); setBasket(["p13", "p14"]); } },
    { kicker: "Achats", title: "Un nouveau grossiste rejoint smart-buy", go: "smartbuy", text: "Répartiteur Sud vient de publier son API : son plugin est installé et une colonne apparaît aussitôt. Smart-buy compare prix, UG et délai ; chaque grossiste ne voit que sa propre commande.", run: () => { if (APO.get().offline) APO.toggleOffline(); if (!APO.installed(APO.get(), "wh.sud")) { APO.installPlugin("wh.sud"); APO.toast("Répartiteur Sud installé", "Nouvelle colonne dans smart-buy · 2 meilleures offres", "truck"); APO.log("Plugin installé : wh.sud (Répartiteur Sud)", "ok"); } } },
    { kicker: "Conformité", title: "Prêt pour l'inspection", go: "registers", text: "Ordonnancier et registre des stupéfiants (ordonnances sur carnet à souches) sont numérotés et chaînés par hachage. Noyau, plugins système et pack Maroc forment un périmètre certifié ; décrets et rappels sont des données signées.", action: { label: "Voir le périmètre certifié", run: () => APO.go("conformity") } },
    { kicker: "Récapitulatif", title: "Ce que vous avez vu", go: "home", get text() { const s = APO.get(); const pinned = D.plugins.officine.filter((p) => p.pinned).length; const live = Object.values((s.newPlugins || {}).officine || {}).filter(Boolean).length; return `1 noyau, ${pinned} plugins épinglés, ${live} plugin${live > 1 ? "s" : ""} installé${live > 1 ? "s" : ""} en direct. Le comptoir, les achats et la conformité se sont adaptés sans redémarrage ; la caisse a continué hors ligne.`; } },
  ];

  /* ---------------- REGISTERS ---------------- */
  APO.screens["officine:registers"] = function Registers() {
    const s = APO.use(); const st = s.officine; const [tab, setTab] = useState("ord");
    return html`<div>
      <${APO.PageH} title="Registres légaux" sub="Ordonnancier et registre des stupéfiants électroniques, numérotés, chaînés par hachage, prêts pour l'inspection.">
        <${Badge} tone="ok">Chaîne intègre</${Badge}><button className="btn pri" onClick=${() => APO.toast("Dossier d'inspection généré", "PDF signé + empreinte vérifiable hors ligne. Noms et adresses complets.")}><${Icon} n="download" s=${15} />Export inspection</button></${APO.PageH}>
      <div className="row small muted" style=${{ marginBottom: 12 }}><${Icon} n="eye" s=${15} />Nom et adresse du patient masqués à l'écran, complets dans l'export d'inspection.</div>
      <${APO.Tabs} value=${tab} onChange=${setTab} tabs=${[{ id: "ord", label: "Ordonnancier", count: st.ordonnancier.length }, { id: "stup", label: "Stupéfiants · carnet à souches", count: st.stup.length }]} />
      ${tab === "ord" ? html`<${Card} pad=${false}><table className="tbl"><thead><tr><th>N°</th><th>Date</th><th>Produit</th><th className="r">Qté</th><th>Prescripteur</th><th>Patient</th></tr></thead><tbody>${st.ordonnancier.map((o) => html`<tr key=${o.n}><td className="mono">${o.n}</td><td className="mono small">${o.date}</td><td>${prod(o.pid).name} ${listBadge(prod(o.pid))}</td><td className="r mono">${o.qty}</td><td className="small">${o.prescriber}</td><td className="small">${o.patient}</td></tr>`)}</tbody></table></${Card}>`
        : html`<${Card} pad=${false}><table className="tbl"><thead><tr><th>Date</th><th>Produit</th><th className="r">Entrée</th><th className="r">Sortie</th><th className="r">Solde</th><th>Référence</th></tr></thead><tbody>${st.stup.map((o, i) => html`<tr key=${i}><td className="mono">${o.date}</td><td>${prod(o.pid).name}</td><td className="r mono">${o.in || ""}</td><td className="r mono">${o.out || ""}</td><td className="r mono"><b>${o.balance}</b></td><td className="small">${o.ref}</td></tr>`)}</tbody></table></${Card}>`}
    </div>`;
  };
})();
