/*
 * render.js — génération du texte de l'ordonnance (fonctions pures, testables).
 * Attaché à window.EVT pour un usage simple sans modules (compatible file:// et GitHub Pages).
 *
 * Format verrouillé (voir PLAN.md §9) :
 *   <Nom> <dosage><unité> : <slots...> [si <condition>] [jusqu'au JJ/MM/AAAA]
 *   - Slots standard : toujours 3 positions (matin, midi, soir), inactif = "0", actif = "<n> <galénique>"
 *   - Heure précise : "<n> <galénique> à HHhMM"
 *   - Décimales avec un point (0.5) pour ne pas se confondre avec la virgule séparatrice.
 */
(function (global) {
  "use strict";

  var SLOT_ORDER = ["matin", "midi", "soir"];

  // 0.5 -> "0.5", 2 -> "2"  (point décimal volontaire)
  function formatNumber(n) {
    if (n === null || n === undefined || n === "") return "0";
    var num = typeof n === "number" ? n : parseFloat(String(n).replace(",", "."));
    if (isNaN(num)) return String(n);
    return Number.isInteger(num) ? String(num) : String(num);
  }

  // Un token de dose actif : "1 cp", "0.5 gélule", "4000 UI"...
  function doseToken(dose, form) {
    var d = formatNumber(dose);
    return form ? d + " " + form : d;
  }

  // "2026-11-15" (input date) -> "15/11/2026"
  function formatDateFr(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  // "08:00" ou "0800" ou "8" -> "08h00"
  function formatTimeFr(t) {
    if (!t) return "";
    var s = String(t).replace("h", ":");
    var m = /^(\d{1,2}):?(\d{0,2})$/.exec(s.trim());
    if (!m) return String(t);
    var hh = ("0" + m[1]).slice(-2);
    var mm = (m[2] ? ("0" + m[2]).slice(-2) : "00");
    return hh + "h" + mm;
  }

  // En-tête : "Paracétamol 1000 mg"
  function headerPart(row) {
    var parts = [row.name];
    if (row.strength) {
      parts.push(row.strength + (row.strengthUnit ? " " + row.strengthUnit : ""));
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  // Les tokens de dose (triplet standard puis heures précises)
  function doseTokens(row) {
    var tokens = [];
    var slots = row.slots || {};
    var anyStandard = SLOT_ORDER.some(function (k) {
      return slots[k] && slots[k].active;
    });
    if (anyStandard) {
      SLOT_ORDER.forEach(function (k) {
        var s = slots[k];
        if (s && s.active) tokens.push(doseToken(s.dose, row.form));
        else tokens.push("0");
      });
    }
    (row.customTimes || []).forEach(function (ct) {
      tokens.push(doseToken(ct.dose, row.form) + " à " + formatTimeFr(ct.time));
    });
    return tokens;
  }

  // Une ligne complète pour un médicament.
  function renderLine(row) {
    var line = headerPart(row);
    var tokens = doseTokens(row);
    if (tokens.length) line += " : " + tokens.join(", ");
    if (row.condition && String(row.condition).trim()) {
      line += " si " + String(row.condition).trim();
    }
    if (row.until) {
      line += " jusqu'au " + formatDateFr(row.until);
    }
    return line;
  }

  function renderAll(rows) {
    return (rows || []).map(renderLine).join("\n");
  }

  global.EVT = global.EVT || {};
  global.EVT.render = {
    renderLine: renderLine,
    renderAll: renderAll,
    formatDateFr: formatDateFr,
    formatTimeFr: formatTimeFr,
    SLOT_ORDER: SLOT_ORDER
  };

  // Export CommonJS (pour tests Node éventuels)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.EVT.render;
  }
})(typeof window !== "undefined" ? window : this);
