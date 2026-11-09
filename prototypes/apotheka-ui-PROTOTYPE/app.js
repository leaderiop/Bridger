/* PROTOTYPE — boot. Throwaway code. */
(function () {
  const APO = window.APO, D = window.APO_DATA;
  const h = (location.hash || "").replace("#", "");
  const variant = h.startsWith("para") ? "para" : "officine";
  document.documentElement.dataset.variant = variant;
  const installed = (v) => Object.fromEntries(D.plugins[v].map((p) => [p.id, !!p.installed]));
  const empty = () => ({ tasks: [], exceptions: [], series: 1 });
  APO.boot({
    variant,
    screen: { officine: "home", para: "home" },
    installed: { officine: installed("officine"), para: installed("para") },
    offline: false, queue: [], toasts: [], palette: false, sideOpen: false, fresh: null, tour: null, intro: !h, bare: false, newPlugins: {},
    appearance: { officine: { themeId: "theme.classique", overrides: {}, scope: "site" }, para: { themeId: "theme.classique", overrides: {}, scope: "org" } },
    events: [
      { t: "08:12", text: "Commande CMD-2611-0042 envoyée à Dawa Maghreb (connexion directe)", kind: "ok", v: "officine" },
      { t: "08:02", text: "Ouverture de caisse T02 · fond 500,00 DH", kind: "info", v: "officine" },
      { t: "07:58", text: "Liste officielle des rappels AMMPS mise à jour (07/11, signée)", kind: "info", v: "officine" },
      { t: "09:30", text: "Promotions poussées par le siège aux 4 boutiques", kind: "ok", v: "para" },
      { t: "09:02", text: "Ouverture de caisse C01 · Casablanca Maârif", kind: "info", v: "para" },
    ],
    officine: APO.init.officine ? APO.init.officine() : empty(),
    para: APO.init.para ? APO.init.para() : empty(),
  });
  ReactDOM.createRoot(document.getElementById("root")).render(APO.html`<${APO.App} />`);
})();
