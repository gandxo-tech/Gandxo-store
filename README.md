# Gandxo Store — Guide de mise en route

Tous les fichiers du site sont dans `main/`, à plat. `firestore.rules` et ce
`README.md` sont à côté : ce ne sont pas des fichiers du site, mais de la
config Firebase.

## Déjà fait pour toi

- `main/app.js` contient déjà ta config Firebase (`chat-anonyme`) et ton
  compte Cloudinary (`dwdlwjdhe` / `sis_preset`).
- Dans l'admin, les champs "Icône" et "Captures d'écran" ont un bouton
  **Téléverser** qui envoie directement l'image sur Cloudinary et colle
  l'URL — plus besoin d'héberger les images ailleurs et de copier un lien.
- Comme ton projet Firebase est partagé avec SIS, toutes les collections de
  Gandxo Store sont préfixées `store_` (`store_apps`, `store_downloads`,
  `store_admins`) pour ne jamais toucher aux données de SIS.

## Ce qu'il reste à faire

### 1. Activer l'authentification par e-mail/mot de passe
Firebase Console > **Authentication** > Sign-in method > active
**E-mail/Mot de passe** (si ce n'est pas déjà fait pour SIS).
Puis **Authentication > Users**, ajoute ton compte admin (e-mail + mot de passe).

### 2. Fusionner les règles de sécurité — ⚠️ ne pas juste coller
`firestore.rules` (à la racine, pas dans `main/`) contient les règles pour
`store_apps`, `store_downloads` et `store_admins`. Comme ce projet a déjà des
règles pour SIS, **ajoute ces 3 blocs `match` dans le fichier de règles
existant** (Firestore Database > Règles), au lieu de remplacer tout le
fichier. Envoie-moi les règles actuelles de SIS si tu veux que je fasse la
fusion moi-même.

### 3. Te déclarer administrateur du store

`setup-admin.js` crée ton compte Auth (si besoin) **et** ton doc
`store_admins` en une seule commande :
1. `npm install firebase-admin`
2. Firebase Console > ⚙️ Paramètres du projet > Comptes de service >
   "Générer une nouvelle clé privée" > télécharge le JSON, renomme-le
   `serviceAccountKey.json`, place-le à côté de `setup-admin.js`.
   ⚠️ Ne jamais partager ni committer ce fichier.
3. `node setup-admin.js ton-email@exemple.com ton-mot-de-passe`

Connecte-toi ensuite sur `login.html` avec ces identifiants pour accéder à
`admin.html`.

### 4. Déployer
`main/` est un site statique pur : il se déploie tel quel sur Vercel,
Firebase Hosting ou Netlify, sans build.

## Notes

- `VAPID_KEY` est présent dans `app.js` mais n'est utilisé nulle part : je
  ne l'ai pas branché sur des notifications push, cette fonctionnalité
  n'était pas demandée pour le store. Dis-moi si tu veux que j'ajoute des
  notifications de nouvelles versions (nécessite un service worker en plus).
- Tant qu'aucune app n'est publiée et qu'aucun téléchargement n'a eu lieu,
  tout le site affiche des états vides explicites — jamais de données
  inventées.

### Structure des données Firestore

- `store_apps/{appId}` — `name`, `shortDesc`, `fullDesc`, `icon`, `category`,
  `currentVersion`, `size`, `compatibility`, `screenshots[]`, `features[]`,
  `developer`, `downloadUrl`, `changelog`, `status` (`draft`/`published`),
  `totalDownloads`, `createdAt`, `updatedAt`.
- `store_apps/{appId}/versions/{versionId}` — historique des versions.
- `store_downloads/{downloadId}` — `appId`, `appName`, `version`, `timestamp`.
- `store_admins/{uid}` — un document par administrateur autorisé.
