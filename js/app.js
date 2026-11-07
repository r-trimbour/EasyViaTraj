/*
 * app.js — logique d'interface d'EasyViaTraj (tableau compact).
 * Dépend de render.js et search.js (chargés avant).
 */
(function () {
  "use strict";

  var R = window.EVT.render;
  var S = window.EVT.search;

  /*
   * Médicaments fréquents (panneau de droite) — orientés soins post-orthopédiques.
   * Indépendants de data/drugs.json (BDPM) : chaque entrée porte son propre libellé.
   *   label : texte de la ligne (« Nom, dosage (forme) », ou rythme non quotidien inclus)
   *   s     : doses [matin, midi, soir] (0 = case non cochée) — absent = rien de coché
   *   cond  : condition « si » pré-remplie
   *   text  : texte du bouton si différent du libellé
   * Ce ne sont que des valeurs par défaut : tout reste modifiable dans le tableau.
   */
  var FAVORITES = [
    { cat: "Douleur", label: "Paracétamol, 1000 mg (cp)", s: [1, 1, 1] },
    { cat: "Douleur", label: "Paracétamol, 500 mg (cp)", s: [2, 2, 2] },
    { cat: "Douleur", label: "Néfopam (Acupan), 20 mg (ampoule)", s: [1, 1, 1], cond: "EVA > 3" },

    { cat: "Anticoagulants", label: "Énoxaparine (Lovenox), 4000 UI (injection)", s: [0, 0, 1] },
    { cat: "Anticoagulants", label: "Apixaban (Eliquis), 2.5 mg (cp)", s: [1, 0, 1] },
    { cat: "Anticoagulants", label: "Apixaban (Eliquis), 5 mg (cp)", s: [1, 0, 1] },
    { cat: "Anticoagulants", label: "Rivaroxaban (Xarelto), 10 mg (cp)", s: [1, 0, 0] },
    { cat: "Anticoagulants", label: "Acide acétylsalicylique (Kardégic), 75 mg (sachet)", s: [0, 1, 0] },

    { cat: "Diabète", label: "Metformine, 1000 mg (cp)", s: [1, 0, 1] },
    { cat: "Diabète", label: "Insuline glargine (Lantus), 100 UI/mL (injection)" },
    { cat: "Diabète", label: "Insuline asparte (Novorapid), 100 UI/mL (injection)" },

    { cat: "Cardio", label: "Bisoprolol, 5 mg (cp)", s: [1, 0, 0] },
    { cat: "Cardio", label: "Amlodipine, 5 mg (cp)", s: [1, 0, 0] },
    { cat: "Cardio", label: "Ramipril, 5 mg (cp)", s: [1, 0, 0] },
    { cat: "Cardio", label: "Furosémide (Lasilix), 40 mg (cp)", s: [1, 0, 0] },
    { cat: "Cardio", label: "Atorvastatine, 20 mg (cp)", s: [0, 0, 1] },
    { cat: "Cardio", label: "Rosuvastatine, 10 mg (cp)", s: [0, 0, 1] },

    { cat: "Os", label: "Colécalciférol (Uvedose), 100 000 UI (ampoule) : 1 tous les 3 mois",
      text: "Colécalciférol (Uvedose), 100 000 UI" },
    { cat: "Os", label: "Calcium / Vitamine D (Cacit D3), 500/1000 mg/UI (sachet)", s: [0, 1, 0] },
    { cat: "Os", label: "Acide alendronique (Fosamax), 70 mg (cp) : 1 par semaine",
      text: "Acide alendronique (Fosamax), 70 mg" },

    { cat: "Digestif", label: "Oméprazole, 20 mg (gélule)", s: [1, 0, 0] },
    { cat: "Digestif", label: "Ésoméprazole, 40 mg (cp)", s: [1, 0, 0] },

    { cat: "Psy / Neuro", label: "Zopiclone (Imovane), 7.5 mg (cp)", s: [0, 0, 1] },
    { cat: "Psy / Neuro", label: "Oxazépam (Séresta), 10 mg (cp)", s: [0, 0, 1] },
    { cat: "Psy / Neuro", label: "Donépézil (Aricept), 10 mg (cp)", s: [0, 0, 1] },
    { cat: "Psy / Neuro", label: "Mémantine (Ebixa), 20 mg (cp)", s: [1, 0, 0] },

    { cat: "Thyroïde", label: "Lévothyroxine (Levothyrox), … µg (cp)", s: [1, 0, 0],
      text: "Lévothyroxine (dosage à préciser)" }
  ];

  var state = {
    drugs: [],
    index: [],
    rows: [],
    outputLocked: false, // true dès que l'utilisateur tape dans la zone de texte
    seq: 0
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.searchInput = $("searchInput");
    el.searchResults = $("searchResults");
    el.rows = $("rows");
    el.emptyHint = $("emptyHint");
    el.favList = $("favList");
    el.output = $("output");
    el.copyBtn = $("copyBtn");
    el.regenBtn = $("regenBtn");
    el.copyStatus = $("copyStatus");
    el.syncHint = $("syncHint");

    renderFavorites();
    loadDrugs();

    el.searchInput.addEventListener("input", onSearchInput);
    el.searchInput.addEventListener("keydown", onSearchKeydown);
    document.addEventListener("click", function (e) {
      if (!el.searchResults.contains(e.target) && e.target !== el.searchInput) closeResults();
    });

    el.output.addEventListener("input", function () {
      state.outputLocked = true;
      el.syncHint.hidden = false;
    });
    el.copyBtn.addEventListener("click", copyOutput);
    el.regenBtn.addEventListener("click", regenerate);
  }

  function loadDrugs() {
    fetch("data/drugs.json?v=8")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.drugs = data.drugs || [];
        state.index = S.buildIndex(state.drugs);
      })
      .catch(function () {
        el.searchResults.innerHTML =
          '<div class="result-error">Impossible de charger la base de médicaments ' +
          "(ouvrir via GitHub Pages ou un serveur local). La saisie libre reste possible.</div>";
        el.searchResults.hidden = false;
      });
  }

  // ---------- Fréquents ----------
  function renderFavorites() {
    el.favList.innerHTML = "";
    var lastCat = null;
    FAVORITES.forEach(function (f) {
      if (f.cat !== lastCat) {
        var h = document.createElement("div");
        h.className = "fav-cat";
        h.textContent = f.cat;
        el.favList.appendChild(h);
        lastCat = f.cat;
      }
      var label = f.label;
      var scheme = f.s ? f.s.join("-") : "";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fav-btn";
      b.innerHTML = '<span class="fav-name">' + escapeHtml(f.text || label) + "</span>" +
        (scheme ? '<span class="fav-scheme">' + scheme + "</span>" : "");
      b.title = "Ajouter : " + label + (scheme ? " — " + scheme : "") + (f.cond ? " si " + f.cond : "");
      b.addEventListener("click", function () { addRow(label, f); });
      el.favList.appendChild(b);
    });
    fitFavorites();
    window.addEventListener("resize", fitFavorites);
  }

  // Limite la hauteur visible du panneau à FAV_VISIBLE médicaments ; le reste défile dans le panneau.
  var FAV_VISIBLE = 12;
  function fitFavorites() {
    el.favList.style.maxHeight = "";
    var btns = el.favList.querySelectorAll(".fav-btn");
    if (btns.length <= FAV_VISIBLE) return;
    var last = btns[FAV_VISIBLE - 1];
    el.favList.style.maxHeight = (last.offsetTop + last.offsetHeight + 2) + "px";
  }

  // ---------- Recherche ----------
  function onSearchInput() {
    var q = el.searchInput.value;
    if (!q.trim()) { closeResults(); return; }
    renderResults(S.search(state.index, q, 30), q.trim());
  }

  function onSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var first = el.searchResults.querySelector(".result-item");
      if (first) first.click();
      else if (el.searchInput.value.trim()) addFree(el.searchInput.value.trim());
    } else if (e.key === "Escape") {
      closeResults();
    }
  }

  function renderResults(results, query) {
    el.searchResults.innerHTML = "";
    results.forEach(function (item) {
      var label = R.buildLabel(item.drug);
      var alias = S.matchedAlias(item, query);
      var div = document.createElement("div");
      div.className = "result-item";
      div.innerHTML =
        '<span class="result-label">' + escapeHtml(label) +
        (alias ? ' <span class="result-alias">= ' + escapeHtml(alias) + "</span>" : "") + "</span>" +
        '<span class="result-class">' + escapeHtml(item.drug.class || brands(item.drug)) + "</span>";
      div.addEventListener("click", function () { addRow(label); resetSearch(); });
      el.searchResults.appendChild(div);
    });
    // Saisie libre : toujours proposée, pour les médicaments absents de la base
    var free = document.createElement("div");
    free.className = "result-item result-free";
    free.innerHTML = '<span class="result-label">+ Ajouter « ' + escapeHtml(query) +
      " » (saisie libre)</span>";
    free.addEventListener("click", function () { addFree(query); });
    el.searchResults.appendChild(free);
    el.searchResults.hidden = false;
  }

  // Noms commerciaux affichés à droite d'un résultat (hors noms de sels)
  function brands(drug) {
    return (drug.aliases || []).filter(function (a) {
      return !/^(di|mono|hémi)?(chlorhydrate|bromhydrate|sulfate|fumarate|maléate|tartrate|bésilate|mésilate|citrate|phosphate|acétate|succinate|oxalate)\b/i.test(a) &&
        a.indexOf("(") === -1;
    }).slice(0, 3).join(", ");
  }

  function addFree(text) {
    addRow(text);
    resetSearch();
  }

  function resetSearch() {
    el.searchInput.value = "";
    closeResults();
    el.searchInput.focus();
  }

  function closeResults() {
    el.searchResults.hidden = true;
    el.searchResults.innerHTML = "";
  }

  // ---------- Modèle ----------
  // scheme (optionnel) : { s: [matin, midi, soir], cond: "..." } — schéma pré-rempli
  function makeRow(label, scheme) {
    var row = {
      id: "r" + (++state.seq),
      label: label,
      slots: {
        matin: { active: false, dose: 1 },
        midi: { active: false, dose: 1 },
        soir: { active: false, dose: 1 }
      },
      customTimes: [],
      pendingCustom: null,
      condition: null,
      until: null,
      lastRendered: ""
    };
    if (scheme && scheme.s) {
      R.SLOT_ORDER.forEach(function (k, i) {
        var d = scheme.s[i];
        if (d > 0) { row.slots[k].active = true; row.slots[k].dose = d; }
      });
    }
    if (scheme && scheme.cond) row.condition = scheme.cond;
    return row;
  }

  function addRow(label, scheme) {
    var row = makeRow(label, scheme);
    row.lastRendered = R.renderLine(row);
    state.rows.push(row);
    el.rows.appendChild(buildRowEl(row));
    el.emptyHint.hidden = true;
    if (!state.outputLocked) rebuildOutput();
    else appendLine(row.lastRendered);
  }

  function removeRow(row) {
    var i = state.rows.indexOf(row);
    if (i !== -1) state.rows.splice(i, 1);
    var node = el.rows.querySelector('[data-row="' + row.id + '"]');
    if (node) node.remove();
    if (!state.rows.length) el.emptyHint.hidden = false;
    if (!state.outputLocked) rebuildOutput();
    else removeLine(row.lastRendered);
  }

  // ---------- Synchronisation de la zone de texte ----------
  function rebuildOutput() {
    el.output.value = R.renderAll(state.rows);
    state.rows.forEach(function (r) { r.lastRendered = R.renderLine(r); });
    state.outputLocked = false;
    el.syncHint.hidden = true;
  }

  function appendLine(line) {
    el.output.value = el.output.value ? el.output.value.replace(/\n*$/, "") + "\n" + line : line;
  }

  function removeLine(line) {
    var lines = el.output.value.split("\n");
    var idx = lines.indexOf(line);
    if (idx !== -1) {
      lines.splice(idx, 1);
      el.output.value = lines.join("\n");
    }
  }

  // Met à jour la ligne du médicament ; en place si la zone a été modifiée à la main.
  function syncRow(row) {
    if (!state.outputLocked) { rebuildOutput(); return; }
    var newLine = R.renderLine(row);
    var lines = el.output.value.split("\n");
    var idx = lines.indexOf(row.lastRendered);
    if (idx !== -1) {
      lines[idx] = newLine;
      el.output.value = lines.join("\n");
      row.lastRendered = newLine;
    } else {
      el.syncHint.hidden = false; // ligne modifiée à la main : on respecte l'édition
    }
  }

  function regenerate() {
    if (state.outputLocked && el.output.value.trim() &&
        !confirm("Régénérer à partir du tableau ? Les modifications manuelles de la zone de texte seront perdues.")) {
      return;
    }
    rebuildOutput();
  }

  // ---------- Ligne du tableau ----------
  function buildRowEl(row) {
    var tr = document.createElement("tr");
    tr.setAttribute("data-row", row.id);

    // Médicament (libellé modifiable)
    var tdName = td("col-name");
    var name = document.createElement("input");
    name.type = "text";
    name.className = "name-input";
    name.value = row.label;
    name.title = "Libellé modifiable (nom, dosage, forme)";
    name.addEventListener("input", function () { row.label = name.value; syncRow(row); });
    tdName.appendChild(name);
    tr.appendChild(tdName);

    // Matin / Midi / Soir
    R.SLOT_ORDER.forEach(function (key) { tr.appendChild(buildSlotCell(row, key)); });

    // Autre heure
    var tdTime = td("col-time");
    renderCustomTimes(row, tdTime);
    tr.appendChild(tdTime);

    // si (condition)
    var tdCond = td("col-cond");
    var condWrap = document.createElement("div");
    condWrap.className = "cond-wrap";
    var cond = document.createElement("input");
    cond.type = "text";
    cond.className = "cell-input";
    cond.placeholder = "—";
    cond.value = row.condition || "";
    cond.addEventListener("input", function () {
      row.condition = cond.value.trim() || null;
      syncRow(row);
    });
    var preset = document.createElement("button");
    preset.type = "button";
    preset.className = "btn-mini";
    preset.textContent = "EVA > 3";
    preset.title = "Insérer « si EVA > 3 »";
    preset.addEventListener("click", function () {
      cond.value = "EVA > 3";
      row.condition = "EVA > 3";
      syncRow(row);
    });
    condWrap.appendChild(cond);
    condWrap.appendChild(preset);
    tdCond.appendChild(condWrap);
    tr.appendChild(tdCond);

    // jusqu'au
    var tdUntil = td("col-until");
    var until = document.createElement("input");
    until.type = "date";
    until.className = "cell-input";
    until.addEventListener("input", function () { row.until = until.value || null; syncRow(row); });
    tdUntil.appendChild(until);
    tr.appendChild(tdUntil);

    // Supprimer
    var tdDel = td("col-del");
    var del = btn("✕", "Supprimer ce médicament", "btn-del");
    del.addEventListener("click", function () { removeRow(row); });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);

    return tr;
  }

  // Case à cocher ; une fois cochée, la dose devient réglable.
  function buildSlotCell(row, key) {
    var slot = row.slots[key];
    var cell = td("col-slot");
    var wrap = document.createElement("div");
    wrap.className = "slot-wrap";

    var check = document.createElement("input");
    check.type = "checkbox";
    check.className = "slot-check";
    check.checked = slot.active;
    check.setAttribute("aria-label", key);

    var stepper = buildStepper(
      function () { return slot.dose; },
      function (v) { slot.dose = v; syncRow(row); }
    );
    stepper.hidden = !slot.active;
    cell.classList.toggle("is-on", slot.active);

    check.addEventListener("change", function () {
      slot.active = check.checked;
      stepper.hidden = !slot.active;
      cell.classList.toggle("is-on", slot.active);
      syncRow(row);
    });

    wrap.appendChild(check);
    wrap.appendChild(stepper);
    cell.appendChild(wrap);
    return cell;
  }

  // Stepper compact − [n] +   (pas de 0.5)
  function buildStepper(get, set) {
    var box = document.createElement("div");
    box.className = "stepper";
    var minus = btn("−", "Diminuer", "btn-step");
    var input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "dose-input";
    input.value = R.formatNumber(get());
    var plus = btn("+", "Augmenter", "btn-step");

    function commit(v) {
      if (isNaN(v) || v < 0) v = 0;
      v = Math.round(v * 100) / 100;
      input.value = R.formatNumber(v);
      set(v);
    }
    minus.addEventListener("click", function () { commit(get() - 0.5); });
    plus.addEventListener("click", function () { commit(get() + 0.5); });
    input.addEventListener("change", function () {
      commit(parseFloat(input.value.replace(",", ".")));
    });

    box.appendChild(minus);
    box.appendChild(input);
    box.appendChild(plus);
    return box;
  }

  // ---------- Autre heure ----------
  function renderCustomTimes(row, cell) {
    cell.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "time-wrap";

    row.customTimes.forEach(function (ct, i) {
      var chip = document.createElement("span");
      chip.className = "time-chip";
      chip.textContent = R.formatNumber(ct.dose) + " à " + R.formatTimeFr(ct.time);
      var rm = btn("✕", "Retirer cette heure", "btn-chip-del");
      rm.addEventListener("click", function () {
        row.customTimes.splice(i, 1);
        renderCustomTimes(row, cell);
        syncRow(row);
      });
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });

    if (row.pendingCustom) {
      wrap.appendChild(buildPending(row, cell));
    } else {
      var add = btn("+ heure", "Ajouter une heure précise", "btn-mini");
      add.addEventListener("click", function () {
        row.pendingCustom = { time: "08:00", dose: 1 };
        renderCustomTimes(row, cell);
      });
      wrap.appendChild(add);
    }
    cell.appendChild(wrap);
  }

  function buildPending(row, cell) {
    var p = document.createElement("span");
    p.className = "pending";

    var stepper = buildStepper(
      function () { return row.pendingCustom.dose; },
      function (v) { row.pendingCustom.dose = v; }
    );
    var a = document.createElement("span");
    a.className = "pending-a";
    a.textContent = "à";

    var time = document.createElement("input");
    time.type = "time";
    time.className = "cell-input time-input";
    time.value = row.pendingCustom.time;
    time.step = 900; // pas de 15 min avec les flèches
    time.addEventListener("change", function () { row.pendingCustom.time = time.value || "08:00"; });

    var ok = btn("Valider", "Valider cette heure", "btn-ok");
    ok.addEventListener("click", function () {
      row.customTimes.push({ time: row.pendingCustom.time, dose: row.pendingCustom.dose });
      row.pendingCustom = null;
      renderCustomTimes(row, cell);
      syncRow(row);
    });
    var cancel = btn("✕", "Annuler", "btn-chip-del");
    cancel.addEventListener("click", function () {
      row.pendingCustom = null;
      renderCustomTimes(row, cell);
    });

    p.appendChild(stepper);
    p.appendChild(a);
    p.appendChild(time);
    p.appendChild(ok);
    p.appendChild(cancel);
    return p;
  }

  // ---------- Copier ----------
  function copyOutput() {
    var text = el.output.value;
    function done() {
      el.copyStatus.textContent = "Copié ✓";
      el.copyStatus.classList.add("show");
      setTimeout(function () { el.copyStatus.classList.remove("show"); }, 1800);
    }
    function fallback() {
      el.output.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      window.getSelection().removeAllRanges();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  // ---------- Utilitaires ----------
  function td(cls) {
    var c = document.createElement("td");
    c.className = cls;
    return c;
  }

  function btn(txt, title, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = txt;
    b.title = title;
    b.setAttribute("aria-label", title);
    return b;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
