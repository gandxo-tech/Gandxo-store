# Gandxo Store

Store statique (HTML/CSS/JS, sans build) qui liste, détaille et distribue les
applications de Gandxo. Les données vivent dans Firestore, les images sur
Cloudinary, l'administration est un simple compte Firebase Auth.

**En ligne :** https://gandxo-store.vercel.app — miroir GitHub Pages :
https://gandxo-tech.github.io/Gandxo-store/

---

## Structure du dépôt

Tous les fichiers du site sont **à la racine** (aucun sous-dossier `main/`) :

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil : hero, catégories, grille d'applications |
| `app.html` | Fiche détaillée d'une application (`?id=…`) |
| `about.html` | Page à propos + liens sociaux |
| `login.html` | Connexion admin (Firebase Auth) |
| `admin.html` | Tableau de bord : stats, CRUD applications, versions |
| `404.html` | Page d'erreur (utilisée par GitHub Pages) |
| `app.js` | Init Firebase + header/footer/utilitaires partagés |
| `store.js` | Logique du store public |
| `auth.js` | Connexion/déconnexion et garde d'accès admin |
| `admin.js` | Interface d'administration |
| `analytics.js` | Enregistrement et agrégation des téléchargements |
| `sw.js` + `manifest.json` | PWA (installable, réseau d'abord) |
| `firestore.rules` | **Règles de sécurité à publier dans la console** |
| `tools/setup-admin.js` | Script local de création du compte admin (hors site) |
| `AUDIT.md` | Audit complet (sécurité, données, perf, a11y, SEO) |

`tools/` n'est pas destiné au web : il est hors de la logique du site, mais
GitHub Pages publie tout le dépôt — ne rien y placer de secret.

## Déploiement

Le site est **synchronisé avec ce dépôt** :

- **GitHub Pages** : build depuis la branche `main`, dossier `/` (racine).
  Chaque `git push` sur `main` redéploie automatiquement en une minute environ.
- **Vercel** : projet lié au même dépôt, sans build (`Output: static`).

Il n'y a **aucune étape de compilation** : ce qui est dans le dépôt est ce qui
est servi. Après un déploiement, penser à incrémenter `CACHE_NAME` dans
`sw.js` (`gandxo-store-v2` → `v3`, …) pour que les visiteurs récupèrent la
nouvelle version.

## Configuration Firebase

Le projet `chat-anonyme` est **partagé avec SIS**. Toutes les collections du
store sont préfixées `store_` pour éviter toute collision :

| Collection | Contenu |
|---|---|
| `store_apps/{appId}` | `name`, `shortDesc`, `fullDesc`, `icon`, `category`, `currentVersion`, `size`, `compatibility`, `screenshots[]`, `features[]`, `developer`, `downloadUrl`, `changelog`, `status` (`draft`/`published`), `totalDownloads`, `createdAt`, `updatedAt` |
| `store_apps/{appId}/versions/{versionId}` | `versionNumber`, `versionCode`, `date`, `size`, `downloadUrl`, `compatibility`, `changelog` |
| `store_downloads/{downloadId}` | `appId`, `appName`, `version`, `timestamp` (serveur) |

### 1. Authentification
Firebase Console > **Authentication** > Sign-in method > activer
**E-mail/Mot de passe**.

### 2. Règles Firestore
Le fichier `firestore.rules` du dépôt est la version de référence. Copier son
contenu dans Firestore > **Règles** > Publier. Le projet étant partagé avec
SIS, **fusionner** les blocs `store_*` avec les règles existantes au lieu de
tout remplacer.

Ce que garantissent ces règles :

- lecture publique des **seules** applications publiées ;
- écriture sur `store_apps` réservée à l'admin, **sauf** `totalDownloads`
  (+1) qu'un visiteur peut incrémenter en téléchargeant ;
- création d'un téléchargement encadrée (champs exacts, `timestamp` serveur,
  application publiée obligatoire) ;
- lecture des statistiques réservée à l'admin.

### 3. Compte admin
```bash
npm install firebase-admin
# Placer serviceAccountKey.json à côté de tools/setup-admin.js (ignoré par git)
node tools/setup-admin.js ton-email@exemple.com ton-mot-de-passe
```
L'e-mail admin autorisé est défini à deux endroits, **à garder identiques** :
`ADMIN_EMAIL` dans `app.js` et la fonction `isAdmin()` dans `firestore.rules`.

### 4. Restreindre la clé API
La clé Firebase présente dans `app.js` n'est pas un secret, mais elle doit
être limitée : Google Cloud Console > API Keys > restreindre aux référents
`https://gandxo-store.vercel.app/*` et `https://gandxo-tech.github.io/*`.

## Ajouter une application

1. Se connecter sur `login.html`.
2. Onglet **Applications** > **+ Ajouter une application**.
3. Renseigner nom, descriptions, icône (bouton **Téléverser** → Cloudinary),
   captures d'écran, lien de téléchargement direct (`.apk`/`.zip`).
4. Statut **Publiée** pour qu'elle apparaisse sur le site.
5. Bouton **Versions** pour tenir l'historique ; « Définir comme version
   actuelle » met à jour version, taille, lien et changelog d'un coup.

Supprimer une application supprime aussi ses versions et son historique de
téléchargements.

## Notes et limites connues

- **Aucune donnée inventée** : sans application publiée, le site affiche des
  états vides explicites.
- Les téléchargements sont **déclarés par le client** : les règles empêchent
  de cibler une app non publiée, mais un appel direct à l'API REST reste
  possible. Les chiffres sont fiables en usage normal, pas infalsifiables.
- Le graphique du dashboard charge les documents de la période sélectionnée
  (fenêtre limitée à 90 jours maximum, hors « Tout »).
- Pas de réinitialisation de mot de passe dans l'interface : passer par la
  console Firebase si nécessaire.
- `blog.js` est un fichier vide hérité, non utilisé.

## Documentation

`AUDIT.md` contient l'audit complet (constats, sévérités, plan d'action).
