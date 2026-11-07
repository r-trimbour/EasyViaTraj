/*
 * app.js — logique d'interface d'EasyViaTraj (tableau compact).
 * Dépend de render.js et search.js (chargés avant).
 */
(function () {
  "use strict";

  var R = window.EVT.render;
  var S = window.EVT.search;

  // Médicaments fréquents (panneau de droite) : [nom, dosage] tels que dans data/drugs.json
  var FAVORITES = [
    ["Paracétamol", "1000"],
    ["Néfopam (Acupan)", "20"],
    ["Énoxaparine (Lovenox)", "4000"],
    ["Apixaban (Eliquis)", "2.5"],
    ["Apixaban (Eliquis)", "5"],
    ["Insuline glargine (Lantus)", "100"],
    ["Insuline asparte (Novorapid)", "100"],
    ["Atorvastatine", "20"],
    ["Rosuvastatine", "10"]
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
    fetch("data/drugs.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.drugs = data.drugs || [];
        state.index = S.buildIndex(state.drugs);
        renderFavorites();
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
    FAVORITES.forEach(function (f) {
      var drug = state.drugs.find(function (d) { return d.name === f[0] && d.strength === f[1]; });
      if (!drug) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "fav-btn";
      b.textContent = R.buildLabel(drug);
      b.title = "Ajouter " + R.buildLabel(drug);
      b.addEventListener("click", function () { addRow(R.buildLabel(drug)); });
      el.favList.appendChild(b);
    });
  }

  // ---------- Recherche ----------
  function onSearchInput() {
    var q = el.searchInput.value;
    if (!q.trim()) { closeResults(); return; }
    renderResults(S.search(state.index, q, 15), q.trim());
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
        '<span class="result-class">' + escapeHtml(item.drug.class || "") + "</span>";
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
  function makeRow(label) {
    return {
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
  }

  function addRow(label) {
    var row = makeRow(label);
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
