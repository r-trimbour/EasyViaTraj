#!/usr/bin/env python3
"""
Construit data/drugs.json à partir de la BDPM (Base de Données Publique des Médicaments, ANSM).

Téléchargement des fichiers sources (open data) :
  curl -sSLO https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt
  curl -sSLO https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_COMPO_bdpm.txt

Usage :
  python3 -I data/scripts/build_drugs.py CIS_bdpm.txt CIS_COMPO_bdpm.txt data/drugs.json

Règles :
  - médicaments à « Autorisation active » ET « Commercialisée », hors homéopathie ;
  - nom = DCI (substance active, fraction thérapeutique si disponible), dosage tiré de la
    dénomination, forme galénique abrégée (cp, gélule, injection, sachet…) ;
  - les génériques des différents laboratoires sont fusionnés en une seule ligne ;
  - noms commerciaux (princeps) et noms de sels (chlorhydrate de…) gardés comme alias de recherche.
"""
import json
import re
import sys
import unicodedata
from collections import OrderedDict

ENC = "cp1252"  # fichiers BDPM en Windows-1252 / ISO-8859-1


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def read_tsv(path):
    with open(path, encoding=ENC, errors="replace") as f:
        for line in f:
            yield [c.strip() for c in line.rstrip("\r\n").split("\t")]


def nice_case(s):
    """'ACIDE ACÉTYLSALICYLIQUE' -> 'Acide acétylsalicylique' ; garde 'D3', 'B12'."""
    words = []
    for w in s.split():
        words.append(w if re.search(r"\d", w) else w.lower())
    out = " ".join(words)
    return out[:1].upper() + out[1:]


SALTS = (r"(?:di|mono|hémi|hemi)?(?:chlorhydrate|bromhydrate|sulfate|hydrogénosulfate|maléate|fumarate|"
         r"tartrate|bitartrate|bésilate|mésilate|citrate|phosphate|acétate|succinate|oxalate|lactate|"
         r"gluconate|chlorure|nitrate|tosilate|bésylate|mésylate|valérate|propionate|dipropionate)")
SALT_PREFIX = re.compile(r"^" + SALTS + r"\s+(?:de\s+|d['’]\s*)(.+)$", re.I)
SALT_PAREN = re.compile(r"^(.+?)\s*\(" + SALTS + r"\s+(?:de|d['’])\s*\)$", re.I)


def strip_salt(name):
    """'Chlorhydrate de néfopam' / 'Néfopam (chlorhydrate de)' -> 'Néfopam' (None si pas de sel)."""
    for rx, grp in ((SALT_PREFIX, 1), (SALT_PAREN, 1)):
        m = rx.match(name)
        if m:
            base = m.group(grp).strip()
            return base[:1].upper() + base[1:]
    return None


def brand_case(s):
    return " ".join(w if re.search(r"\d", w) else w.capitalize() for w in s.split())


def short_form(form):
    f = form.lower()
    lp = "libération prolongée" in f or "libération modifiée" in f
    if f.startswith("comprimé"):
        if lp:
            return "cp LP"
        for k in ("effervescent", "orodispersible", "à sucer", "gastro-résistant", "dispersible"):
            if k in f:
                return "cp " + k
        return "cp"
    if f.startswith("gélule"):
        if lp:
            return "gélule LP"
        if "gastro-résistant" in f:
            return "gélule gastro-résistante"
        return "gélule"
    if "injectable" in f or "pour perfusion" in f:
        return "injection"
    if "sachet" in f:
        return "sachet"
    if "transdermique" in f:
        return "patch"
    if "inhalation" in f:
        return "inhalation"
    if f.startswith("capsule"):
        return "capsule"
    if f.startswith("suppositoire"):
        return "suppositoire"
    if f.startswith("collyre"):
        return "collyre"
    if f.startswith("lyophilisat oral"):
        return "lyophilisat"
    return form.strip()


DOSE_RE = re.compile(r"^(.*?)\s+(\d.*)$")


def split_denomination(denom):
    """'ELIQUIS 2,5 mg, comprimé' -> ('ELIQUIS', '2,5 mg')
    La forme suit « , » (virgule + espace) ; les virgules décimales (2,5) n'ont pas d'espace."""
    left = re.split(r",\s", denom)[0].strip()
    m = DOSE_RE.match(left)
    if not m:
        return left, ""
    dose = re.sub(r"\s+", " ", m.group(2)).strip()
    dose = re.sub(r"\bmicrogrammes?\b", "µg", dose, flags=re.I)
    dose = re.sub(r"\bmilligrammes?\b", "mg", dose, flags=re.I)
    return m.group(1).strip(), dose


def dose_key(dose):
    """Clé de regroupement : '4 000 UI (40 mg) dans 0,4 ml' == '4000 UI (40 mg)/0,4 mL'."""
    k = norm(dose)
    k = re.sub(r"(?<=\d) (?=\d{3}\b)", "", k)   # séparateur de milliers
    k = re.sub(r"\s*/\s*", "/", k)
    k = re.sub(r"\s+dans\s+", "/", k)
    k = k.replace("unites", "u").replace("ui", "u")
    k = re.sub(r",(\d*?)0+(?=\D|$)", lambda m: "," + m.group(1) if m.group(1) else "", k)  # 2,50 -> 2,5
    return k


def main(cis_path, compo_path, out_path):
    # 1) Produits commercialisés, hors homéopathie
    products = {}
    for c in read_tsv(cis_path):
        if len(c) < 7:
            continue
        cis, denom, form, _voies, statut, proc, etat = c[:7]
        if not statut.startswith("Autorisation active"):
            continue
        if etat != "Commercialisée":
            continue
        if "homéo" in proc.lower():
            continue
        products[cis] = (denom, form)

    # 2) Substances : fraction thérapeutique (FT) prioritaire sur la substance active (SA)
    compo = {}
    for c in read_tsv(compo_path):
        if len(c) < 8 or c[0] not in products:
            continue
        cis, elem, _code, subst, _dose, _ref, nature, liaison = c[:8]
        groups = compo.setdefault(cis, OrderedDict())
        g = groups.setdefault((elem, liaison), {"SA": None, "FT": None})
        if nature in ("SA", "FT") and g[nature] is None:
            g[nature] = subst

    entries = OrderedDict()
    for cis, (denom, form) in products.items():
        groups = compo.get(cis)
        if not groups:
            continue
        first_elem = next(iter(groups))[0]
        names, salts = [], []
        for (elem, _l), g in groups.items():
            if elem != first_elem:
                continue
            base = g["FT"] or g["SA"]
            if not base:
                continue
            nb = nice_case(base)
            stripped = strip_salt(nb)
            if stripped:
                salts.append(nb)  # le nom du sel reste trouvable en recherche
                nb = stripped
            if nb not in names:
                names.append(nb)
            if g["FT"] and g["SA"] and norm(g["SA"]) != norm(g["FT"]):
                salts.append(nice_case(g["SA"]))
        if not names:
            continue
        dci = " / ".join(names)
        brand, dose = split_denomination(denom)
        fshort = short_form(form)
        key = (norm(dci), dose_key(dose), fshort)

        e = entries.get(key)
        if e is None:
            e = {"name": dci, "strength": dose, "form": fshort, "aliases": []}
            entries[key] = e
        first_word = norm(dci).split(" ")[0]
        b = brand_case(brand)
        if brand and not norm(brand).startswith(first_word) and b not in e["aliases"]:
            e["aliases"].append(b)  # nom commercial (pas un générique « DCI + labo »)
        for s in salts:
            if s not in e["aliases"]:
                e["aliases"].append(s)

    drugs = []
    for e in entries.values():
        e["aliases"] = e["aliases"][:8]
        if not e["aliases"]:
            del e["aliases"]
        drugs.append(e)
    drugs.sort(key=lambda d: (norm(d["name"]), norm(d["strength"]), d["form"]))

    note = ("Généré depuis la BDPM (ANSM) par data/scripts/build_drugs.py — médicaments à autorisation "
            "active et commercialisés, hors homéopathie. Champs : name (DCI), strength, form "
            "(forme galénique abrégée), aliases (noms commerciaux, sels — utilisés pour la recherche).")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write('{\n  "note": %s,\n  "drugs": [\n' % json.dumps(note, ensure_ascii=False))
        f.write(",\n".join("    " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in drugs))
        f.write("\n  ]\n}\n")
    print("%d produits commercialisés -> %d lignes uniques" % (len(products), len(drugs)))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
