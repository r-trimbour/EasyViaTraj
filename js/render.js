/*
 * render.js — génération du texte de l'ordonnance (fonctions pures, testables).
 * window.EVT.render
 *
 * Format (voir PLAN.md §9) :
 *   <libellé> : <doses...> [si <condition>] [jusqu'au JJ/MM/AAAA]
 *   - libellé = "Nom, dosage unité (forme galénique)"  → la galénique figure UNE SEULE fois.
 *   - doses standard : 3 positions (matin, midi, soir), nombres bruts, inactif = "0".
 *   - heure précise : "<dose> à HHhMM" (nombre brut).
 *   - décimales avec un point (0.5) pour ne pas se confondre avec la virgule séparatrice.
 */
(function (global) {
  "use strict";

  var SLOT_ORDER = ["matin", "midi", "soir"];

  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "0";
    var num = typeof n === "number" ? n : parseFloat(String(n).replace(",", "."));
    if (isNaN(num)) return String(n);
    return String(num);
  }

  // "2026-11-15" -> "15/11/2026"
  function formatDateFr(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  // "08:00" | "0800" | "8" -> "08h00"
  function formatTimeFr(t) {
    if (!t) return "";
    var s = String(t).replace("h", ":");
    var m = /^(\d{1,2}):?(\d{0,2})$/.exec(s.trim());
    if (!m) return String(t);
    var hh = ("0" + m[1]).slice(-2);
    var mm = (m[2] ? ("0" + m[2]).slice(-2) : "00");
    return hh + "h" + mm;
  }

  // Construit le libellé "Nom, 5 mg (cp)" à partir d'une entrée de la base.
  function buildLabel(drug) {
    var label = drug.name || "";
    if (drug.strength) {
      label += ", " + drug.strength + (drug.strengthUnit ? " " + drug.strengthUnit : "");
    }
    if (drug.form) label += " (" + drug.form + ")";
    return label.replace(/\s+/g, " ").trim();
  }

  function doseTokens(row) {
    var tokens = [];
    var slots = row.slots || {};
    var anyStandard = SLOT_ORDER.some(function (k) {
      return slots[k] && slots[k].active;
    });
    if (anyStandard) {
      SLOT_ORDER.forEach(function (k) {
        var s = slots[k];
        tokens.push(s && s.active ? formatNumber(s.dose) : "0");
      });
    }
    (row.customTimes || []).forEach(function (ct) {
      tokens.push(formatNumber(ct.dose) + " à " + formatTimeFr(ct.time));
    });
    return tokens;
  }

  function renderLine(row) {
    var line = (row.label || "").trim();
    var tokens = doseTokens(row);
    if (tokens.length) line += " : " + tokens.join(", ");
    if (row.condition && String(row.condition).trim()) {
      line += " si " + String(row.condition).trim();
    }
    if (row.until) line += " jusqu'au " + formatDateFr(row.until);
    return line;
  }

  function renderAll(rows) {
    return (rows || []).map(renderLine).join("\n");
  }

  global.EVT = global.EVT || {};
  global.EVT.render = {
    renderLine: renderLine,
    renderAll: renderAll,
    buildLabel: buildLabel,
    formatNumber: formatNumber,
    formatDateFr: formatDateFr,
    formatTimeFr: formatTimeFr,
    SLOT_ORDER: SLOT_ORDER
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.EVT.render;
  }
})(typeof window !== "undefined" ? window : this);
