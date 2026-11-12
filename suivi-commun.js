// =============================================================
//  Suivi de classe : ce que font les élèves sur une page interactive
//  (trigo-triangle.html, radian-cercle.html), visible en direct sur
//  la page de l'enseignant (suivi-prof.html).
//
//  Données stockées : numéro de classe, état de la figure, progression.
//  Rien d'autre. Tout est effacé par « Terminer et effacer ».
// =============================================================

// ---- Configuration Firebase (projet « atelier-trigo ») ----------
// apiKey vide = mode démo local (un seul navigateur, plusieurs onglets).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAlTFvPC0b-WCcf6D8YVc0lSpozaKP2Yfc",
  authDomain: "atelier-trigo.firebaseapp.com",
  projectId: "atelier-trigo",
  storageBucket: "atelier-trigo.firebasestorage.app",
  messagingSenderId: "61529021123",
  appId: "1:61529021123:web:dcd58f473abfd3ce242076"
};
const FB = "https://www.gstatic.com/firebasejs/10.12.2";
export const MODE_LOCAL = !FIREBASE_CONFIG.apiKey;

// Pages suivies : identifiant → fichier et titre
export const PAGES = {
  trigo: { fichier: "trigo-triangle.html", titre: "Trigonométrie dans un triangle rectangle" },
  radian: { fichier: "radian-cercle.html", titre: "Le radian" }
};

export function nouveauCode() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

// ---- Stockage --------------------------------------------------
// Séance  : suivi/{code}            { owner, page, open, created }
// Élève   : suivi/{code}/eleves/{n} { seat, page, etat (JSON), prog (map), t }
export async function stockage() { return MODE_LOCAL ? stockageLocal() : await stockageFirebase(); }

function stockageLocal() {
  const canal = ("BroadcastChannel" in window) ? new BroadcastChannel("suivi") : null;
  const cle = code => "suivi:" + code;
  const lire = code => { try { return JSON.parse(localStorage.getItem(cle(code))); } catch { return null; } };
  const abonnes = [];
  const notifier = code => abonnes.forEach(f => f(code));
  const ecrire = (code, v) => {
    if (v === null) localStorage.removeItem(cle(code)); else localStorage.setItem(cle(code), JSON.stringify(v));
    canal && canal.postMessage(code); setTimeout(() => notifier(code), 0);
  };
  canal && (canal.onmessage = e => notifier(e.data));
  window.addEventListener("storage", e => { if (e.key && e.key.startsWith("suivi:")) notifier(e.key.slice(6)); });
  const abonner = (code, f) => { abonnes.push(c => { if (c === code) f(); }); f(); };
  return {
    async creerSeance(page) {
      const code = nouveauCode();
      ecrire(code, { seance: { owner: "local", page, open: true }, eleves: {} });
      localStorage.setItem("suivi-prof", code); return code;
    },
    suivreSeance(code, cb) { abonner(code, () => { const v = lire(code); cb(v ? v.seance : null); }); },
    async publier(code, seat, page, etat, prog) {
      const v = lire(code);
      if (!v || !v.seance.open || v.seance.page !== page) throw new Error("refusé");
      v.eleves[seat] = { seat, page, etat: JSON.stringify(etat), prog, t: Date.now() };
      ecrire(code, v);
    },
    suivreEleves(code, cb) { abonner(code, () => { const v = lire(code); cb(v ? Object.values(v.eleves) : []); }); },
    async terminer(code) { ecrire(code, null); localStorage.removeItem("suivi-prof"); },
    estProprietaire(code) { return localStorage.getItem("suivi-prof") === code; }
  };
}

async function stockageFirebase() {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const fs = await import(`${FB}/firebase-firestore.js`);
  const au = await import(`${FB}/firebase-auth.js`);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app), auth = au.getAuth(app);
  const connexion = () => auth.currentUser ? Promise.resolve(auth.currentUser) : au.signInAnonymously(auth).then(r => r.user);
  const docSeance = code => fs.doc(db, "suivi", code);
  const colEleves = code => fs.collection(db, "suivi", code, "eleves");
  return {
    async creerSeance(page) {
      const user = await connexion();
      for (let i = 0; i < 5; i++) {
        const code = nouveauCode();
        if ((await fs.getDoc(docSeance(code))).exists()) continue;
        await fs.setDoc(docSeance(code), { owner: user.uid, page, open: true, created: fs.serverTimestamp() });
        localStorage.setItem("suivi-prof", code); return code;
      }
      throw new Error("Impossible de créer un code de séance.");
    },
    suivreSeance(code, cb, erreur) {
      return fs.onSnapshot(docSeance(code), { includeMetadataChanges: true }, s => {
        if (!s.exists() && s.metadata.fromCache) return;
        cb(s.exists() ? s.data() : null);
      }, e => { console.error(e); erreur ? erreur(e) : cb(null); });
    },
    async publier(code, seat, page, etat, prog) {
      await fs.setDoc(fs.doc(db, "suivi", code, "eleves", seat),
        { seat, page, etat: JSON.stringify(etat), prog, t: fs.serverTimestamp() });
    },
    suivreEleves(code, cb, erreur) {
      connexion().then(() => fs.onSnapshot(colEleves(code), s => {
        cb(s.docs.map(d => { const x = d.data(); return { ...x, t: x.t ? x.t.toMillis() : Date.now() }; }));
      }, e => { console.error(e); erreur && erreur(e); }));
    },
    async terminer(code) {
      await connexion();
      const s = await fs.getDocs(colEleves(code));
      const lot = fs.writeBatch(db); s.docs.forEach(d => lot.delete(d.ref)); await lot.commit();
      await fs.deleteDoc(docSeance(code)); localStorage.removeItem("suivi-prof");
    },
    estProprietaire(code) { return localStorage.getItem("suivi-prof") === code; }
  };
}

// ---- Côté élève : rejoindre une séance, publier son état ----------
// Utilisé par les pages élèves :  import { brancherSuivi } from "./suivi-commun.js";
//   const suivi = brancherSuivi("trigo");   puis   suivi.publier(etat, prog)
// La page fonctionne comme avant sans séance ; avec ?s=CODE dans l'adresse,
// l'élève entre son numéro et l'enseignant voit son travail.
const INVITE = "PIA";   // code invité : l'activité marche, sans apparaître dans le suivi
export function brancherSuivi(page) {
  const params = new URLSearchParams(location.search);
  let st = null, code = null, seat = null, attente = null, dernier = 0, minuteur = null, actif = false;

  // badge dans l'en-tête et fenêtre pour rejoindre
  const style = document.createElement("style");
  style.textContent = `
    .suivi-badge{margin-left:auto;font-family:"Spline Sans Mono",monospace;font-size:0.72rem;letter-spacing:0.06em;
      border:1.5px solid var(--faint,#c9c0b1);border-radius:2px;padding:6px 10px;background:transparent;color:var(--line,#2b3a36);cursor:pointer;text-transform:none}
    .suivi-badge.ok{border-color:var(--accent2,#0e7c6b);color:var(--accent2,#0e7c6b)}
    .suivi-badge.ko{border-color:var(--red,#c0392b);color:var(--red,#c0392b)}
    .suivi-fond{position:fixed;inset:0;background:rgba(28,35,33,0.35);display:none;align-items:center;justify-content:center;z-index:100}
    .suivi-fond.on{display:flex}
    .suivi-boite{background:var(--paper,#f4efe6);border:1.5px solid var(--line,#2b3a36);border-radius:4px;padding:22px 26px;min-width:290px;
      font-family:"Spline Sans Mono",monospace;font-size:0.85rem;color:var(--ink,#1c2321);user-select:text;-webkit-user-select:text}
    .suivi-boite h2{font-family:Fraunces,Georgia,serif;font-size:1.25rem;margin:0 0 14px;font-weight:600}
    .suivi-boite label{display:block;margin:10px 0 4px}
    .suivi-boite input{font-family:inherit;font-size:1.2rem;padding:6px 8px;width:7em;border:1.5px solid var(--faint,#c9c0b1);border-radius:4px;
      background:#fff;user-select:text;-webkit-user-select:text;letter-spacing:0.1em}
    .suivi-boite .msg{color:var(--red,#c0392b);min-height:1.3em;margin-top:10px}
    .suivi-boite .actions{display:flex;gap:10px;margin-top:14px}`;
  document.head.appendChild(style);
  const badge = document.createElement("button");
  badge.className = "suivi-badge"; badge.type = "button"; badge.textContent = "Rejoindre la classe";
  (document.querySelector("header") || document.body).appendChild(badge);
  const fond = document.createElement("div");
  fond.className = "suivi-fond";
  fond.innerHTML = `<div class="suivi-boite"><h2>Rejoindre la classe</h2>
    <label for="suivi-code">Code affiché au tableau</label><input id="suivi-code" maxlength="4" autocomplete="off" autocapitalize="characters">
    <label for="suivi-num">Ton numéro</label><input id="suivi-num" type="number" min="1" max="40" inputmode="numeric">
    <div class="msg" id="suivi-msg"></div>
    <div class="actions"><button type="button" id="suivi-ok" class="primary">Rejoindre</button><button type="button" id="suivi-non">Plus tard</button></div></div>`;
  document.body.appendChild(fond);
  // la page bloque le toucher et la sélection : on les rend à la fenêtre
  ["pointerdown", "touchstart"].forEach(t => fond.addEventListener(t, e => e.stopPropagation()));
  const $ = id => document.getElementById(id);
  $("suivi-code").value = (params.get("s") || localStorage.getItem("suivi-code") || "").toUpperCase();
  $("suivi-num").value = localStorage.getItem("suivi-num") || "";
  badge.onclick = () => { fond.classList.add("on"); $("suivi-msg").textContent = ""; };
  $("suivi-non").onclick = () => fond.classList.remove("on");
  $("suivi-ok").onclick = rejoindre;

  async function rejoindre() {
    const c = $("suivi-code").value.trim().toUpperCase(), n = parseInt($("suivi-num").value, 10);
    // code invité « pia » (tutrice) : même activité, rien n'est envoyé, absente de l'écran de l'enseignant
    if (c === INVITE) {
      actif = false; attente = null;
      fond.classList.remove("on");
      badge.textContent = "Invitée (non suivie)"; badge.className = "suivi-badge";
      return;
    }
    if (c.length !== 4) { $("suivi-msg").textContent = "Le code a 4 caractères."; return; }
    if (!(n >= 1 && n <= 40)) { $("suivi-msg").textContent = "Un numéro entre 1 et 40."; return; }
    $("suivi-msg").textContent = "Connexion…";
    try { st = st || await stockage(); } catch (e) { $("suivi-msg").textContent = "Connexion impossible."; return; }
    let premier = true;
    st.suivreSeance(c, s => {
      if (premier) {
        premier = false;
        if (!s || !s.open) { $("suivi-msg").textContent = "Aucune séance avec ce code."; return; }
        if (s.page !== page) { $("suivi-msg").textContent = "Ce code est pour une autre page."; return; }
        code = c; seat = String(n); actif = true;
        localStorage.setItem("suivi-code", c); localStorage.setItem("suivi-num", n);
        fond.classList.remove("on");
        badge.textContent = `Classe ${c}, n° ${n}`; badge.className = "suivi-badge ok";
        envoyer(true);
      } else if (!s || !s.open) {
        actif = false; badge.textContent = "Séance terminée"; badge.className = "suivi-badge";
      }
    }, () => { $("suivi-msg").textContent = "Connexion impossible."; });
  }
  if (params.get("s")) fond.classList.add("on");

  // envoi groupé : au plus un envoi toutes les 1,5 s, le dernier état gagne
  function envoyer(force) {
    if (!actif || !attente) return;
    const reste = 1500 - (Date.now() - dernier);
    if (!force && reste > 0) { clearTimeout(minuteur); minuteur = setTimeout(() => envoyer(true), reste); return; }
    const { etat, prog } = attente; attente = null; dernier = Date.now();
    st.publier(code, seat, page, etat, prog).then(() => {
      badge.className = "suivi-badge ok";
    }).catch(e => { console.error(e); badge.className = "suivi-badge ko"; badge.textContent = `Classe ${code}, n° ${seat} (hors ligne)`; });
  }
  return {
    publier(etat, prog) { attente = { etat, prog }; envoyer(false); }
  };
}
