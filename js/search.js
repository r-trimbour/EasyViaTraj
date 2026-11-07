/*
 * search.js — recherche de médicaments (insensible à la casse et aux accents).
 * window.EVT.search
 */
(function (global) {
  "use strict";

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // retire les accents
      .trim();
  }

  // Index chaque médicament avec un libellé affichable et une clé normalisée.
  function buildIndex(drugs) {
    return (drugs || []).map(function (d, i) {
      var label = d.name + (d.strength ? " " + d.strength + (d.strengthUnit ? " " + d.strengthUnit : "") : "");
      return {
        id: i,
        drug: d,
        label: label.replace(/\s+/g, " ").trim(),
        key: normalize(label + " " + (d.class || ""))
      };
    });
  }

  // Recherche tous-les-mots : chaque terme de la requête doit apparaître.
  function search(index, query, limit) {
    var q = normalize(query);
    if (!q) return [];
    var terms = q.split(/\s+/);
    var results = index.filter(function (item) {
      return terms.every(function (t) {
        return item.key.indexOf(t) !== -1;
      });
    });
    // tri : les correspondances en début de libellé d'abord
    results.sort(function (a, b) {
      var ai = a.key.indexOf(terms[0]);
      var bi = b.key.indexOf(terms[0]);
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label, "fr");
    });
    return limit ? results.slice(0, limit) : results;
  }

  global.EVT = global.EVT || {};
  global.EVT.search = {
    normalize: normalize,
    buildIndex: buildIndex,
    search: search
  };
})(typeof window !== "undefined" ? window : this);
