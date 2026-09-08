# Gandxo Store — Guide de mise en route

Tous les fichiers du site sont dans `main/`, à plat. `firestore.rules` et ce
`README.md` sont à côté : ce ne sont pas des fichiers du site, mais de la
config Firebase.

## 🆕 Dernière mise à jour

- **Stats protégées contre le spam** : les règles Firestore vérifient
  maintenant que chaque téléchargement enregistré correspond à une vraie
  app publiée, avec un timestamp serveur infalsifiable. → il faut
  republier `firestore.rules` (voir étape 2 ci-dessous).
- **Site installable (PWA)** : `manifest.json` + `sw.js` + icônes
  (`icon-192.png`, `icon-512.png`, `favicon.png`, `favicon-32.png`) ajoutés.
  Sur Android/Chrome, un visiteur peut "Ajouter à l'écran d'accueil" et le
  site s'ouvre comme une vraie app.
- **Partage réseaux sociaux amélioré** : une image d'aperçu (`og-image.png`)
  s'affiche maintenant quand tu partages un lien du store sur
  Facebook/Instagram/WhatsApp.
- **Images plus rapides** : les icônes et captures d'écran hébergées sur
  Cloudinary sont automatiquement servies en format optimisé (WebP/AVIF
  selon l'appareil) et à la bonne taille — utile sur data mobile.

⚠️ Tous les nouveaux fichiers (`manifest.json`, `sw.js`, `og-image.png`,
`icon-192.png`, `icon-512.png`, `favicon.png`, `favicon-32.png`) doivent
être uploadés à la racine de ton repo GitHub, à côté des autres fichiers du
site — sinon les icônes et le mode installable ne fonctionneront pas.

## Déjà fait

- `main/app.js` contient ta config Firebase (`chat-anonyme`), ton compte
  Cloudinary (`dwdlwjdhe` / `sis_preset`), et ton e-mail admin.
- Dans l'admin, "Icône" et "Captures d'écran" ont un bouton **Téléverser**
  qui envoie l'image sur Cloudinary et colle l'URL automatiquement.
- Toutes les collections sont préfixées `store_` pour ne jamais toucher aux
  données de SIS dans le même projet Firebase.
- Ton compte admin (`gbaguidiexauce@gmail.com`) est déjà créé dans
  Authentication. C'est le seul admin possible : vérifié par e-mail
  directement dans les règles Firestore.

## Ce qu'il reste à faire

### 1. Activer l'authentification par e-mail/mot de passe
Firebase Console > **Authentication** > Sign-in method > active
**E-mail/Mot de passe**.

### 2. Republier les règles Firestore
`firestore.rules` (à la racine) contient la version à jour, avec la
protection anti-spam des téléchargements. Colle-le dans Firestore
Database > Règles > **Publier**. Comme d'habitude, si SIS a ses propres
règles à côté, fusionne au lieu de remplacer tout le fichier.

### 3. Déployer
`main/` est un site statique pur : Vercel, Firebase Hosting, GitHub Pages
ou Netlify, sans build.

## Pour aller plus loin (pas fait, sur demande)

- **Nom de domaine personnalisé** — nécessite d'acheter un domaine et de
  configurer le DNS ; possible sur GitHub Pages une fois que tu en as un.
- **Notifications push** — `VAPID_KEY` est présent dans `app.js` mais
  inutilisé, prêt si tu veux des notifs de nouvelle version plus tard.

## Notes

Tant qu'aucune app n'est publiée et qu'aucun téléchargement n'a eu lieu, le
site affiche des états vides explicites — jamais de données inventées.

### Structure des données Firestore

- `store_apps/{appId}` — `name`, `shortDesc`, `fullDesc`, `icon`, `category`,
  `currentVersion`, `size`, `compatibility`, `screenshots[]`, `features[]`,
  `developer`, `downloadUrl`, `changelog`, `status` (`draft`/`published`),
  `totalDownloads`, `createdAt`, `updatedAt`.
- `store_apps/{appId}/versions/{versionId}` — historique des versions.
- `store_downloads/{downloadId}` — `appId`, `appName`, `version`, `timestamp`.
