/* PROTOTYPE — seed data and plugin manifests. All figures are examples, not real pharmacy data. */
(function () {
  const D = {};

  /* ---------- Organisations ---------- */
  D.org = {
    officine: { name: "Pharmacie Al Amal", city: "Casablanca · Maârif", site: "OFF1", terminal: "T02", ice: "001523874000062", if: "40218877", rc: "CAS 412 887", pharmacist: "Dr. Salma Bennani", cndp: "D-PH-2026-1187" },
    para: { name: "Paraphar Atlas", city: "3 boutiques · Casablanca, Rabat, Marrakech", site: "MAA", terminal: "C01", ice: "002114560000081", if: "51144730", rc: "CAS 503 221", pharmacist: "Mme Nadia Tazi", cndp: "D-PA-2026-0442" },
  };

  /* ---------- Officine catalogue (example products) ---------- */
  // list: "" none, "I" liste I, "II" liste II, "B" tableau B (stupéfiant); rate = reimbursement rate (AMO/CNSS)
  // base = base de remboursement (tarif de référence): often below PPV for brands, equal to PPV for generics; generic = id of the cheaper generic
  D.products = [
    { id: "p1", name: "Doliprane 1000 mg", form: "16 comprimés", dci: "Paracétamol", cls: "Antalgique", ean: "6118000041234", amm: "AMM 312/16 DMP", ppv: 15.6, pph: 11.2, vat: 0, list: "", base: 15.6, rate: 0.7, lots: [{ lot: "DL2611", exp: "2027-03", qty: 42 }, { lot: "DL2604", exp: "2026-12", qty: 6 }] },
    { id: "p2", name: "Dafalgan 500 mg", form: "16 gélules", dci: "Paracétamol", cls: "Antalgique", ean: "6118000052216", amm: "AMM 118/11 DMP", ppv: 12.9, pph: 9.3, vat: 0, list: "", base: 12.9, generic: "p22", rate: 0.7, lots: [{ lot: "DF7731", exp: "2027-08", qty: 30 }] },
    { id: "p3", name: "Augmentin 1 g", form: "12 sachets", dci: "Amoxicilline + ac. clavulanique", cls: "Antibiotique", ean: "6118000013385", amm: "AMM 210/09 DMP", ppv: 96.5, pph: 71.0, vat: 0, list: "I", base: 62.0, generic: "p17", rate: 0.7, lots: [{ lot: "AG5520", exp: "2027-01", qty: 14 }] },
    { id: "p4", name: "Glucophage 850 mg", form: "30 comprimés", dci: "Metformine", cls: "Antidiabétique", ean: "6118000074407", amm: "AMM 087/05 DMP", ppv: 28.4, pph: 20.4, vat: 0, list: "II", base: 22.0, rate: 0.8, lots: [{ lot: "GL1102", exp: "2027-06", qty: 55 }] },
    { id: "p5", name: "Coversyl 5 mg", form: "30 comprimés", dci: "Périndopril", cls: "Antihypertenseur", ean: "6118000088121", amm: "AMM 144/07 DMP", ppv: 118.0, pph: 86.9, vat: 0, list: "II", base: 84.0, generic: "p18", rate: 0.8, lots: [{ lot: "CV9014", exp: "2027-11", qty: 18 }] },
    { id: "p6", name: "Ventoline 100 µg", form: "aérosol 200 doses", dci: "Salbutamol", cls: "Bronchodilatateur", ean: "6118000025593", amm: "AMM 033/02 DMP", ppv: 34.7, pph: 25.0, vat: 0, list: "II", base: 34.7, rate: 0.7, lots: [{ lot: "VT3381", exp: "2026-12", qty: 9 }] },
    { id: "p7", name: "Smecta 3 g", form: "30 sachets", dci: "Diosmectite", cls: "Antidiarrhéique", ean: "6118000036612", amm: "AMM 061/04 DMP", ppv: 42.3, pph: 30.5, vat: 0, list: "", base: 42.3, rate: 0.7, lots: [{ lot: "SM4410", exp: "2027-02", qty: 7, recalled: true }, { lot: "SM4502", exp: "2027-05", qty: 11 }] },
    { id: "p8", name: "Aspégic 1000", form: "20 sachets", dci: "Acide acétylsalicylique", cls: "Antalgique", ean: "6118000047728", amm: "AMM 102/06 DMP", ppv: 25.8, pph: 18.6, vat: 0, list: "", base: 25.8, rate: 0.7, lots: [{ lot: "AS2290", exp: "2027-04", qty: 26 }] },
    { id: "p9", name: "Sintrom 4 mg", form: "30 comprimés", dci: "Acénocoumarol", cls: "Anticoagulant", ean: "6118000091149", amm: "AMM 054/03 DMP", ppv: 39.9, pph: 28.7, vat: 0, list: "I", base: 39.9, rate: 0.8, lots: [{ lot: "ST0712", exp: "2027-09", qty: 12 }] },
    { id: "p10", name: "Rivotril 2 mg", form: "40 comprimés", dci: "Clonazépam", cls: "Anxiolytique", ean: "6118000062058", amm: "AMM 019/01 DMP", ppv: 27.3, pph: 19.6, vat: 0, list: "B", base: 27.3, rate: 0.7, lots: [{ lot: "RV1150", exp: "2027-07", qty: 20 }] },
    { id: "p11", name: "Levothyrox 75 µg", form: "30 comprimés", dci: "Lévothyroxine", cls: "Hormone thyroïdienne", ean: "6118000019904", amm: "AMM 071/04 DMP", ppv: 21.5, pph: 15.5, vat: 0, list: "II", base: 21.5, rate: 0.8, lots: [{ lot: "LV6620", exp: "2027-10", qty: 33 }] },
    { id: "p12", name: "Lantus SoloStar", form: "5 stylos 100 UI/ml", dci: "Insuline glargine", cls: "Antidiabétique", ean: "6118000099930", amm: "AMM 233/10 DMP", ppv: 612.0, pph: 450.0, vat: 0, list: "II", base: 612.0, rate: 1.0, cold: true, lots: [{ lot: "LN0091", exp: "2027-01", qty: 4 }] },
    { id: "p13", name: "Spasfon 80 mg", form: "30 comprimés", dci: "Phloroglucinol", cls: "Antispasmodique", ean: "6118000055330", amm: "AMM 040/03 DMP", ppv: 23.1, pph: 16.6, vat: 0, list: "", base: 23.1, rate: 0.7, lots: [{ lot: "SP7782", exp: "2027-05", qty: 0 }] },
    { id: "p14", name: "Gaviscon suspension", form: "flacon 250 ml", dci: "Alginate de sodium", cls: "Antiacide", ean: "6118000068814", amm: "AMM 095/06 DMP", ppv: 48.6, pph: 35.0, vat: 0, list: "", base: 48.6, rate: 0.7, lots: [{ lot: "GV3107", exp: "2026-12", qty: 15 }] },
    { id: "p15", name: "Bioderma Sensibio H2O", form: "250 ml", dci: "—", cls: "Parapharmacie", ean: "3401345935571", amm: "", ppv: 149.0, pph: 102.0, vat: 0.2, list: "", base: 0, rate: 0, para: true, lots: [{ lot: "BD8821", exp: "2028-02", qty: 12 }] },
    { id: "p16", name: "Avène Cicalfate+ crème", form: "40 ml", dci: "—", cls: "Parapharmacie", ean: "3282770204681", amm: "", ppv: 129.0, pph: 88.0, vat: 0.2, list: "", base: 0, rate: 0, para: true, lots: [{ lot: "AV1290", exp: "2028-05", qty: 8 }] },
    // generics (base = PPV) and the rest of the antalgic shelf used by the rolling inventory
    { id: "p17", name: "Amoxi-Clav Cooper 1 g", form: "12 sachets", dci: "Amoxicilline + ac. clavulanique", cls: "Antibiotique", ean: "6118000113381", amm: "AMM 402/14 DMP", ppv: 62.0, pph: 45.6, vat: 0, list: "I", base: 62.0, rate: 0.7, isGeneric: true, lots: [{ lot: "AC8812", exp: "2027-09", qty: 22 }] },
    { id: "p18", name: "Périndopril Sothema 5 mg", form: "30 comprimés", dci: "Périndopril", cls: "Antihypertenseur", ean: "6118000188127", amm: "AMM 377/13 DMP", ppv: 84.0, pph: 61.8, vat: 0, list: "II", base: 84.0, rate: 0.8, isGeneric: true, lots: [{ lot: "PS2207", exp: "2028-01", qty: 16 }] },
    { id: "p19", name: "Efferalgan 1 g", form: "8 comprimés effervescents", dci: "Paracétamol", cls: "Antalgique", ean: "6118000041990", amm: "AMM 205/09 DMP", ppv: 14.8, pph: 10.6, vat: 0, list: "", base: 14.8, rate: 0.7, lots: [{ lot: "EF5531", exp: "2027-06", qty: 24 }] },
    { id: "p20", name: "Brufen 400 mg", form: "30 comprimés", dci: "Ibuprofène", cls: "Antalgique", ean: "6118000042447", amm: "AMM 066/04 DMP", ppv: 32.5, pph: 23.4, vat: 0, list: "", base: 21.0, generic: "p21", rate: 0.7, lots: [{ lot: "BR4410", exp: "2027-08", qty: 18 }] },
    { id: "p21", name: "Ibuprofène Cooper 400 mg", form: "30 comprimés", dci: "Ibuprofène", cls: "Antalgique", ean: "6118000142441", amm: "AMM 389/13 DMP", ppv: 21.0, pph: 15.1, vat: 0, list: "", base: 21.0, rate: 0.7, isGeneric: true, lots: [{ lot: "IC0920", exp: "2027-12", qty: 20 }] },
    { id: "p22", name: "Paracétamol Galenica 500 mg", form: "16 comprimés", dci: "Paracétamol", cls: "Antalgique", ean: "6118000152211", amm: "AMM 290/11 DMP", ppv: 9.9, pph: 7.1, vat: 0, list: "", base: 9.9, rate: 0.7, isGeneric: true, lots: [{ lot: "PG3340", exp: "2027-10", qty: 36 }] },
  ];

  D.customers = [
    { id: "c1", name: "Fatima Zahra Bennis", initials: "FB", cover: "CNSS", immat: "CNSS 118 442 907", carnet: 450, ceiling: 1500, family: "Famille Bennis (3)", chronic: "Hypertension", phone: "06 61 •• •• 12" },
    { id: "c2", name: "Ahmed El Alami", initials: "AE", cover: "AMO-CNSS", immat: "CNSS 220 118 554", carnet: 0, ceiling: 1000, family: "—", chronic: "Diabète type 2", ald: true, aldLabel: "ALD · diabète", phone: "06 70 •• •• 48" },
    { id: "c3", name: "Famille Idrissi", initials: "FI", cover: "Mutuelle FAR", immat: "FAR 55 203", tiersPayant: true, carnet: 1240, ceiling: 2000, family: "Famille Idrissi (5)", chronic: "—", phone: "06 62 •• •• 90" },
    { id: "c4", name: "Youssef Karimi", initials: "YK", cover: "Sans couverture", immat: "—", carnet: 0, ceiling: 500, family: "—", chronic: "—", phone: "06 55 •• •• 03" },
  ];

  D.wholesalers = [
    { id: "w1", name: "Dawa Maghreb", mode: "Wholesaler API", plugin: "wh.dawa", round: "Tournée 2 · avant 11:30", credit: "18 400 / 50 000 DH" },
    { id: "w2", name: "Grossiste Atlas", mode: "Wholesaler API", plugin: "wh.atlas", round: "Tournée 1 · avant 14:00", credit: "6 200 / 30 000 DH" },
    { id: "w3", name: "Répartiteur Nord", mode: "Repli PDF/e-mail", plugin: "wh.fallback", round: "Livraison J+1", credit: "—" },
    { id: "w4", name: "Répartiteur Sud", mode: "Wholesaler API", plugin: "wh.sud", round: "Tournée unique · avant 12:00", credit: "0 / 25 000 DH" },
  ];

  // smart-buy suggestions: per product, offers per wholesaler {price, ug, eta, avail}
  D.suggestions = [
    { pid: "p13", reason: "Rupture · 9 vendus/sem", qty: 20, offers: { w1: { price: 16.6, ug: "10+1", eta: "Auj. 15:00", avail: true }, w2: { price: 16.6, ug: "—", eta: "Auj. 18:00", avail: true }, w3: { price: 16.6, ug: "—", eta: "Demain", avail: true }, w4: { price: 16.1, ug: "—", eta: "Auj. 13:30", avail: true } }, pick: "w1" },
    { pid: "p6", reason: "Couverture 4 j < 7 j", qty: 10, offers: { w1: { price: 25.0, ug: "—", eta: "Auj. 15:00", avail: false }, w2: { price: 25.0, ug: "—", eta: "Auj. 18:00", avail: true }, w3: { price: 25.0, ug: "—", eta: "Demain", avail: true }, w4: { price: 24.4, ug: "—", eta: "Auj. 13:30", avail: true } }, pick: "w2" },
    { pid: "p1", reason: "Saison grippale · +40%", qty: 60, offers: { w1: { price: 11.2, ug: "20+3", eta: "Auj. 15:00", avail: true }, w2: { price: 11.2, ug: "20+2", eta: "Auj. 18:00", avail: true }, w3: { price: 11.2, ug: "—", eta: "Demain", avail: true }, w4: { price: 11.2, ug: "20+4", eta: "Auj. 13:30", avail: true } }, pick: "w1" },
    { pid: "p12", reason: "Chronique · 2 patients", qty: 4, offers: { w1: { price: 450.0, ug: "—", eta: "Auj. 15:00", avail: true, cold: true }, w2: { price: 450.0, ug: "—", eta: "Demain", avail: true }, w3: { price: 450.0, ug: "—", eta: "Demain", avail: false }, w4: { price: 450.0, ug: "—", eta: "Demain", avail: false } }, pick: "w1" },
    { pid: "p14", reason: "Couverture 6 j", qty: 12, offers: { w1: { price: 35.0, ug: "—", eta: "Auj. 15:00", avail: true }, w2: { price: 34.2, ug: "12+1", eta: "Auj. 18:00", avail: true }, w3: { price: 35.0, ug: "—", eta: "Demain", avail: true }, w4: { price: 34.9, ug: "—", eta: "Auj. 13:30", avail: true } }, pick: "w2" },
  ];

  D.orders = [
    { id: "CMD-2611-0042", wh: "w1", lines: 14, total: 3820, status: 3, placed: "08:12", eta: "Tournée 2 · 15:00" },
    { id: "CMD-2611-0041", wh: "w2", lines: 6, total: 1210, status: 4, placed: "Hier 17:40", eta: "Livré 09:05" },
  ];

  // pending reception from Dawa BL — exceptions only
  D.reception = {
    bl: "BL DM-778120", wh: "w1", order: "CMD-2611-0041", lines: 22, ok: 18,
    exceptions: [
      { pid: "p3", kind: "Ligne manquante", detail: "Commandé 6 · livré 0 (reliquat)", tone: "bad", qty: 6, def: "claim", noRefuse: true },
      { pid: "p1", kind: "UG différente", detail: "Attendu 20+3 · reçu 20+2", tone: "warn", qty: 1, def: "claim" },
      { pid: "p6", kind: "Péremption courte", detail: "Lot VT3401 · exp. 2026-12 (< 2 mois)", tone: "warn", qty: 10, lot: "VT3401", def: "refuse" },
      { pid: "p5", kind: "PPV différent", detail: "BL 121,00 · fichier 118,00 (décret 2026-08)", tone: "info", qty: 4, def: "accept" },
    ],
  };

  D.claims = [
    { id: "BRD-CNSS-1108", org: "CNSS", files: 42, amount: 6840.5, status: "Payé", tone: "ok", date: "08/11" },
    { id: "BRD-CNSS-1101", org: "CNSS", files: 38, amount: 5912.0, status: "4 rejets", tone: "bad", date: "01/11" },
    { id: "BRD-FAR-1030", org: "Mutuelle FAR", files: 9, amount: 1420.0, status: "Envoyé", tone: "info", date: "30/10" },
    { id: "BRD-CNOPS-1025", org: "CNOPS (historique)", files: 17, amount: 2287.4, status: "En attente", tone: "warn", date: "25/10" },
  ];
  D.rejections = [
    { id: "FSE-88120", patient: "Pat. #4471", reason: "INPE prescripteur manquant", amount: 182.4 },
    { id: "FSE-88134", patient: "Pat. #1903", reason: "Date ordonnance > 3 mois", amount: 96.0 },
    { id: "FSE-88177", patient: "Pat. #7720", reason: "Produit non remboursable", amount: 41.3 },
    { id: "FSE-88191", patient: "Pat. #2268", reason: "Immatriculation invalide", amount: 233.1 },
  ];

  D.ordonnancier = [
    { n: "ORD-2026-004812", date: "11/11 10:42", pid: "p3", qty: 1, prescriber: "Dr. K. Alaoui · INPE 11028", patient: "Pat. #4471" },
    { n: "ORD-2026-004811", date: "11/11 10:15", pid: "p9", qty: 1, prescriber: "Dr. M. Fassi · INPE 20914", patient: "Pat. #3310" },
    { n: "ORD-2026-004810", date: "11/11 09:58", pid: "p4", qty: 2, prescriber: "Dr. A. Berrada · INPE 18820", patient: "Pat. #2268" },
  ];
  D.stup = [
    { date: "10/11", pid: "p10", in: 0, out: 1, balance: 20, ref: "Ordonnance sur carnet à souches CS-55120 · Dr. N. Idrissi" },
    { date: "06/11", pid: "p10", in: 20, out: 0, balance: 21, ref: "Bon de commande BC-B-0118 · Dawa Maghreb" },
  ];

  D.sales7 = [18200, 21400, 19800, 23100, 24650, 17900, 22480];

  /* ---------- Officine: end-of-day, returns, inventory, prescribers, migration ---------- */
  // sales already rung up today before the demo session (by payment type); seed tickets below are added on top
  D.dayBase = { n: 68, cash: 10180.4, card: 5120.0, credit: 1295.6, insurer: 2044.0, fse: 28, float: 500 };
  D.daySales = [
    { n: "OFF1-T02-2026-000121", t: "10:58", cust: null, cover: null, total: 31.2, insurer: 0, fseEst: 0, patient: 31.2, pay: "cash", parts: { cash: 31.2 }, lines: [{ pid: "p1", name: "Doliprane 1000 mg", qty: 2, lot: "DL2604", amount: 31.2 }] },
    { n: "OFF1-T02-2026-000122", t: "11:05", cust: "Ahmed El Alami", cover: "AMO-CNSS · ALD", total: 28.4, insurer: 17.6, fseEst: 0, patient: 10.8, pay: "cash", parts: { cash: 10.8 }, lines: [{ pid: "p4", name: "Glucophage 850 mg", qty: 1, lot: "GL1102", amount: 28.4 }] },
    { n: "OFF1-T02-2026-000123", t: "11:12", cust: "Fatima Zahra Bennis", cover: "CNSS", total: 118.0, insurer: 0, fseEst: 67.2, patient: 118.0, pay: "card", parts: { card: 118.0 }, lines: [{ pid: "p5", name: "Coversyl 5 mg", qty: 1, lot: "CV9014", amount: 118.0 }] },
  ];
  D.prescribers = [
    { name: "Dr. K. Alaoui", inpe: "11028", spec: "Médecine générale · Maârif" },
    { name: "Dr. M. Fassi", inpe: "20914", spec: "Cardiologie · Gauthier" },
    { name: "Dr. A. Berrada", inpe: "18820", spec: "Endocrinologie · Racine" },
    { name: "Dr. N. Idrissi", inpe: "30417", spec: "Psychiatrie · Anfa" },
    { name: "Dr. S. Tazi", inpe: "27561", spec: "Pédiatrie · Bourgogne" },
    { name: "Dr. H. Chraibi", inpe: "15402", spec: "Pneumologie · CHU Ibn Rochd" },
  ];
  // supplier returns (credit notes expected from the wholesaler)
  D.supplierReturns = [
    { id: "RG-2026-0041", wh: "w1", pid: "p7", lot: "SM4410", qty: 7, reason: "Rappel de lot AMMPS 07/11 · reprise intégrale", kind: "Rappel", st: 1 },
    { id: "RG-2026-0042", wh: "w1", pid: "p1", lot: "DL2604", qty: 6, reason: "Péremption 12/2026 · fenêtre de retour jusqu'au 30/11", kind: "Péremption", st: 0 },
    { id: "RG-2026-0043", wh: "w2", pid: "p14", lot: "GV3107", qty: 15, reason: "Péremption 12/2026 · fenêtre de retour jusqu'au 15/12", kind: "Péremption", st: 0 },
    { id: "RG-2026-0044", wh: "w2", pid: "p6", lot: "VT3381", qty: 9, reason: "Péremption 12/2026 · fenêtre de retour jusqu'au 15/12", kind: "Péremption", st: 0 },
    { id: "RG-2026-0045", wh: "w1", pid: "p5", lot: "CV9014", qty: 1, reason: "Casse · boîte écrasée à la livraison du 07/11", kind: "Casse", st: 2 },
  ];
  // rolling inventory: one shelf, blind count
  D.inventory = { shelf: "Rayon A3 · antalgiques", items: ["p1", "p2", "p19", "p22", "p8", "p20", "p21", "p13"], sample: { p1: 47, p2: 30, p19: 23, p22: 36, p8: 26, p20: 17, p21: 20, p13: 0 } };
  // import jobs for the migration plugins
  D.imports = {
    winpharm: { name: "Winpharm", file: "Sauvegarde Winpharm 7.4 · 11/11 06:00", rows: [["Produits", "2 846 références", "lots, PPV, emplacements"], ["Clients", "1 212 fiches", "couverture, immatriculation"], ["Carnet", "38 comptes · 24 860,00 DH", "soldes rapprochés au centime"], ["Historique", "36 mois · 81 400 ventes", "pour les prévisions de smart-buy"]] },
    sobrus: { name: "Sobrus", file: "Export Sobrus Pharma · API partenaire", rows: [["Produits", "2 611 références", "lots, PPV, emplacements"], ["Clients", "984 fiches", "couverture, immatriculation"], ["Carnet", "41 comptes · 19 230,00 DH", "soldes rapprochés au centime"], ["Historique", "24 mois · 58 900 ventes", "pour les prévisions de smart-buy"]] },
  };


  /* ---------- Parapharmacy catalogue ---------- */
  D.shops = [
    { id: "s1", name: "Casablanca · Maârif", short: "Casa" },
    { id: "s2", name: "Rabat · Agdal", short: "Rabat" },
    { id: "s3", name: "Marrakech · Guéliz", short: "Marrakech" },
  ];
  D.paraProducts = [
    { id: "q1", brand: "La Roche-Posay", range: "Anthelios", name: "UVMune 400 Fluide SPF50+", color: "#2f6fb0", price: 219, cost: 146, ean: "3337875797597", variants: [{ v: "50 ml", stock: [14, 6, 9] }, { v: "Teinté 50 ml", stock: [5, 2, 0] }] },
    { id: "q2", brand: "Avène", range: "Couvrance", name: "Fond de teint fluide", color: "#c98a6b", price: 189, cost: 121, ean: "3282770100068", shades: true, variants: [{ v: "1.0 Porcelaine", sw: "#f1d9c6", stock: [3, 4, 1] }, { v: "2.0 Naturel", sw: "#e3bf9f", stock: [6, 2, 3] }, { v: "3.0 Sable", sw: "#c99a72", stock: [2, 5, 4] }, { v: "4.0 Miel", sw: "#a8754e", stock: [1, 0, 2] }] },
    { id: "q3", brand: "Bioderma", range: "Sensibio", name: "H2O eau micellaire", color: "#d76a8c", price: 149, cost: 102, ean: "3401345935571", variants: [{ v: "250 ml", stock: [22, 15, 18] }, { v: "500 ml", stock: [11, 9, 4] }] },
    { id: "q4", brand: "Vichy", range: "Minéral 89", name: "Booster quotidien", color: "#3d8f87", price: 265, cost: 178, ean: "3337875543248", variants: [{ v: "50 ml", stock: [7, 3, 5] }] },
    { id: "q5", brand: "Nuxe", range: "Huile Prodigieuse", name: "Huile sèche multi-usage", color: "#c49a2c", price: 235, cost: 152, ean: "3264680009761", variants: [{ v: "100 ml", stock: [9, 6, 8] }, { v: "Or 100 ml", stock: [3, 1, 2] }] },
    { id: "q6", brand: "Mustela", range: "Bébé", name: "Hydra Bébé crème visage", color: "#5a9bd5", price: 129, cost: 84, ean: "3504105036027", variants: [{ v: "40 ml", stock: [12, 10, 6] }] },
    { id: "q7", brand: "Uriage", range: "Bariéderm", name: "Cica-crème réparatrice", color: "#6b7fb8", price: 159, cost: 104, ean: "3661434006357", variants: [{ v: "40 ml", stock: [8, 4, 7] }] },
    { id: "q8", brand: "Nuxe", range: "Coffrets", name: "Coffret Rêve de Miel (kit)", color: "#b8862f", price: 349, cost: 220, ean: "3264680032011", kit: true, variants: [{ v: "Coffret", stock: [6, 3, 4] }] },
  ];
  D.promos = [
    { id: "pr1", name: "Anthelios : 2ᵉ à -50 %", rule: "2e article -50 %", scope: "La Roche-Posay · Anthelios", funded: "Marque 70 % · Boutique 30 %", until: "30/11", active: true, uses: 86 },
    { id: "pr2", name: "Sensibio 3 pour 2", rule: "3 pour 2", scope: "Bioderma · Sensibio H2O", funded: "Marque 100 %", until: "15/12", active: true, uses: 41 },
    { id: "pr3", name: "Black Friday soins visage -20 %", rule: "-20 % dès 400 DH", scope: "Catégorie Visage", funded: "Boutique", until: "29/11", active: false, uses: 0 },
  ];
  D.paraCustomers = [
    { id: "k1", name: "Salma Lahlou", initials: "SL", tier: "Gold", points: 1240, skin: "Mixte · sensible", routine: ["Sensibio H2O", "Minéral 89", "Anthelios Fluide"], last: "Il y a 21 j", spend: 4820, optin: true },
    { id: "k2", name: "Imane Berrada", initials: "IB", tier: "Silver", points: 610, skin: "Sèche", routine: ["Cica-crème", "Hydra Bébé (fille)"], last: "Il y a 6 j", spend: 1960, optin: true },
    { id: "k3", name: "Omar Chraibi", initials: "OC", tier: "Membre", points: 120, skin: "Grasse", routine: ["Anthelios Teinté"], last: "Il y a 2 mois", spend: 410, optin: false },
  ];
  D.promoters = [
    { name: "Hind (La Roche-Posay)", shop: "Casa", days: "Ven · Sam", sales: 14250, target: 18000 },
    { name: "Kenza (Avène)", shop: "Rabat", days: "Jeu · Sam", sales: 9800, target: 12000 },
    { name: "Rim (Nuxe)", shop: "Marrakech", days: "Sam", sales: 6100, target: 6000 },
  ];
  D.inbox = [
    { id: "m1", from: "Salma L.", channel: "WhatsApp", last: "Vous avez le Couvrance 2.0 ? Je passe ce soir", time: "10:42", unread: 2, intent: "Réservation" },
    { id: "m2", from: "+212 6 61 •• 77", channel: "Instagram", last: "Prix du coffret Nuxe svp", time: "10:15", unread: 1, intent: "Prix" },
    { id: "m3", from: "Imane B.", channel: "WhatsApp", last: "Merci, bien reçu 👍", time: "Hier", unread: 0, intent: "—" },
  ];
  D.paraSales7 = [31200, 28900, 33400, 36100, 41800, 47200, 39600];

  /* ---------- Plugins ----------
     tier: system | ma | first | partner | private ; res: MA | EU ; off: full | degraded | cloud
     nav: [{id, label, icon, group}] ; cards: advisory/veto contributions handled in code by plugin id */
  const sys = (id, name, desc, nav, icon) => ({ id, name, desc, tier: "system", pub: "Apotheka", kind: "Système", res: "MA", off: "full", pinned: true, installed: true, icon: icon || "box", nav: nav || [], perms: ["Registre légal"], price: "Inclus" });
  const ma = (id, name, desc, nav, icon) => ({ id, name, desc, tier: "ma", pub: "Apotheka · Pack Maroc", kind: "Pack pays", res: "MA", off: "full", pinned: true, installed: true, icon: icon || "shield", nav: nav || [], perms: ["Obligation légale"], price: "Inclus" });


  /* theme plugins: signed data packs (tokens only, no code). accent:null = keep the variant's own accent. */
  const F = {
    archivo: '"Archivo","Helvetica Neue",Arial,sans-serif',
    plex: '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif',
    brico: '"Bricolage Grotesque","Archivo",system-ui,sans-serif',
    literata: '"Literata",Georgia,"Times New Roman",serif',
    atkinson: '"Atkinson Hyperlegible",system-ui,-apple-system,sans-serif',
  };
  D.fonts = F;
  const theme = (id, name, desc, tier, pub, installed, price, t, extra) => ({ id, name, desc, tier, pub, kind: "Thème", res: "MA", off: "full", installed, icon: "palette", nav: [], perms: ["Aucune donnée lue ni envoyée", "Aucun code exécuté : valeurs déclaratives signées"], price, theme: t, ...(extra || {}) });
  const themesFor = (v) => [
    theme("theme.classique", "Apotheka Classique", "Le thème de base d'Apotheka : sobre, lisible, couleur de la variante. Toujours disponible.", "first", "Apotheka", true, "Inclus",
      { label: "Apotheka Classique", accent: null, radius: 10, display: F.archivo, body: F.plex, density: "standard", sample: v === "officine" ? ["#f3f6f5", "#ffffff", "#0d7457", "#43bf93"] : ["#f3f6f5", "#ffffff", "#9a3566", "#e07aab"] }, { themeBase: true }),
    v === "officine"
      ? theme("theme.verte", "Officine Verte", "Le vert de la croix d'officine, des formes douces et une typographie chaleureuse.", "first", "Apotheka", true, "Inclus",
        { label: "Officine Verte", accent: "#0a6b4f", accentDark: "#4fcf9f", bg: "#eef5f1", panel: "#ffffff", bgDark: "#0b1411", panelDark: "#111d18", radius: 16, display: F.brico, body: F.plex, density: "standard", touch: "#0a6b4f" })
      : theme("theme.rose", "Rose Para", "Le prune de la parapharmacie, adouci : formes rondes, titres expressifs, fond poudré.", "first", "Apotheka", true, "Inclus",
        { label: "Rose Para", accent: "#9c3768", accentDark: "#ea8ab8", bg: "#f8f1f4", panel: "#ffffff", bgDark: "#150e12", panelDark: "#1e141a", radius: 16, display: F.brico, body: F.plex, density: "standard", touch: "#9c3768" }),
    theme("theme.majorelle", "Majorelle", "Le bleu du jardin Majorelle relevé d'une touche safran. Titres Bricolage, angles généreux.", "partner", "Studio Atlas", false, "290 DH une fois",
      { label: "Majorelle", accent: "#2440c2", accentDark: "#8fa3ff", bg: "#f2f4fb", panel: "#ffffff", bgDark: "#0b0e20", panelDark: "#12162e", radius: 14, display: F.brico, body: F.plex, density: "standard", touch: "#e8a317", touchFg: "#1a1f4d" }),
    theme("theme.nuit", "Nuit de garde", "Pensé pour la nuit : fond sombre profond, lavande apaisée, contrastes doux pour les yeux fatigués.", "first", "Apotheka", true, "Inclus",
      { label: "Nuit de garde", accent: "#5b4a9e", accentDark: "#b6a8ec", bg: "#f1f0f6", panel: "#ffffff", bgDark: "#0b0b12", panelDark: "#13131d", radius: 12, display: F.archivo, body: F.plex, density: "standard", mode: "dark" }),
    theme("theme.lisible", "Haute lisibilité", "Accessibilité : police Atkinson Hyperlegible, texte plus grand, contraste renforcé, jaune de focus en sombre.", "first", "Apotheka · Accessibilité", false, "Inclus",
      { label: "Haute lisibilité", accent: "#14213d", accentDark: "#ffd166", accentFgDark: "#111111", radius: 8, display: F.atkinson, body: F.atkinson, density: "confort", contrast: true }),
    theme("theme.sahara", "Sahara", "Sables chauds et bronze des dunes, titres Literata. Neutres minéraux, ni crème ni terracotta.", "partner", "Studio Atlas", false, "290 DH une fois",
      { label: "Sahara", accent: "#7d5d26", accentDark: "#d9b46f", bg: "#efebe4", panel: "#fbfaf7", bgDark: "#14120e", panelDark: "#1c1914", radius: 6, display: F.literata, body: F.plex, density: "standard" }),
    v === "officine"
      ? theme("theme.souss", "Groupement Souss · marque blanche", "Thème privé du groupement : couleurs, logo et nom du groupement dans toutes les officines membres.", "private", "Groupement Souss · privé", false, "Privé",
        { label: "Groupement Souss", accent: "#0e5a64", accentDark: "#5cc2c9", bg: "#eff4f4", panel: "#ffffff", bgDark: "#0a1214", panelDark: "#101b1e", radius: 4, display: F.archivo, body: F.plex, density: "compacte", touch: "#d39b2a", touchFg: "#10282b", brand: { name: "Souss Santé", initials: "GS" } })
      : theme("theme.paraphar", "Paraphar Atlas · marque blanche", "Thème privé de la chaîne : son nom, son monogramme et ses couleurs dans les 4 boutiques.", "private", "Paraphar Atlas · privé", false, "Privé",
        { label: "Paraphar Atlas", accent: "#1f3b5c", accentDark: "#8db4e3", bg: "#f2f3f5", panel: "#ffffff", bgDark: "#0c1016", panelDark: "#131923", radius: 4, display: F.literata, body: F.plex, density: "compacte", touch: "#c9a36a", touchFg: "#1f2a3a", brand: { name: "Paraphar Atlas", initials: "PA" } }),
  ];
  D.plugins = {
    officine: [
      sys("core.sales", "Comptoir & ventes", "Tickets, factures, séries fiscales par terminal, sessions de caisse, Z.", [{ id: "counter", label: "Comptoir", icon: "scan", group: "Quotidien" }, { id: "cloture", label: "Clôture de caisse", icon: "receipt", group: "Quotidien" }], "scan"),
      sys("core.stock", "Stock & lots", "Lots, péremptions, PPV multiples, mouvements, inventaires.", [{ id: "stock", label: "Stock", icon: "box", group: "Gestion" }, { id: "inventory", label: "Inventaire", icon: "box", group: "Gestion" }]),
      sys("core.purchasing", "Achats & réceptions", "Commandes, réceptions en attente, BL, avoirs, UG, reliquats.", [{ id: "purchasing", label: "Achats", icon: "truck", group: "Gestion" }], "truck"),
      sys("core.credit", "Carnet clients", "Comptes famille, plafonds, paiements partiels.", [{ id: "customers", label: "Clients & carnet", icon: "users", group: "Gestion" }], "users"),
      sys("core.journal", "Journal comptable", "Écritures dérivées des événements, export comptable.", [], "book"),
      sys("core.identity", "Identité & rôles", "Organisation, sites, terminaux, utilisateurs, audit.", [], "key"),
      ma("ma.cnss-fse", "CNSS · FSE", "Feuille de soins électronique, e-ordonnance QR.", [], "card"),
      ma("ma.tiers-payant", "Tiers payant", "AMO, CNSS (dont ex-CNOPS), mutuelles ; bordereaux, rejets.", [{ id: "claims", label: "Tiers payant", icon: "card", group: "Gestion" }], "card"),
      ma("ma.registers", "Registres légaux", "Ordonnancier, registre des stupéfiants, export inspection.", [{ id: "registers", label: "Registres", icon: "book", group: "Conformité" }], "book"),
      ma("ma.dispensing", "Dispensation", "Contrôle ordonnance listes I/II/B, quantités, substitution.", [], "shield"),
      ma("ma.recalls", "Rappels de lots", "Retraits AMMPS → quarantaine et blocage de vente.", [], "alert"),
      ma("ma.pricing", "Prix réglementés", "Garde-fou PPV, décrets datés, étiquettes à réimprimer.", [], "tag"),
      ma("ma.fiscal", "Fiscalité", "TVA, timbre, mentions légales verrouillées, e-facture DGI.", [], "receipt"),
      ma("ma.privacy", "Données personnelles", "CNDP, demandes d'accès, crypto-effacement.", [], "lock"),
      ma("ma.conformity", "Conformité", "Périmètre certifié, empreinte, auto-test, séries.", [{ id: "conformity", label: "Conformité", icon: "check", group: "Conformité" }], "check"),
      { id: "smart-buy", name: "Smart-buy", desc: "Suggestions d'achat et répartition entre grossistes par prix × UG × délai.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "degraded", installed: true, icon: "spark", nav: [{ id: "smartbuy", label: "Smart-buy", icon: "spark", group: "Gestion" }], perms: ["Lire ventes et stock", "Proposer des commandes"], price: "Inclus dans le pack" },
      { id: "wh.dawa", name: "Dawa Maghreb", desc: "Devis, commandes, suivi, BL électroniques, crédit, tournées, rappels.", tier: "partner", pub: "Dawa Maghreb · via Wholesaler API", kind: "Connecteur", res: "MA", off: "degraded", installed: true, icon: "truck", nav: [], perms: ["Ses propres commandes et BL", "Jamais les achats chez les autres"], egress: ["api.dawa.ma"], price: "Gratuit" },
      { id: "wh.atlas", name: "Grossiste Atlas", desc: "Connecteur grossiste conforme au contrat Wholesaler API v1.", tier: "partner", pub: "Grossiste Atlas · via Wholesaler API", kind: "Connecteur", res: "MA", off: "degraded", installed: true, icon: "truck", nav: [], perms: ["Ses propres commandes et BL"], egress: ["b2b.atlas-pharma.ma"], price: "Gratuit" },
      { id: "wh.fallback", name: "Grossiste sans API", desc: "Commande par PDF / e-mail, BL importé par CSV ou photo (OCR).", tier: "first", pub: "Apotheka", kind: "Connecteur", res: "MA", off: "degraded", installed: true, icon: "mail", nav: [], perms: ["Envoyer un e-mail de commande"], price: "Inclus" },
      { id: "wh.sud", name: "Répartiteur Sud", desc: "Nouveau grossiste conforme au contrat Wholesaler API v1 : devis, commandes, BL électroniques. Apparaît dans smart-buy dès l'installation.", tier: "partner", pub: "Répartiteur Sud · via Wholesaler API", kind: "Connecteur", res: "MA", off: "degraded", installed: false, icon: "truck", nav: [], perms: ["Ses propres commandes et BL", "Jamais les achats chez les autres"], egress: ["api.repartiteur-sud.ma"], price: "Gratuit" },
      { id: "garde", name: "Mode garde", desc: "Nuits et jours fériés : majoration de garde sur le ticket, bandeau au comptoir, registre de garde.", tier: "first", pub: "Apotheka", kind: "Règle", res: "MA", off: "full", installed: true, icon: "moon", nav: [], perms: ["Ajouter une ligne de majoration au ticket", "Tenir le registre de garde"], price: "Inclus" },
      { id: "generics", name: "Substitution générique", desc: "Carte conseil quand un générique moins cher existe : écart de prix et reste à charge du patient. Journal des substitutions.", tier: "first", pub: "Apotheka", kind: "Règle", res: "MA", off: "full", installed: true, icon: "copy", nav: [], perms: ["Lire le panier (DCI)", "Proposer une substitution"], price: "Inclus" },
      { id: "import.winpharm", name: "Migration Winpharm · mode ombre", desc: "Importe produits, clients, carnet et historique depuis Winpharm, puis fait tourner smart-buy en parallèle de votre logiciel actuel.", tier: "first", pub: "Apotheka", kind: "Migration", res: "MA", off: "cloud", installed: false, icon: "download", nav: [{ id: "migration", label: "Import & coexistence", icon: "download", group: "Plateforme" }], perms: ["Lire la sauvegarde Winpharm", "Créer produits, clients et soldes carnet"], price: "Inclus" },
      { id: "import.sobrus", name: "Migration Sobrus · mode ombre", desc: "Même parcours depuis Sobrus Pharma : import complet puis coexistence pendant la période d'essai.", tier: "first", pub: "Apotheka", kind: "Migration", res: "MA", off: "cloud", installed: false, icon: "download", nav: [{ id: "migration-sobrus", label: "Import Sobrus", icon: "download", group: "Plateforme" }], perms: ["Lire l'export Sobrus", "Créer produits, clients et soldes carnet"], price: "Inclus" },
      { id: "expiry-radar", name: "Radar péremptions", desc: "Lots à 3/6 mois liés aux fenêtres de retour grossiste.", tier: "first", pub: "Apotheka", kind: "Rapport", res: "MA", off: "full", installed: true, icon: "clock", nav: [], perms: ["Lire stock"], price: "Inclus" },
      { id: "dup-therapy", name: "Doublon thérapeutique", desc: "Carte conseil quand deux produits de même DCI sont au panier.", tier: "first", pub: "Apotheka", kind: "Règle", res: "MA", off: "full", installed: true, icon: "copy", nav: [], perms: ["Lire le panier (DCI)"], price: "Inclus" },
      { id: "agent", name: "Assistant Apotheka", desc: "Brouillons de commandes, relances de rejets, explications. Ne valide jamais seul.", tier: "first", pub: "Apotheka", kind: "Agent", res: "MA", off: "cloud", installed: true, icon: "bot", nav: [{ id: "agent", label: "Assistant", icon: "bot", group: "Quotidien" }], perms: ["Lire les modèles agrégés", "Proposer des brouillons"], price: "Inclus" },
      { id: "special-orders", name: "Commandes clients", desc: "Réservations, acomptes, SMS à l'arrivée du produit.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "full", installed: true, icon: "bag", nav: [], perms: ["Lire clients (MA)"], price: "Inclus" },
      { id: "interactions", name: "Interactions médicamenteuses", desc: "Base d'interactions sourcée, sous licence, évaluée localement. Carte conseil au comptoir.", tier: "partner", pub: "MedRef Maroc (partenaire)", kind: "Pack de données", res: "MA", off: "full", installed: false, icon: "pill", nav: [], perms: ["Lire les DCI du panier", "Aucune donnée patient", "Aucune sortie réseau"], price: "90 DH/mois", featured: true },
      { id: "preparations", name: "Préparations magistrales", desc: "Formules, lots de matières premières, prix, registre et étiquette.", tier: "first", pub: "Apotheka", kind: "Type de document", res: "MA", off: "full", installed: false, icon: "flask", nav: [{ id: "doc:preparations", label: "Préparations", icon: "flask", group: "Services" }], perms: ["Créer des documents de préparation", "Mouvements de stock (matières)"], price: "Inclus", doc: { title: "Préparations magistrales", prefix: "PREP", states: ["Brouillon", "En préparation", "Contrôlée", "Délivrée"], cols: ["Formule", "Patient", "Prescripteur", "Prix"], rows: [["Crème urée 10 % · 100 g", "Pat. #3310", "Dr. M. Fassi", "85,00"], ["Gélules mélatonine 3 mg ×30", "Pat. #1903", "Dr. A. Berrada", "120,00"], ["Sirop pédiatrique ·  120 ml", "Pat. #5512", "Dr. K. Alaoui", "64,00"]] } },
      { id: "rental", name: "Location de matériel", desc: "Fauteuils, oxygène, tire-lait : contrats, cautions, retours.", tier: "partner", pub: "MediLoc (partenaire)", kind: "Type de document", res: "MA", off: "degraded", installed: false, icon: "wheel", nav: [{ id: "doc:rental", label: "Location matériel", icon: "wheel", group: "Services" }], perms: ["Créer des contrats de location", "Lire clients (MA)"], price: "60 DH/mois", doc: { title: "Location de matériel", prefix: "LOC", states: ["Réservé", "En location", "Retourné", "Clôturé"], cols: ["Matériel", "Client", "Caution", "Retour prévu"], rows: [["Fauteuil roulant pliant", "Famille Idrissi", "1 500,00", "25/11"], ["Concentrateur O₂ 5 L", "F. Bennis", "4 000,00", "02/12"]] } },
      { id: "cold-chain", name: "Chaîne du froid", desc: "Sondes réfrigérateur, alertes d'excursion, proposition de quarantaine.", tier: "partner", pub: "FrigoSense (partenaire IoT)", kind: "Connecteur", res: "MA", off: "degraded", installed: false, icon: "snow", nav: [], perms: ["Recevoir les relevés de sondes", "Proposer une quarantaine"], egress: ["ingest.frigosense.ma"], price: "120 DH/mois" },
      { id: "sms", name: "SMS patients", desc: "« Votre produit est arrivé », rappels carnet. Agrégateur marocain.", tier: "partner", pub: "SMSMaroc (partenaire)", kind: "Connecteur", res: "MA", off: "degraded", installed: false, icon: "msg", nav: [], perms: ["Envoyer des SMS (numéro uniquement)"], egress: ["api.smsmaroc.ma"], price: "Au message" },
      { id: "tpe", name: "Paiement carte (TPE)", desc: "Montant envoyé au terminal, rapprochement des remises.", tier: "partner", pub: "Acquéreur agréé (partenaire)", kind: "Connecteur", res: "MA", off: "degraded", installed: false, icon: "card", nav: [], perms: ["Montant + référence ticket", "Aucune donnée carte"], price: "Frais acquéreur" },
      { id: "accounting", name: "Export Sage 100 Maroc", desc: "Journal comptable vers votre fiduciaire, mensuel ou à la demande.", tier: "first", pub: "Apotheka", kind: "Connecteur", res: "MA", off: "cloud", installed: false, icon: "book", nav: [], perms: ["Lire le journal (agrégé)"], price: "Inclus" },
      { id: "whatsapp", name: "WhatsApp patients", desc: "Messagerie patient. En attente d'avis juridique (traitement Meta hors Maroc).", tier: "partner", pub: "BSP WhatsApp (partenaire)", kind: "Connecteur", res: "EU", off: "cloud", installed: false, blocked: "En attente d'avis juridique CNDP", icon: "msg", nav: [], perms: ["Numéro + référence, jamais de contenu santé"], price: "—" },
      { id: "groupement-sync", name: "Groupement Souss · sync ERP", desc: "Plugin privé : prix négociés et commandes groupées du groupement.", tier: "private", pub: "Intégrateur certifié · privé", kind: "Liaison privée", res: "MA", off: "cloud", installed: false, icon: "link", nav: [], perms: ["Webhook sortant validé par l'admin", "Aucune donnée patient"], egress: ["erp.groupement-souss.ma"], price: "Privé" },
      ...themesFor("officine"),
    ],
    para: [
      sys("core.sales", "Caisse & ventes", "Tickets, séries fiscales par terminal, sessions de caisse, Z.", [{ id: "pcounter", label: "Caisse", icon: "scan", group: "Quotidien" }], "scan"),
      sys("core.catalogue", "Catalogue & variantes", "Produits sans AMM, marques/gammes, teintes et tailles.", [{ id: "pcatalog", label: "Catalogue", icon: "grid", group: "Gestion" }], "grid"),
      sys("core.stock", "Stock multi-boutiques", "Stock par boutique, testeurs, échantillons, dépôt-vente, transit.", [{ id: "pstock", label: "Stock & transferts", icon: "box", group: "Gestion" }]),
      sys("core.purchasing", "Achats distributeurs", "Commandes marques, minimums, gratuités, conditions.", [{ id: "ppurch", label: "Achats marques", icon: "truck", group: "Gestion" }], "truck"),
      sys("core.identity", "Identité & rôles", "Chaîne, boutiques, caisses, utilisateurs, audit.", [], "key"),
      ma("ma.fiscal", "Fiscalité", "TVA 20 %, mentions légales verrouillées, e-facture.", [], "receipt"),
      ma("ma.consumer", "Protection du consommateur", "Affichage prix, tickets, étiquetage arabe (loi 31-08).", [], "shield"),
      ma("ma.recalls", "Rappels & interdictions", "Interdictions cosmétiques AMMPS → blocage de vente.", [], "alert"),
      ma("ma.privacy", "Données personnelles", "Consentements, demandes d'accès, crypto-effacement.", [], "lock"),
      ma("ma.conformity", "Conformité", "Périmètre certifié, empreinte, séries.", [{ id: "conformity", label: "Conformité", icon: "check", group: "Conformité" }], "check"),
      { id: "promo.engine", name: "Moteur de promotions", desc: "2ᵉ à -50 %, 3 pour 2, paliers, financement marque/boutique.", tier: "first", pub: "Apotheka", kind: "Règle", res: "MA", off: "full", installed: true, icon: "tag", nav: [{ id: "promos", label: "Promotions", icon: "tag", group: "Commerce" }], perms: ["Appliquer des remises (para uniquement)"], price: "Inclus" },
      { id: "loyalty", name: "Fidélité", desc: "Points, paliers, offres anniversaire, carte unique toutes boutiques.", tier: "first", pub: "Apotheka", kind: "Règle", res: "MA", off: "full", installed: true, icon: "star", nav: [{ id: "clients", label: "Clientes & fidélité", icon: "users", group: "Commerce" }], perms: ["Lire clientes (MA)", "Points de fidélité"], price: "Inclus" },
      { id: "promoters", name: "Animatrices marques", desc: "Planning, présence, ventes attribuées, objectifs.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "full", installed: true, icon: "badge", nav: [{ id: "brands", label: "Marques & animatrices", icon: "badge", group: "Commerce" }], perms: ["Attribuer des ventes"], price: "Inclus" },
      { id: "social", name: "Vente sociale", desc: "Catalogue WhatsApp, commandes depuis la conversation, lien de paiement.", tier: "first", pub: "Apotheka + BSP", kind: "Connecteur", res: "MA", off: "cloud", installed: true, icon: "msg", nav: [{ id: "inbox", label: "Messages & commandes", icon: "msg", group: "Canaux" }], perms: ["Messages clientes (opt-in)"], price: "Inclus", note: "Contenu santé exclu des modèles" },
      { id: "chain.hq", name: "Siège chaîne", desc: "Prix, promos et assortiment poussés aux boutiques ; consolidation.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "cloud", installed: true, icon: "building", nav: [], perms: ["Lire toutes les boutiques"], price: "Inclus (chaînes)" },
      { id: "agent", name: "Assistant Apotheka", desc: "Plans promo, réassort, explications. Ne valide jamais seul.", tier: "first", pub: "Apotheka", kind: "Agent", res: "MA", off: "cloud", installed: true, icon: "bot", nav: [{ id: "agent", label: "Assistant", icon: "bot", group: "Quotidien" }], perms: ["Lire les modèles agrégés", "Proposer des brouillons"], price: "Inclus" },
      { id: "ecom", name: "E-shop & marketplaces", desc: "Boutique en ligne + Jumia sur le même stock. Médicaments exclus d'office.", tier: "first", pub: "Apotheka", kind: "Connecteur", res: "MA", off: "cloud", installed: false, icon: "globe", nav: [{ id: "channels", label: "E-commerce", icon: "globe", group: "Canaux" }], perms: ["Publier catalogue para", "Recevoir commandes"], price: "190 DH/mois", featured: true },
      { id: "skin-diag", name: "Diagnostic de peau", desc: "Questionnaire guidé → routine et panier proposés. Carte conseil en caisse.", tier: "partner", pub: "DermaLab (partenaire)", kind: "UI / carte conseil", res: "MA", off: "full", installed: false, icon: "face", nav: [], perms: ["Lire le profil peau (MA, consentement)", "Proposer une routine"], price: "70 DH/mois" },
      { id: "sellout", name: "Sell-out marques", desc: "Rapports de ventes par marque/EAN/boutique, consentis, vers portails marques.", tier: "first", pub: "Apotheka", kind: "Rapport", res: "MA", off: "cloud", installed: false, icon: "chart", nav: [], perms: ["Agrégats par marque", "Jamais de données clientes"], price: "Inclus" },
      { id: "giftcards", name: "Cartes cadeaux", desc: "Cartes physiques et e-cartes valables dans toutes les boutiques.", tier: "first", pub: "Apotheka", kind: "Domaine", res: "MA", off: "full", installed: false, icon: "gift", nav: [{ id: "doc:giftcards", label: "Cartes cadeaux", icon: "gift", group: "Commerce" }], perms: ["Émettre des cartes cadeaux"], price: "Inclus", doc: { title: "Cartes cadeaux", prefix: "GC", states: ["Émise", "Active", "Utilisée", "Expirée"], cols: ["Code", "Montant", "Solde", "Boutique"], rows: [["GC-7Q2M-91", "500,00", "500,00", "Casa"], ["GC-K8W1-04", "300,00", "120,00", "Rabat"]] } },
      { id: "delivery", name: "Livraison", desc: "Coursiers, contre-remboursement, suivi. Para uniquement. En attente d'avis juridique pour les coursiers étrangers.", tier: "partner", pub: "Amana · coursiers (partenaires)", kind: "Connecteur", res: "MA", off: "cloud", installed: false, icon: "truck", nav: [], perms: ["Adresse de livraison", "Para uniquement"], egress: ["api.amana.ma"], price: "Par livraison" },
      { id: "tpe", name: "Paiement carte & wallets", desc: "TPE, QR wallets, liens de paiement.", tier: "partner", pub: "Acquéreur agréé (partenaire)", kind: "Connecteur", res: "MA", off: "degraded", installed: true, icon: "card", nav: [], perms: ["Montant + référence ticket"], price: "Frais acquéreur" },
      ...themesFor("para"),
    ],
  };

  D.accessLog = [
    { t: "10:42", plugin: "wh.dawa", what: "Commande · 14 lignes (EAN, qté)", res: "MA", dest: "api.dawa.ma" },
    { t: "10:41", plugin: "wh.atlas", what: "Demande de devis · 1 ligne (EAN)", res: "MA", dest: "b2b.atlas-pharma.ma" },
    { t: "10:40", plugin: "smart-buy", what: "Lecture ventes agrégées 90 j", res: "MA", dest: "local" },
    { t: "09:05", plugin: "wh.atlas", what: "BL électronique AT-55120", res: "MA", dest: "b2b.atlas-pharma.ma" },
    { t: "08:12", plugin: "agent", what: "Lecture stock agrégé (aucune donnée patient)", res: "MA", dest: "modèle (sans PII)" },
  ];

  window.APO_DATA = D;
})();
