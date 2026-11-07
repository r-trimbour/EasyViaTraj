# EasyViaTraj

Petit outil web pour **construire rapidement la liste des traitements d'un patient**
et la **coller dans la zone de texte libre de ViaTrajectoire** (orientation en
rééducation après fracture / prothèse et comorbidités).

**🔒 Confidentialité :** tout se passe dans le navigateur. Aucune donnée patient ou
ordonnance n'est envoyée sur un serveur, ni enregistrée. Le site est entièrement
statique.

## Utilisation

1. Cherchez un médicament (quelques lettres suffisent) et sélectionnez-le.
2. Sur sa ligne : activez **Matin / Midi / Soir** et/ou **Autre heure**, ajustez la
   dose avec **+ / −** ou en tapant directement.
3. Options : **si** une condition (ex. « EVA > 3 ») et **jusqu'au** une date.
4. Cliquez **📋 Copier**, puis collez dans ViaTrajectoire.

La zone de texte reste **librement modifiable** : vous pouvez ajouter des détails à la
main, ils sont conservés. Le bouton **Régénérer** reconstruit la liste à partir des
médicaments sélectionnés.

### Format du texte produit

```
Paracétamol, 1000 mg (cp) : 1, 0, 1 si EVA > 3 jusqu'au 15/11/2026
Énoxaparine (Lovenox), 4000 UI (injection) : 1 à 18h00
```

- Libellé : `Nom, dosage (forme)` — la forme galénique n'apparaît qu'une fois.
- Créneaux standard : 3 positions (matin, midi, soir), `0` si non pris.
- Heure précise : `<dose> à HHhMM`.
- Médicament absent de la base : saisie libre depuis la recherche ; le libellé reste modifiable dans le tableau.

## Lancer en local

Le site a besoin d'être servi (le chargement de la base passe par `fetch`) :

```bash
cd EasyViaTraj
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Déploiement (GitHub Pages)

Pousser sur GitHub, puis **Settings → Pages → Deploy from branch → `main` / root**.
Le site est servi tel quel (fichiers statiques).

## Base de médicaments

`data/drugs.json` : liste de départ curatée (post-fracture/prothèse + comorbidités
courantes). À terme, elle peut être remplacée/complétée par un export filtré de la
**BDPM** (Base de Données Publique des Médicaments, ANSM).

## Structure

```
index.html          page unique
css/style.css        styles (clair + sombre, responsive)
js/render.js         génération du texte (fonctions pures)
js/search.js         recherche / autocomplétion
js/app.js            logique d'interface
data/drugs.json      base de médicaments
PLAN.md              plan détaillé du projet
```

## Avertissement

Outil d'aide à la saisie. Il **ne remplace pas la prescription médicale** : vérifiez
toujours le texte avant de le coller.
