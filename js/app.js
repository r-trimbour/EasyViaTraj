/*
 * app.js — logique d'interface d'EasyViaTraj.
 * Dépend de render.js et search.js (chargés avant).
 */
(function () {
  "use strict";

  var R = window.EVT.render;
  var S = window.EVT.search;

  var state = {
    index: [],
    rows: [],
    outputLocked: false, // passe à true dès que l'utilisateur tape dans la zone de texte
    seq: 0
  };

  // --- Références DOM ---
  var el = {};
  function $(id) { return document.getElementById(id); }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    el.searchInput = $("searchInput");
    el.searchResults = $("searchResults");
    el.rows = $("rows");
    el.emptyHint = $("emptyHint");
    el.output = $("output");
    el.copyBtn = $("copyBtn");
    el.regenBtn = $("regenBtn");
    el.copyStatus = $("copyStatus");
    el.syncHint = $("syncHint");

    loadDrugs();

    el.searchInput.addEventListener("input", onSearchInput);
    el.searchInput.addEventListener("keydown", onSearchKeydown);
    document.addEventListener("click", function (e) {
      if (!el.searchResults.contains(e.target) && e.target !== el.searchInput) {
        closeResults();
      }
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
        state.index = S.buildIndex(data.drugs || []);
      })
      .catch(function () {
        el.searchResults.innerHTML =
          '<div class="result-error">Impossible de charger la base de médicaments.' +
          ' Ouvrez le site via GitHub Pages ou un serveur local (pas en fichier local).</div>';
        el.searchResults.hidden = false;
      });
  }

  // ---------- Recherche / autocomplétion ----------
  function onSearchInput() {
    var q = el.searchInput.value;
    if (!q.trim()) { closeResults(); return; }
    var results = S.search(state.index, q, 12);
    renderResults(results);
  }

  function onSearchKeydown(e) {
    if (e.key === "Enter") {
      var first = el.searchResults.querySelector(".result-item");
      if (first) first.click();
    } else if (e.key === "Escape") {
      closeResults();
    }
  }

  function renderResults(results) {
    el.searchResults.innerHTML = "";
    if (!results.length) {
      el.searchResults.innerHTML = '<div class="result-empty">Aucun résultat</div>';
      el.searchResults.hidden = false;
      return;
    }
    results.forEach(function (item) {
      var div = document.createElement("div");
      div.className = "result-item";
      div.innerHTML =
        '<span class="result-label">' + escapeHtml(item.label) + "</span>" +
        '<span class="result-class">' + escapeHtml(item.drug.class || "") + "</span>";
      div.addEventListener("click", function () {
        addRow(item.drug);
        el.searchInput.value = "";
        closeResults();
        el.searchInput.focus();
      });
      el.searchResults.appendChild(div);
    });
    el.searchResults.hidden = false;
  }

  function closeResults() {
    el.searchResults.hidden = true;
    el.searchResults.innerHTML = "";
  }

  // ---------- Modèle de ligne ----------
  function makeRow(drug) {
    return {
      id: "r" + (++state.seq),
      name: drug.name,
      strength: drug.strength || "",
      strengthUnit: drug.strengthUnit || "",
      form: drug.form || "",
      slots: {
        matin: { active: true, dose: 1 },
        midi: { active: true, dose: 1 },
        soir: { active: true, dose: 1 }
      },
      customTimes: [],
      pendingCustom: null,
      condition: null,
      until: null,
      lastRendered: ""
    };
  }

  function addRow(drug) {
    var row = makeRow(drug);
    row.lastRendered = R.renderLine(row);
    state.rows.push(row);
    el.rows.appendChild(buildRowEl(row));
    el.emptyHint.hidden = true;

    if (!state.outputLocked) {
      rebuildOutput();
    } else {
      appendLine(row.lastRendered);
    }
  }

  function removeRow(row) {
    var i = state.rows.indexOf(row);
    if (i !== -1) state.rows.splice(i, 1);
    var node = document.querySelector('[data-row="' + row.id + '"]');
    if (node) node.remove();
    if (!state.rows.length) el.emptyHint.hidden = false;

    if (!state.outputLocked) {
      rebuildOutput();
    } else {
      removeLine(row.lastRendered);
    }
  }

  // ---------- Synchronisation sortie ----------
  function rebuildOutput() {
    el.output.value = R.renderAll(state.rows);
    state.rows.forEach(function (r) { r.lastRendered = R.renderLine(r); });
    state.outputLocked = false;
    el.syncHint.hidden = true;
  }

  function appendLine(line) {
    el.output.value = el.output.value ? el.output.value + "\n" + line : line;
  }

  function removeLine(line) {
    var lines = el.output.value.split("\n");
    var idx = lines.indexOf(line);
    if (idx !== -1) {
      lines.splice(idx, 1);
      el.output.value = lines.join("\n");
    }
  }

  // Met à jour la ligne d'une row (en place si zone verrouillée).
  function syncRow(row) {
    var newLine = R.renderLine(row);
    if (!state.outputLocked) {
      rebuildOutput();
      return;
    }
    var lines = el.output.value.split("\n");
    var idx = lines.indexOf(row.lastRendered);
    if (idx !== -1) {
      lines[idx] = newLine;
      el.output.value = lines.join("\n");
      row.lastRendered = newLine;
    } else {
      // La ligne a été modifiée/supprimée à la main : on respecte l'édition manuelle.
      el.syncHint.hidden = false;
    }
  }

  function regenerate() {
    if (state.outputLocked && el.output.value.trim()) {
      if (!confirm("Régénérer la liste à partir des médicaments ? Les modifications manuelles de la zone de texte seront perdues.")) {
        return;
      }
    }
    rebuildOutput();
  }

  // ---------- Construction du DOM d'une ligne ----------
  function buildRowEl(row) {
    var card = document.createElement("div");
    card.className = "drug-card";
    card.setAttribute("data-row", row.id);

    // En-tête : nom + bouton supprimer
    var head = document.createElement("div");
    head.className = "drug-head";
    var title = document.createElement("div");
    title.className = "drug-title";
    title.textContent = R.renderLine ? headerText(row) : row.name;
    var del = iconBtn("✕", "Supprimer ce médicament", "btn-del");
    del.addEventListener("click", function () { removeRow(row); });
    head.appendChild(title);
    head.appendChild(del);
    card.appendChild(head);

    // Créneaux standard
    var slots = document.createElement("div");
    slots.className = "slots";
    ["matin", "midi", "soir"].forEach(function (key) {
      slots.appendChild(buildSlot(row, key));
    });
    card.appendChild(slots);

    // Heures précises
    var custom = document.createElement("div");
    custom.className = "custom-times";
    custom.setAttribute("data-custom", row.id);
    card.appendChild(custom);
    renderCustomTimes(row, custom);

    // Conditions optionnelles : si / jusqu'au
    card.appendChild(buildConditions(row));

    return card;
  }

  function headerText(row) {
    var t = row.name;
    if (row.strength) t += " " + row.strength + (row.strengthUnit ? " " + row.strengthUnit : "");
    return t;
  }

  function buildSlot(row, key) {
    var labels = { matin: "Matin", midi: "Midi", soir: "Soir" };
    var wrap = document.createElement("div");
    wrap.className = "slot";
    var slot = row.slots[key];

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "slot-toggle" + (slot.active ? " on" : "");
    toggle.textContent = labels[key];

    var stepper = buildStepper(
      function () { return slot.dose; },
      function (v) { slot.dose = v; },
      row,
      row.form
    );
    stepper.classList.toggle("hidden", !slot.active);

    toggle.addEventListener("click", function () {
      slot.active = !slot.active;
      toggle.classList.toggle("on", slot.active);
      stepper.classList.toggle("hidden", !slot.active);
      syncRow(row);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(stepper);
    return wrap;
  }

  // Un compteur de dose +/- avec saisie directe. getter/setter sur la donnée.
  function buildStepper(get, set, row, form) {
    var box = document.createElement("div");
    box.className = "stepper";

    var minus = iconBtn("−", "Diminuer", "btn-step");
    var input = document.createElement("input");
    input.type = "number";
    input.step = "0.5";
    input.min = "0";
    input.className = "dose-input";
    input.value = get();
    var unit = document.createElement("span");
    unit.className = "dose-unit";
    unit.textContent = form || "";
    var plus = iconBtn("+", "Augmenter", "btn-step");

    function commit(v) {
      if (v < 0) v = 0;
      set(v);
      input.value = v;
      syncRow(row);
    }
    minus.addEventListener("click", function () { commit(round(get() - 0.5)); });
    plus.addEventListener("click", function () { commit(round(get() + 0.5)); });
    input.addEventListener("change", function () {
      var v = parseFloat(input.value.replace(",", "."));
      commit(isNaN(v) ? 0 : v);
    });

    box.appendChild(minus);
    box.appendChild(input);
    if (form) box.appendChild(unit);
    box.appendChild(plus);
    return box;
  }

  function round(v) { return Math.round(v * 100) / 100; }

  // ---------- Heures précises ("Autre heure") ----------
  function renderCustomTimes(row, container) {
    container.innerHTML = "";

    row.customTimes.forEach(function (ct, i) {
      var chip = document.createElement("div");
      chip.className = "time-chip";
      chip.innerHTML = "<span>" +
        escapeHtml(formatDose(ct.dose, row.form)) + " à " + escapeHtml(R.formatTimeFr(ct.time)) + "</span>";
      var rm = iconBtn("✕", "Retirer cette heure", "btn-del-sm");
      rm.addEventListener("click", function () {
        row.customTimes.splice(i, 1);
        renderCustomTimes(row, container);
        syncRow(row);
      });
      chip.appendChild(rm);
      container.appendChild(chip);
    });

    if (row.pendingCustom) {
      container.appendChild(buildPendingCustom(row, container));
    } else {
      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "slot-toggle add-time";
      addBtn.textContent = "+ Autre heure";
      addBtn.addEventListener("click", function () {
        row.pendingCustom = { time: "08:00", dose: 1 };
        renderCustomTimes(row, container);
      });
      container.appendChild(addBtn);
    }
  }

  function buildPendingCustom(row, container) {
    var panel = document.createElement("div");
    panel.className = "pending-time";

    var timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.className = "time-input";
    timeInput.value = row.pendingCustom.time;
    timeInput.addEventListener("change", function () {
      row.pendingCustom.time = timeInput.value || "08:00";
    });

    var stepper = buildStepperPlain(
      function () { return row.pendingCustom.dose; },
      function (v) { row.pendingCustom.dose = v; },
      row.form
    );

    var valid = document.createElement("button");
    valid.type = "button";
    valid.className = "btn-valid";
    valid.textContent = "Valider";
    valid.addEventListener("click", function () {
      row.customTimes.push({ time: row.pendingCustom.time, dose: row.pendingCustom.dose });
      row.pendingCustom = null;
      renderCustomTimes(row, container);
      syncRow(row);
    });

    var cancel = iconBtn("✕", "Annuler", "btn-del-sm");
    cancel.addEventListener("click", function () {
      row.pendingCustom = null;
      renderCustomTimes(row, container);
    });

    var label = document.createElement("span");
    label.className = "pending-label";
    label.textContent = "à";

    panel.appendChild(stepper);
    panel.appendChild(label);
    panel.appendChild(timeInput);
    panel.appendChild(valid);
    panel.appendChild(cancel);
    return panel;
  }

  // Stepper sans row (pour l'éditeur en attente) — ne synchronise pas la sortie.
  function buildStepperPlain(get, set, form) {
    var box = document.createElement("div");
    box.className = "stepper";
    var minus = iconBtn("−", "Diminuer", "btn-step");
    var input = document.createElement("input");
    input.type = "number"; input.step = "0.5"; input.min = "0";
    input.className = "dose-input"; input.value = get();
    var unit = document.createElement("span");
    unit.className = "dose-unit"; unit.textContent = form || "";
    var plus = iconBtn("+", "Augmenter", "btn-step");
    function commit(v) { if (v < 0) v = 0; set(v); input.value = v; }
    minus.addEventListener("click", function () { commit(round(get() - 0.5)); });
    plus.addEventListener("click", function () { commit(round(get() + 0.5)); });
    input.addEventListener("change", function () {
      var v = parseFloat(input.value.replace(",", ".")); commit(isNaN(v) ? 0 : v);
    });
    box.appendChild(minus); box.appendChild(input);
    if (form) box.appendChild(unit); box.appendChild(plus);
    return box;
  }

  function formatDose(dose, form) {
    var d = Number.isInteger(dose) ? String(dose) : String(dose);
    return form ? d + " " + form : d;
  }

  // ---------- Conditions (si / jusqu'au) ----------
  function buildConditions(row) {
    var wrap = document.createElement("div");
    wrap.className = "conditions";

    // si ...
    var siWrap = document.createElement("label");
    siWrap.className = "cond";
    siWrap.innerHTML = '<span class="cond-key">si</span>';
    var siInput = document.createElement("input");
    siInput.type = "text";
    siInput.className = "cond-input";
    siInput.placeholder = "condition (ex : EVA > 3)";
    siInput.addEventListener("input", function () {
      row.condition = siInput.value.trim() || null;
      syncRow(row);
    });
    var siDefault = document.createElement("button");
    siDefault.type = "button";
    siDefault.className = "preset-btn";
    siDefault.textContent = "si EVA > 3";
    siDefault.title = "Insérer la condition par défaut";
    siDefault.addEventListener("click", function () {
      siInput.value = "EVA > 3";
      row.condition = "EVA > 3";
      syncRow(row);
    });
    siWrap.appendChild(siInput);
    siWrap.appendChild(siDefault);

    // jusqu'au ...
    var juWrap = document.createElement("label");
    juWrap.className = "cond";
    juWrap.innerHTML = '<span class="cond-key">jusqu\'au</span>';
    var juInput = document.createElement("input");
    juInput.type = "date";
    juInput.className = "cond-input date";
    juInput.addEventListener("input", function () {
      row.until = juInput.value || null;
      syncRow(row);
    });
    juWrap.appendChild(juInput);

    wrap.appendChild(siWrap);
    wrap.appendChild(juWrap);
    return wrap;
  }

  // ---------- Copier ----------
  function copyOutput() {
    var text = el.output.value;
    function done() {
      el.copyStatus.textContent = "Copié ✓";
      el.copyStatus.classList.add("show");
      setTimeout(function () { el.copyStatus.classList.remove("show"); }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      el.output.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      window.getSelection().removeAllRanges();
    }
  }

  // ---------- Utilitaires ----------
  function iconBtn(txt, title, cls) {
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
