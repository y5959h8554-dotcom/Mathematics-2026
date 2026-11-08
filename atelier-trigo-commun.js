// =============================================================
//  Atelier « Triangle rectangle » : code commun élève / enseignant
//  - stockage des envois (Firebase Firestore, ou mode démo local)
//  - géométrie du triangle ABC (rectangle en C)
//  - paramètres des quatre activités
// =============================================================

// ---- 1. Configuration Firebase --------------------------------
// Coller ici l'objet « firebaseConfig » de la console Firebase
// (Paramètres du projet > Vos applications > Application Web).
// apiKey vide = mode démo local (un seul navigateur, plusieurs onglets).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAlTFvPC0b-WCcf6D8YVc0lSpozaKP2Yfc",
  authDomain: "atelier-trigo.firebaseapp.com",
  projectId: "atelier-trigo",
  storageBucket: "atelier-trigo.firebasestorage.app",
  messagingSenderId: "61529021123",
  appId: "1:61529021123:web:dcd58f473abfd3ce242076"
};

const FB_VERSION = "10.12.2";
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

export const MODE_LOCAL = !FIREBASE_CONFIG.apiKey;

// ---- 2. Activités ---------------------------------------------
export const ACTIVITES = {
  1: { titre: "Construis un triangle rectangle",
       consigne: "Déplace les sommets pour que le triangle ABC soit rectangle en C. Choisis la forme que tu veux.",
       court: "Triangle rectangle" },
  2: { titre: "Les longueurs des côtés",
       consigne: "Construis un autre triangle rectangle en C, différent du premier, puis observe les longueurs des côtés.",
       court: "Pythagore" },
  3: { titre: "Même angle, tailles différentes",
       consigne: "Construis un triangle rectangle en C avec un angle de 35° en A et une hypoténuse de la longueur indiquée.",
       court: "Angle de 35°" },
  4: { titre: "Défi : hypoténuse 1",
       consigne: "Construis un triangle rectangle en C avec l'angle indiqué en A et une hypoténuse de longueur 1.",
       court: "Valeurs remarquables" }
};

// Paramètre personnel (dépend du numéro, pour que chacun ait autre chose)
export function parametre(act, numero) {
  const n = Math.max(1, parseInt(numero, 10) || 1);
  if (act === 3) return [5, 6, 7, 8, 9, 10, 11, 12][(n - 1) % 8];   // hypoténuse
  if (act === 4) return [30, 45, 60][(n - 1) % 3];                  // angle en A
  return null;
}
// Unité affichée : en activité 4, 1 unité = 8 carreaux
export function unite(act) { return act === 4 ? 8 : 1; }
export const ANGLE_ACT3 = 35;

// ---- 3. Géométrie --------------------------------------------
const dist = (P, Q) => Math.hypot(P[0] - Q[0], P[1] - Q[1]);
function angle(P, Q, R) { // angle en Q, en degrés
  const u = [P[0] - Q[0], P[1] - Q[1]], v = [R[0] - Q[0], R[1] - Q[1]];
  const c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}
// Mesures du triangle ABC, longueurs dans l'unité de l'activité
export function mesures(A, B, C, u = 1) {
  return {
    a: dist(B, C) / u, b: dist(A, C) / u, c: dist(A, B) / u,
    A: angle(B, A, C), B: angle(A, B, C), C: angle(A, C, B)
  };
}
// Conditions de validation d'un envoi
export const TOL_ANGLE = 1;
export function verifier(act, m, param) {
  const checks = [{ label: "angle droit en C", ok: Math.abs(m.C - 90) <= TOL_ANGLE }];
  if (act === 3) {
    checks.push({ label: `angle de ${ANGLE_ACT3}° en A`, ok: Math.abs(m.A - ANGLE_ACT3) <= TOL_ANGLE });
    checks.push({ label: `hypoténuse ${param}`, ok: Math.abs(m.c - param) <= 0.1 });
  }
  if (act === 4) {
    checks.push({ label: `angle de ${param}° en A`, ok: Math.abs(m.A - param) <= TOL_ANGLE });
    checks.push({ label: "hypoténuse 1", ok: Math.abs(m.c - 1) <= 0.02 });
  }
  if (m.A < 3 || m.B < 3) checks.push({ label: "triangle non aplati", ok: false });
  return checks;
}
export const fmt = (x, d = 2) => x.toFixed(d).replace(".", ",");

// ---- 4. Code de séance ---------------------------------------
export function nouveauCode() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

// ---- 5. Stockage ---------------------------------------------
// Interface commune :
//   creerSeance() -> code          changerActivite(code, act)
//   suivreSeance(code, cb)          envoyer(code, envoi)
//   suivreEnvois(code, cb)          terminerSeance(code)
//   estProprietaire(code) -> bool
export async function stockage() {
  return MODE_LOCAL ? stockageLocal() : await stockageFirebase();
}

function stockageLocal() {
  const canal = ("BroadcastChannel" in window) ? new BroadcastChannel("atelier-trigo") : null;
  const cle = code => "atelier-trigo:" + code;
  const lire = code => { try { return JSON.parse(localStorage.getItem(cle(code))); } catch { return null; } };
  const ecrire = (code, v) => {
    if (v === null) localStorage.removeItem(cle(code)); else localStorage.setItem(cle(code), JSON.stringify(v));
    canal && canal.postMessage(code);
    setTimeout(() => notifier(code), 0);          // même onglet : ni « storage » ni BroadcastChannel
  };
  const abonnes = [];
  const notifier = code => abonnes.forEach(f => f(code));
  canal && (canal.onmessage = e => notifier(e.data));
  window.addEventListener("storage", e => { if (e.key && e.key.startsWith("atelier-trigo:")) notifier(e.key.slice(14)); });
  const abonner = (code, f) => { const g = c => { if (c === code) f(); }; abonnes.push(g); f(); };
  return {
    local: true,
    async creerSeance() {
      const code = nouveauCode();
      ecrire(code, { seance: { act: 0, open: true, owner: "local" }, envois: [] });
      localStorage.setItem("atelier-trigo-prof", code);
      return code;
    },
    async changerActivite(code, act) { const v = lire(code); if (v) { v.seance.act = act; ecrire(code, v); } },
    suivreSeance(code, cb) { abonner(code, () => { const v = lire(code); cb(v ? v.seance : null); }); },
    async envoyer(code, envoi) {
      const v = lire(code);
      if (!v || !v.seance.open) throw new Error("Séance introuvable ou fermée.");
      v.envois.push({ ...envoi, t: Date.now(), id: Math.random().toString(36).slice(2) });
      ecrire(code, v);
    },
    suivreEnvois(code, cb) { abonner(code, () => { const v = lire(code); cb(v ? v.envois : []); }); },
    async terminerSeance(code) { ecrire(code, null); localStorage.removeItem("atelier-trigo-prof"); },
    estProprietaire(code) { return localStorage.getItem("atelier-trigo-prof") === code; }
  };
}

async function stockageFirebase() {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const fs = await import(`${FB}/firebase-firestore.js`);
  const au = await import(`${FB}/firebase-auth.js`);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app);
  const auth = au.getAuth(app);
  const connexion = () => auth.currentUser ? Promise.resolve(auth.currentUser)
    : au.signInAnonymously(auth).then(r => r.user);
  const docSeance = code => fs.doc(db, "sessions", code);
  const colEnvois = code => fs.collection(db, "sessions", code, "submissions");
  return {
    local: false,
    async creerSeance() {
      const user = await connexion();
      for (let essai = 0; essai < 5; essai++) {
        const code = nouveauCode();
        const existe = await fs.getDoc(docSeance(code));
        if (existe.exists()) continue;
        await fs.setDoc(docSeance(code), { owner: user.uid, act: 0, open: true, created: fs.serverTimestamp() });
        localStorage.setItem("atelier-trigo-prof", code);
        return code;
      }
      throw new Error("Impossible de créer un code de séance.");
    },
    async changerActivite(code, act) { await connexion(); await fs.updateDoc(docSeance(code), { act }); },
    suivreSeance(code, cb) {
      return fs.onSnapshot(docSeance(code), s => cb(s.exists() ? s.data() : null), () => cb(null));
    },
    async envoyer(code, envoi) { await fs.addDoc(colEnvois(code), { ...envoi, t: fs.serverTimestamp() }); },
    suivreEnvois(code, cb) {
      connexion().then(() => fs.onSnapshot(colEnvois(code), s => {
        cb(s.docs.map(d => { const x = d.data(); return { ...x, id: d.id, t: x.t ? x.t.toMillis() : Date.now() }; }));
      }, e => console.error(e)));
    },
    async terminerSeance(code) {
      await connexion();
      const s = await fs.getDocs(colEnvois(code));
      let lot = fs.writeBatch(db), n = 0;
      for (const d of s.docs) {
        lot.delete(d.ref);
        if (++n % 400 === 0) { await lot.commit(); lot = fs.writeBatch(db); }
      }
      await lot.commit();
      await fs.deleteDoc(docSeance(code));
      localStorage.removeItem("atelier-trigo-prof");
    },
    estProprietaire(code) { return localStorage.getItem("atelier-trigo-prof") === code; }
  };
}

// Dernier envoi de chaque numéro pour une activité
export function derniersEnvois(envois, act) {
  const parNum = new Map();
  envois.filter(e => e.act === act).sort((x, y) => x.t - y.t).forEach(e => parNum.set(e.seat, e));
  return [...parNum.values()].sort((x, y) => (parseInt(x.seat) || 0) - (parseInt(y.seat) || 0));
}
