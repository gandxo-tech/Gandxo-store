// ============================================================
// setup-admin.js — Crée (si besoin) ton compte Firebase Auth et
// te déclare administrateur de Gandxo Store, en une commande.
//
// ⚠️ Ce script vit dans tools/ : VOLONTAIREMENT hors de la racine
// publiée du site, pour qu'il ne soit jamais téléchargeable en ligne.
//
// USAGE :
//   1. npm install firebase-admin
//   2. Firebase Console > ⚙️ Paramètres du projet > Comptes de service
//      > "Générer une nouvelle clé privée" > télécharge le JSON,
//      renomme-le "serviceAccountKey.json", mets-le à côté de ce fichier.
//      ⚠️ Ne jamais partager ni committer ce fichier (accès total au projet).
//      Le .gitignore du dépôt l'exclut déjà.
//   3. node tools/setup-admin.js ton-email@exemple.com ton-mot-de-passe
//
// Si un compte existe déjà pour cet e-mail, son mot de passe n'est PAS
// changé : seul le mot de passe est utilisé pour créer le compte s'il
// n'existe pas encore.
//
// ⚠️ N'oublie pas d'activer "E-mail/Mot de passe" dans Authentication >
// Sign-in method dans la console — ça, c'est un interrupteur que seule
// la console peut basculer, aucun script ne peut le faire à ta place.
// ============================================================

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // à côté de ce fichier (tools/)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage : node tools/setup-admin.js ton-email@exemple.com ton-mot-de-passe");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Le mot de passe doit faire au moins 6 caractères (minimum Firebase Auth).");
    process.exit(1);
  }

  let user = await admin.auth().getUserByEmail(email).catch(() => null);

  if (!user) {
    user = await admin.auth().createUser({ email, password });
    console.log(`✅ Compte créé pour ${email} (uid: ${user.uid}).`);
  } else {
    console.log(`ℹ️  Compte déjà existant pour ${email} (uid: ${user.uid}) — mot de passe inchangé.`);
  }

  await admin.firestore().collection("store_admins").doc(user.uid).set({
    isAdmin: true,
    email,
    grantedAt: new Date().toISOString()
  });

  console.log(`✅ ${email} est maintenant administrateur de Gandxo Store.`);
  console.log("Il ne reste plus qu'à activer 'E-mail/Mot de passe' dans Authentication > Sign-in method si ce n'est pas déjà fait.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur :", err.message);
  process.exit(1);
});
