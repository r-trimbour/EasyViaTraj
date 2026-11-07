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
      var aliases = d.aliases || [];
      return {
        id: i,
        drug: d,
        label: label.replace(/\s+/g, " ").trim(),
        labelKey: normalize(label),
        aliases: aliases,
        key: normalize(label + " " + (d.class || "") + " " + aliases.join(" "))
      };
    });
  }

  // Si la requête ne correspond pas au libellé, renvoie l'alias (sel, nom commercial) qui correspond.
  function matchedAlias(item, query) {
    var terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.every(function (t) { return item.labelKey.indexOf(t) !== -1; })) return null;
    var best = null;
    item.aliases.forEach(function (a) {
      var ak = normalize(a);
      if (!best && terms.some(function (t) { return t.length > 2 && ak.indexOf(t) !== -1; })) best = a;
    });
    return best;
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
    search: search,
    matchedAlias: matchedAlias
  };
})(typeof window !== "undefined" ? window : this);
