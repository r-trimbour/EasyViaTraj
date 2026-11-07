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
      .replace(/(\d)\s(?=\d{3}\b)/g, "$1") // « 4 000 » = « 4000 »
      .trim();
  }

  // Formes courantes d'abord dans les résultats
  var FORM_RANK = ["cp", "gélule", "injection", "sachet", "cp LP", "gélule LP",
    "cp effervescent", "cp orodispersible", "solution buvable", "ampoule"];
  function formRank(d) {
    var i = FORM_RANK.indexOf(d.form || "");
    return i === -1 ? FORM_RANK.length : i;
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
    // tri : correspondance dans le nom avant les alias, puis formes courantes, puis dosage croissant
    results.sort(function (a, b) {
      var ai = a.labelKey.indexOf(terms[0]) === -1 ? 1 : 0;
      var bi = b.labelKey.indexOf(terms[0]) === -1 ? 1 : 0;
      if (ai !== bi) return ai - bi;
      var ap = a.key.indexOf(terms[0]), bp = b.key.indexOf(terms[0]);
      if (ai === 0 && ap !== bp) return ap - bp;
      var ac = (a.drug.name.match(/ \/ /g) || []).length, bc = (b.drug.name.match(/ \/ /g) || []).length;
      if (ac !== bc) return ac - bc; // molécule seule avant les associations
      var an = a.drug.name.localeCompare(b.drug.name, "fr");
      if (an !== 0) return an;
      var fr = formRank(a.drug) - formRank(b.drug);
      if (fr !== 0) return fr;
      return a.label.localeCompare(b.label, "fr", { numeric: true });
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
