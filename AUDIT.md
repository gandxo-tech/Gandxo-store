# Audit complet — Gandxo Store

**Date :** 19 novembre 2026
**Périmètre :** l'intégralité du dépôt (`index.html`, `app.html`, `about.html`, `login.html`,
`admin.html`, `app.js`, `store.js`, `auth.js`, `admin.js`, `analytics.js`, `setup-admin.js`,
`blog.js`, `sw.js`, `style.css`, `admin.css`, `responsive.css`, `manifest.json`, `README.md`,
icônes et `og-image.png`).
**Méthode :** lecture intégrale du code, vérification de syntaxe de chaque module JS
(`node --check`, 0 erreur), calcul des contrastes WCAG, contrôle des dimensions d'images,
vérification des affirmations du README contre le code réel.

> **Statut (mise à jour du 19/11/2026).** Ce rapport décrit l'état **avant**
> correctifs. Ont depuis été corrigés : C1 (`firestore.rules` versionné), C2
> (compteur encadré par les règles), C3 (`.gitignore` + `setup-admin.js`
> déplacé hors racine web), D1 (suppression en cascade), D3 (agrégations au
> lieu de scans complets), D5/D6 (tri côté client, dates locales), B1-B9,
> A11Y-1/2/4, SEO-1/2/3 et la désynchronisation du README. Restent ouverts :
> C4 (App Check), C5 (en-têtes de sécurité), D2, D4, la découpe `ui.js` /
> `firebase.js`, et l'outillage (lint/CI).

---

## 1. Synthèse exécutive

Le site est propre, lisible et bien commenté — pour un projet statique « une personne »,
la qualité du code est au-dessus de la moyenne : échappement HTML systématique,
chemins de repli explicites (pas de faux chiffres), séparation UI / données / analytics.

Mais **le modèle de sécurité repose entièrement sur un fichier `firestore.rules` qui n'est
pas dans le dépôt**, alors que le projet Firebase est **partagé avec une autre application
(SIS)**. C'est le point n°1 à traiter : sans ces règles, rien ne garantit ce que le README
affirme (lecture publique des seules apps publiées, écriture réservée à l'admin, anti-spam
des téléchargements), et le pire scénario touche aussi les données de SIS.

| Domaine | Note | Commentaire court |
|---|---|---|
| Sécurité / règles Firestore | 🔴 3/10 | Règles absentes du dépôt, compteur public sur `store_apps`, `.gitignore` manquant |
| Intégrité des données | 🟠 5/10 | Suppressions partielles, deux sources de vérité pour les téléchargements |
| Bugs fonctionnels | 🟠 6/10 | Erreurs silencieuses en admin, graphique incomplet |
| Performance / coûts | 🟠 5/10 | 4 scans complets de collection par rafraîchissement du dashboard |
| PWA / offline | 🟠 5/10 | Cache-first figé en `v1` : versions périmées servies indéfiniment |
| Accessibilité | 🟠 6/10 | Bonne base, mais 1 contraste non conforme AA et modales non accessibles |
| SEO / métadonnées | 🟡 5/10 | `og:image` relatif inexploitable par les scrapers |
| Qualité / outillage | 🟡 6/10 | Aucun lint, test, CI, `.gitignore` ni licence |

---

## 2. Sécurité

### 🔴 C1 — `firestore.rules` est absent du dépôt (critique)

Le README affirme à trois endroits que `firestore.rules` « est à la racine » et qu'il faut
« le republier ». Le fichier **n'existe pas** dans le dépôt.

Conséquences :

- impossible de vérifier, versionner et relire la seule barrière de sécurité du projet ;
- toute la protection de `store_apps`, `store_downloads` et du sous-collecteur `versions`
  est invisible et non auditée ;
- rien ne prouve non plus que les collections **`store_`** sont réellement cloisonnées :
  si les règles du projet `chat-anonyme` autorisent globalement la lecture/écriture, c'est
  aussi **les données de SIS** qui sont exposées, puisque le projet Firebase est partagé.

**Action :** récupérer les règles déployées depuis la console (Firestore > Règles),
les committer, et vérifier ligne à ligne. Un modèle de départ est proposé en annexe.

### 🔴 C2 — Le compteur de téléchargements impose une écriture publique sur `store_apps` (critique)

`analytics.js:46` : `updateDoc(appRef, { totalDownloads: increment(1) })`, appelé depuis
la page publique `app.html`, sans authentification.

Pour que cela fonctionne, les règles doivent autoriser un visiteur **non authentifié** à
mettre à jour un document de `store_apps` — donc potentiellement à en changer n'importe
quel champ (nom, `downloadUrl`, `status`, `fullDesc`…). C'est un vecteur de défiguration
et de distribution d'un exécutable non voulu. Les règles (absentes, cf. C1) sont donc soit
trop permissives, soit — si elles limitent les champs — **elles ne permettent plus le
compteur** et `recordDownload` échoue silencieusement (le `catch` de `store.js:265` avale
l'erreur : le compteur ne bouge jamais, sans que personne ne le voie).

**Action (au choix) :**

1. supprimer `increment(1)` et calculer `totalDownloads` par agrégation
   (`count()` / Cloud Function) — le plus propre ;
2. ou déplacer l'incrément dans une Cloud Function déclenchée par la création d'un
   `store_downloads`, et n'autoriser les écritures visiteur que sur `store_downloads`.

Ne jamais autoriser `update` sur `store_apps` pour `request.auth == null`.

### 🔴 C3 — Pas de `.gitignore`, et `setup-admin.js` est servi depuis la racine web (élevé)

- Aucun `.gitignore` : `node_modules/` et surtout **`serviceAccountKey.json`** (référencé
  par `setup-admin.js`, et qui donne les droits admin complets sur le projet Firebase
  partagé) peuvent être commités par accident. C'est la fuite la plus grave possible ici.
- `setup-admin.js` est déposé à la racine publique du site : il est téléchargeable par
  n'importe qui (`/setup-admin.js`). Il ne contient pas de secret, mais il documente le
  mécanisme d'élévation de privilèges et incite à poser la clé de service à côté de lui.

**Action :** ajouter un `.gitignore` (`node_modules/`, `serviceAccountKey.json`, `.env*`),
et déplacer `setup-admin.js` hors du dossier publié (ex. `tools/setup-admin.js`) ou hors
dépôt.

### 🟠 C4 — Clé API Firebase publique sans restriction (moyen)

`app.js:21` expose la clé API. C'est normal et documenté correctement, mais sans
**App Check** ni restriction HTTP referrer, n'importe qui peut consommer le quota
Firestore/Auth du projet partagé.

**Action :** Google Cloud Console > API Keys > restreindre aux référents du site ;
activer App Check (reCAPTCHA v3) sur Firestore.

### 🟠 C5 — Aucun en-tête de sécurité (moyen)

Pas de `vercel.json` / `netlify.toml` / `_headers` : ni CSP, ni `X-Content-Type-Options`,
ni `X-Frame-Options`/`frame-ancestors`. Le site est donc encadrable (clickjacking sur la
page de connexion) et sans défense en profondeur en cas de faille d'injection.
`admin.html` contient de plus un gestionnaire inline (`onclick=`), incompatible avec une
CSP stricte.

### 🟡 Divers (faible)

- `login.html` : une connexion réussie avec un compte non-admin **laisse la session
  ouverte** (contrairement à `auth.js` `requireAdmin`, qui déconnecte). Incohérence.
- `downloadUrl` non validé en schéma : un `javascript:` saisi dans l'admin serait exécuté
  au clic (`store.js:269`). Impact limité (auto-XSS admin) mais trivial à corriger.
- Aucune réinitialisation de mot de passe : un seul compte admin, sans filet. À prévoir.

---

## 3. Données et intégrité

### 🟠 D1 — Suppression d'une application incomplète

`admin.js:333` `deleteApp` supprime le document `store_apps/{id}` mais **pas** :

- le sous-collecteur `store_apps/{id}/versions` → documents orphelins, invisibles, jamais
  purgés ;
- les documents `store_downloads` associés → ils continuent d'alimenter `stats.total`,
  `stats.countByApp` et la « meilleure app », alors que l'application n'existe plus.
  Le dashboard affiche donc un total supérieur à la somme des lignes visibles.

### 🟠 D2 — Deux sources de vérité pour les téléchargements

La fiche application affiche `app.totalDownloads` (`store.js:239`, champ incrémenté),
le dashboard recompte la collection `store_downloads` (`analytics.js:86`). Les deux
peuvent diverger (écriture partielle, règles, corruption manuelle) sans que personne
ne le sache. Choisir **une** source et dériver l'autre.

### 🟠 D3 — Croissance non bornée + 4 scans complets par affichage

`getDashboardStats` lance `Promise.all` de **quatre** `getDocs` sur `store_downloads`
(total, jour, semaine, mois) : la requête « total » lit **toute** la collection, à chaque
chargement du dashboard et à chaque `toggleStatus`/`saveApp`. Chaque bouton de plage
déclenche en plus un scan complet (`getTimeSeries`).

À ~10 000 téléchargements : 10 000 lectures facturées par rafraîchissement, réponse
volumineuse, dashboard de plus en plus lent. À ~50 000, risque de blocage navigateur.

**Action :** compteurs agrégés (doc `store_stats/global` maintenu par Cloud Function, ou
`count()`), et lecture incrémentale pour le graphique.

### 🟠 D4 — Les statistiques ne sont pas « réelles » au sens du README

Le README et les commentaires (`analytics.js:1-5`) affirment que « les statistiques sont
des téléchargements réels ». En réalité, **c'est le client qui déclare le téléchargement** :
un `POST` sur l'API REST Firestore suffit à gonfler les compteurs. Les règles peuvent au
mieux vérifier que l'app existe et est publiée (ce que décrit le README), pas qu'un
téléchargement a eu lieu. C'est acceptable pour un store personnel, mais il faut le dire
honnêtement dans la doc plutôt que de promettre l'inverse.

### 🟡 D5 — `orderBy` masque silencieusement les documents incomplets

`admin.js:283` (`orderBy("updatedAt","desc")`) et `admin.js:526` / `store.js:179`
(`orderBy("date","desc")`) : un document **sans** ce champ n'apparaît **jamais** dans la
liste, sans erreur. Un ancien enregistrement (ou une écriture partielle) devient
invisible au lieu de remonter. Prévoir un champ de tri garanti ou un repli sans `orderBy`.

### 🟡 D6 — Décalage de fuseau sur les dates de version

`admin.js:566` : `new Date(form.date.value)` sur un `<input type="date">` produit un
instant à **minuit UTC**. Affiché avec `toLocaleDateString("fr-FR")` dans un fuseau à
l'ouest de Greenwich, la date recule d'un jour. Construire la date en local
(`new Date(y, m-1, d)`) ou stocker `"AAAA-MM-JJ"` en chaîne.

---

## 4. Bugs fonctionnels

| # | Sévérité | Fichier | Problème |
|---|---|---|---|
| B1 | 🟠 | `admin.js:324, 333` | `toggleStatus` et `deleteApp` n'ont **aucun `try/catch`** : permission refusée, hors-ligne ou règle Firestore stricte ⇒ promesse rejetée non gérée, **aucun message**, l'admin croit que l'action a réussi. |
| B2 | 🟠 | `admin.js:150` | `showAppStatsDetail` : idem (`getAppStats` non protégé) ; un échec laisse « Chargement… » à l'écran pour toujours. |
| B3 | 🟠 | `admin.js:213` | Graphique : **aucune graduation ni valeur sur l'axe Y**, aucun libellé de valeur, aucun tooltip. On voit une courbe sans pouvoir lire un chiffre. Aucun gestionnaire de `resize` non plus ⇒ canvas étiré/flou après rotation ou redimensionnement. |
| B4 | 🟡 | `analytics.js:127` | Plage « 1 an » : `bucketCount = 12` mais un écart de 12 mois donne `bucketIdx = -1` ⇒ **le mois le plus ancien de la période est silencieusement jeté**. |
| B5 | 🟡 | `style.css:41` + `index.html:40` | `scroll-behavior: smooth` avec un header `position: sticky` et **aucun `scroll-margin-top`** : les liens `#apps` / `#categories` amènent le titre **sous** le header. |
| B6 | 🟡 | `responsive.css` + `app.js:113` | Sur mobile, le menu reste **ouvert** après un clic sur un lien. Sur l'accueil, une recherche met la grille à jour **sans défiler** jusqu'aux résultats : l'utilisateur voit un écran inchangé. |
| B7 | 🟡 | `admin.js:415-465` | Formulaire lu via `form.name`, `form.icon`, `form.status`… `form.name` fonctionne uniquement parce que `HTMLFormElement` est `[LegacyOverrideBuiltIns]` et qu'un `<input name="name">` **écrase** la propriété native (DOM clobbering). Ajouter un attribut `name` au `<form>` ou renommer le champ casse tout. Utiliser `form.elements.name`. |
| B8 | 🟡 | `app.js:189` | `cloudinaryOptimize` insère `f_auto,q_auto,w_…` après `/upload/` sans vérifier qu'une transformation existe déjà : une URL déjà transformée devient invalide (400 Cloudinary). |
| B9 | 🟡 | `sw.js:9` | Voir section PWA. |
| B10 | 🟡 | `blog.js` | Fichier **vide** (2 octets), importé nulle part. Code mort. |
| B11 | 🟡 | `app.js:44` | `VAPID_KEY` exporté et **jamais utilisé** (le README le reconnaît) : config morte dans le bundle public. |
| B12 | 🟡 | `store.js:269` | `window.location.href = app.downloadUrl` : scheme non vérifié (cf. C-divers). |

Points vérifiés et **conformes** (pas de bug, à ne pas « corriger ») :

- échappement HTML systématique de toutes les données Firestore (`escapeHTML`) — pas de
  XSS stockée trouvée, y compris dans les attributs `data-*` et les URLs d'images ;
- `loadChart` / `renderGrid` gèrent explicitement les états vides, sans donnée inventée ;
- les modules JS sont syntaxiquement valides (`node --check` : 0 erreur sur 6 modules) ;
- `initAppPage` bloque bien les documents non publiés (`status !== "published"`).

---

## 5. Performance et coûts

1. **SDK Firebase sur toutes les pages** — `about.html` et `login.html` importent `app.js`,
   qui initialise et importe Firestore + Auth (~250 Ko compressés de JS) uniquement pour
   afficher le header et le footer. `about.html` n'a besoin d'aucune donnée.
   → séparer `ui.js` (header/footer/utilitaires) de `firebase.js` (init + services).
2. **4 scans complets** par chargement du dashboard (cf. D3) + 1 par changement de plage.
3. **Polices** : 3 familles × 3 graisses depuis Google Fonts, CSS bloquant le rendu.
   Self-hosting + 2 graisses suffiraient largement (gain ~200-400 ms sur mobile).
4. **Images** : aucune `width`/`height` sur les `<img>` générées ⇒ décalage de mise en page
   (CLS). Les icônes ont des dimensions fixes en CSS, l'ajout d'attributs est trivial.
5. **Aucune stratégie de cache HTTP** (pas de configuration d'hébergement) : tout le
   statique est revalidé à chaque visite alors qu'il est hashable/versionnable.

---

## 6. PWA / hors-ligne

- 🔴 **Cache-first permanent** : `sw.js` met en cache `index.html`, CSS et JS, et
  `caches.match(request) || fetch(request)` ne revalide **jamais**. `CACHE_NAME` reste
  `"gandxo-store-v1"` : après un déploiement, **tous les visiteurs déjà venus gardent
  l'ancienne version indéfiniment**. C'est le pire défaut du PWA tel qu'il est écrit, et
  il est invisible en développement.
  → stratégie *network-first* pour les navigations + *stale-while-revalidate* pour les
  assets, et versionner le cache à chaque déploiement.
- 🟠 **Aucune page de repli hors-ligne** : `index.html` est précaché, mais une navigation
  vers `app.html?id=…` hors-ligne échoue sans message.
- 🟡 `SHELL` n'inclut pas `admin.html`, `admin.css`, `admin.js` (cohérent, mais à assumer
  explicitement). `caches.match` sur `index.html?q=…` ne correspond pas à `./index.html`
  ⇒ les URLs de recherche passent toujours par le réseau (incohérence de comportement).
- 🟡 `manifest.json` : icônes `maskable` identiques aux icônes `any`, **sans zone de
  sécurité** ⇒ rognage sur Android. Manquent `"id"`, `"lang"`, `"dir"`, et des
  `screenshots` (obligatoires pour l'installation améliorée). Dimensions des fichiers :
  correctes (192×192, 512×512, 1200×630 pour `og-image.png`).

---

## 7. Accessibilité (WCAG 2.2 AA)

**Bonne base :** `lang="fr"`, skip-link, `:focus-visible` global, `aria-expanded` sur le
menu, `role="alert"` sur l'erreur de connexion, `aria-live` sur les grilles, `alt`
pertinents, `prefers-reduced-motion` géré, labels correctement associés.

**À corriger :**

1. 🔴 **Contraste insuffisant** — `--text-faint: #6A6F82` (`style.css:19`) sur le fond
   `#10121A` donne **3,70:1**, sous le minimum AA de 4,5:1. Concerne les états vides, les
   libellés de statistiques, les dates de version, le pied de page et les statuts
   d'upload. `--text-muted` (6,4:1) est conforme : il suffit de passer `--text-faint`
   vers `#7C8296` (~4,6:1).
2. 🟠 **Modales admin non accessibles** (les deux modales d'`admin.html`) : pas de
   `role="dialog"`, pas d'`aria-modal`, pas de piège de focus, pas de fermeture par
   `Échap`, focus non déplacé à l'ouverture, arrière-plan non inerte. Un utilisateur
   clavier sort du formulaire sans s'en rendre compte.
3. 🟠 **Graphique sans alternative** : `<canvas>` sans `role="img"`, sans `aria-label`,
   sans tableau équivalent ⇒ information totalement inaccessible.
4. 🟠 **Onglets sans sémantique** : `.admin-tab-btn` sans `role="tab"`,
   `aria-selected`, ni `aria-controls` sur les panneaux.
5. 🟡 `input:focus { outline: none }` (recherche du header, formulaires d'auth) : le focus
   clavier n'est plus signalé que par un changement de couleur, insuffisant.
6. 🟡 Tableaux admin : `th` sans `scope="col"`, pas de `<caption>`.
7. 🟡 États de chargement (`<p class="loading">`) sans `role="status"` : non annoncés.

---

## 8. SEO et métadonnées

1. 🟠 **`og:image` relatif** (`index.html:12`, `about.html:15`, `app.html:13`) :
   `content="og-image.png"`. Facebook, WhatsApp, X et LinkedIn exigent une **URL absolue** ;
   la plupart ignorent silencieusement la valeur ⇒ pas d'aperçu au partage, alors que le
   README annonce l'amélioration comme faite.
2. 🟡 Pas de `og:url`, `og:site_name`, ni `<link rel="canonical">`.
3. 🟡 Pas de `robots.txt` ni `sitemap.xml` ; pas de `favicon.ico` (404 bruyantes sur
   `/favicon.ico`, alors qu'un `favicon-32.png` existe).
4. 🟡 `app.html` titre fixe « Application — Gandxo Store » avant hydratation : les
   aperçus de partage d'une fiche sont génériques (limite inhérente au site statique ;
   à documenter, pas à « corriger » par du JS).
5. 🟡 Aucune donnée structurée `SoftwareApplication` — utile pour un store.
6. ✅ `lang`, `viewport`, `theme-color`, titres et descriptions par page : corrects.

---

## 9. Qualité de code et maintenabilité

- ✅ Commentaires d'intention de bonne qualité, nommage clair, responsabilités plutôt
  bien séparées, aucun `console.log` oublié, aucune dépendance inutile.
- 🟠 **Aucun outillage** : pas de `package.json`, pas d'ESLint, pas de formateur, pas de
  test, pas de CI. Pour un site statique c'est acceptable, mais un simple
  `eslint` + `prettier` + `html-validate` en CI attraperait B1/B2/B7 et les problèmes de
  balisage avant déploiement.
- 🟡 Constantes dupliquées : liens sociaux dans `app.js` **et** `about.html` ; nom de
  collection `store_apps` redéfini dans 3 modules (`store.js`, `admin.js`, `analytics.js`).
  → un seul module `config.js` exportant collection, e-mail admin, liens.
- 🟡 `alert()` / `confirm()` dans l'admin : fonctionnel mais bloquant, non stylable, et
  non accessible de façon fiable. À remplacer par les composants de la page.
- 🟡 Pas de `LICENSE`, pas de `CHANGELOG`, historique Git en « Add files via upload »
  (aucune traçabilité des changements).
- 🟡 `setup-admin.js` utilise `require()` (CommonJS) alors que tout le reste est en ES
  modules : le fichier ne peut pas être lancé tel quel si un `package.json` avec
  `"type": "module"` est ajouté. À documenter ou renommer en `.cjs`.

---

## 10. Documentation

Le `README.md` est utile mais **désynchronisé du dépôt réel** :

| Affirmation du README | Réalité |
|---|---|
| « Tous les fichiers du site sont dans `main/` » | Les fichiers sont **à la racine** |
| « `firestore.rules` (à la racine) contient la version à jour » | Le fichier **n'existe pas** |
| « Stats protégées contre le spam » | Invérifiable sans les règles ; et le compteur exige une écriture publique sur `store_apps` (C2) |
| « Aperçu social amélioré avec `og-image.png` » | Balise `og:image` **relative** ⇒ inopérante sur la plupart des plateformes |
| « `VAPID_KEY` prêt pour les notifications » | Clé exportée et inutilisée, sans code d'abonnement |
| « Ton compte admin est déjà créé » | Rien ne le vérifie ; `setup-admin.js` écrit en plus un document `store_admins` **jamais lu** par le code (l'autorité réelle est l'e-mail dans les règles) |

---

## 11. Plan d'action priorisé

### P0 — à faire avant toute nouvelle publication

1. Récupérer, committer et relire `firestore.rules` ; confirmer que les collections `store_`
   sont isolées de SIS (C1).
2. Interdire toute écriture non authentifiée sur `store_apps` ; supprimer le
   `increment(1)` public ou le déplacer côté serveur (C2).
3. Ajouter `.gitignore` (`serviceAccountKey.json`, `node_modules/`) et déplacer
   `setup-admin.js` hors de la racine web (C3).
4. Corriger le PWA : cache network-first pour les navigations + bump de version à chaque
   déploiement (B9).

### P1 — corrections à fort impact (≈ 1 journée)

5. `try/catch` + message d'erreur sur `toggleStatus`, `deleteApp`, `showAppStatsDetail` (B1, B2).
6. Suppression en cascade (versions + downloads) ou archivage logique (D1).
7. `og:image` en URL absolue + `og:url` + `canonical` (SEO-1).
8. Contraste `--text-faint` → ≥ 4,5:1 (A11Y-1).
9. Restreindre la clé API Firebase + activer App Check (C4).

### P2 — dette de fond (itératif)

10. Agrégats serveur pour les statistiques, suppression des 4 scans complets (D3).
11. Axe Y + tooltips + `resize` sur le graphique (B3).
12. Accessibilité des modales et des onglets admin (A11Y-2, A11Y-4).
13. En-têtes de sécurité et CSP, suppression du `onclick` inline (C5).
14. `scroll-margin-top`, fermeture du menu mobile, scroll vers les résultats (B5, B6).
15. Découplage `ui.js` / `firebase.js`, self-hosting des polices (Perf 1, 3).
16. Outillage minimal : ESLint + Prettier + `html-validate` + CI (Qualité).

### P3 — finitions

17. Nettoyer `blog.js`, `VAPID_KEY`, `store_admins` inutilisé (B10, B11).
18. Corriger plages « 1 an » et dates de version en UTC (B4, D6).
19. `form.elements.*`, `cloudinaryOptimize`, validation du schéma d'URL (B7, B8, B12).
20. `robots.txt`, `sitemap.xml`, `favicon.ico`, données structurées, `LICENSE` (SEO, Qualité).
21. Mettre le README à jour et supprimer les affirmations non vérifiables (Doc).

---

## Annexe — modèle de règles Firestore (à adapter et fusionner avec SIS)

⚠️ Ne pas remplacer les règles existantes du projet partagé : **fusionner** les blocs
`store_*` dans le fichier actuel, puis publier depuis la console.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email == "gbaguidiexauce@gmail.com"
        && request.auth.token.email_verified == true;
    }

    match /store_apps/{appId} {
      // Lecture publique des seules apps publiées ; l'admin voit tout
      // (nécessaire car le dashboard liste sans filtre de statut).
      allow read: if isAdmin() || resource.data.status == "published";

      // Aucune écriture anonyme. L'incrément de totalDownloads doit
      // passer par une Cloud Function, pas par updateDoc côté client.
      allow create, update, delete: if isAdmin();

      match /versions/{versionId} {
        allow read: if isAdmin()
          || get(/databases/$(database)/documents/store_apps/$(appId)).data.status == "published";
        allow create, update, delete: if isAdmin();
      }
    }

    match /store_downloads/{downloadId} {
      // Création publique mais strictement encadrée : l'app doit exister,
      // être publiée, et seuls les champs attendus sont acceptés.
      allow create: if request.resource.data.keys().hasOnly(
                        ["appId", "appName", "version", "timestamp"])
        && request.resource.data.appId is string
        && request.resource.data.timestamp == request.time
        && get(/databases/$(database)/documents/store_apps/$(request.resource.data.appId)).data.status == "published";

      allow read, update, delete: if isAdmin();
    }

    // store_admins n'est pas lu par le code actuel : soit il est supprimé,
    // soit il devient la source d'autorité et isAdmin() le consulte.
    match /store_admins/{uid} {
      allow read: if isAdmin();
      allow write: if false;
    }
  }
}
```

Limite à assumer : même ces règles ne peuvent pas empêcher un appel direct à l'API REST
de gonfler `store_downloads` pour une app publiée (cf. D4).
