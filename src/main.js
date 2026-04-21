// --- Catálogo de tutoriales ------------------------------------------------
// La data vive en src/tutorials.json y se importa acá. Cada entrada tiene
// id, title, blurb, badge, duration, steps[]. La vista se construye al vuelo
// cuando el usuario hace clic.
import tutorialsData from "./tutorials.json";
const tutorials = tutorialsData;


let floatingWin = null;
let floatingKind = null; // "pip" | "popup" | "pip-meet"

const $ = (sel, root = document) => root.querySelector(sel);
const tutorial = $("#tutorial"); // tutorial default de la página principal
const supportWarning = $("#support-warning");
const logEl = $("#log");

// Setear src del audio respetando la base URL (localhost o /pip-poc/ en Pages)
$("#silent-audio").src = `${import.meta.env.BASE_URL}silence.wav`;

// --- logging ---------------------------------------------------------------
function log(msg, kind = "info") {
  const ts = new Date().toLocaleTimeString();
  const cls = kind === "ok" ? "ok" : kind === "err" ? "err" : kind === "evt" ? "evt" : "";
  const line = document.createElement("span");
  line.className = cls;
  line.textContent = `[${ts}] ${msg}\n`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(`[pip-poc] ${msg}`);
}

$("#log-clear").addEventListener("click", () => { logEl.textContent = ""; });

log(`documentPictureInPicture API: ${"documentPictureInPicture" in window ? "disponible ✅" : "no disponible ❌"}`);
log(`User agent: ${navigator.userAgent}`);

// --- tutorial UI -----------------------------------------------------------
// Construye un nodo de tutorial con sus propios controles y estado.
function buildTutorialNode(data) {
  const root = document.createElement("article");
  root.className = "tutorial";
  root.innerHTML = `
    <div class="tutorial-head">
      <h2 class="t-title"></h2>
      <span class="t-indicator indicator"></span>
    </div>
    <div class="t-body step-body"></div>
    <div class="tutorial-controls">
      <button class="t-prev" type="button">← Anterior</button>
      <button class="t-next" type="button">Siguiente →</button>
    </div>
  `;

  let current = 0;
  const titleEl = root.querySelector(".t-title");
  const bodyEl = root.querySelector(".t-body");
  const indEl = root.querySelector(".t-indicator");
  const prevBtn = root.querySelector(".t-prev");
  const nextBtn = root.querySelector(".t-next");

  const render = () => {
    const s = data.steps[current];
    titleEl.textContent = s.title;
    bodyEl.innerHTML = s.html;
    indEl.textContent = `${current + 1} / ${data.steps.length}`;
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === data.steps.length - 1;
  };

  prevBtn.addEventListener("click", () => { if (current > 0) { current--; render(); log(`step → ${current + 1}`, "evt"); } });
  nextBtn.addEventListener("click", () => { if (current < data.steps.length - 1) { current++; render(); log(`step → ${current + 1}`, "evt"); } });

  render();
  return root;
}

// Wire del tutorial default (el de arriba, con los 3 botones de test)
const defaultRoot = buildTutorialNode(tutorials.default);
tutorial.replaceChildren(...defaultRoot.childNodes);
// botones de apertura viven dentro del <article id="tutorial"> existente
const footer = document.createElement("div");
footer.className = "tutorial-footer";
footer.innerHTML = `
  <button id="pip-btn" type="button" class="primary">📌 Abrir en PiP</button>
  <button id="popup-btn" type="button">🪟 Abrir como popup (window.open)</button>
  <button id="pip-meet-btn" type="button">🎵 Abrir PiP al estilo Meet (audio + MediaSession)</button>
`;
tutorial.appendChild(footer);

$("#pip-btn").addEventListener("click", () => openPiP(tutorials.default));
$("#popup-btn").addEventListener("click", () => openPopup(tutorials.default));
$("#pip-meet-btn").addEventListener("click", () => openPiPMeetStyle(tutorials.default));

// --- Galería ---------------------------------------------------------------
const gallery = $("#gallery");
Object.entries(tutorials)
  .filter(([key]) => key !== "default")
  .forEach(([key, data]) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.innerHTML = `
      <h4></h4>
      <p class="card-blurb"></p>
      <div class="card-meta">
        <span class="card-badge"></span>
        <span class="card-duration"></span>
        <span class="card-steps"></span>
      </div>
    `;
    card.querySelector("h4").textContent = data.title;
    card.querySelector(".card-blurb").textContent = data.blurb;
    card.querySelector(".card-badge").textContent = data.badge;
    card.querySelector(".card-duration").textContent = `⏱ ${data.duration}`;
    card.querySelector(".card-steps").textContent = `📋 ${data.steps.length} pasos`;
    card.addEventListener("click", () => openPiPMeetStyle(data));
    gallery.appendChild(card);
  });

// --- shared helpers --------------------------------------------------------
function copyStylesTo(targetDoc) {
  let inline = 0, linked = 0;
  [...document.styleSheets].forEach((sheet) => {
    try {
      const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = targetDoc.createElement("style");
      style.textContent = rules;
      targetDoc.head.appendChild(style);
      inline++;
    } catch {
      if (sheet.href) {
        const link = targetDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
        linked++;
      }
    }
  });
  log(`styles copiados: ${inline} inline, ${linked} linked`);
}

function probeWindowKind(win, expected) {
  // La forma más confiable de saber si es PiP real
  const isPiP = win.matchMedia("(display-mode: picture-in-picture)").matches;
  const isStandalone = win.matchMedia("(display-mode: standalone)").matches;
  const isBrowser = win.matchMedia("(display-mode: browser)").matches;
  log(`display-mode → picture-in-picture:${isPiP} standalone:${isStandalone} browser:${isBrowser}`);
  log(`inner: ${win.innerWidth}×${win.innerHeight} · screen avail: ${win.screen.availWidth}×${win.screen.availHeight}`);
  log(`outer (si disponible): ${win.outerWidth}×${win.outerHeight}`);
  if (expected === "pip" && !isPiP) {
    log("⚠️ se abrió pero NO reporta display-mode PiP (probablemente Arc u otro shell la trata como ventana normal)", "err");
  } else if (expected === "pip" && isPiP) {
    log("✔️ es una ventana PiP real (always-on-top según spec)", "ok");
  } else if (expected === "popup" && isBrowser) {
    log("✔️ popup normal (no always-on-top)", "ok");
  }
}

// --- Media Session setup (opcional, para PiP estilo Meet) ------------------
async function primeMediaSession(data) {
  const audio = $("#silent-audio");
  try {
    await audio.play();
    log(`audio silencioso reproduciendo (paused=${audio.paused})`, "ok");
  } catch (err) {
    log(`audio.play() falló: ${err.message} — seguimos igual`, "err");
  }
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: data.title,
      artist: "PiP POC",
    });
    navigator.mediaSession.playbackState = "playing";
    const register = (action, fn) => {
      try { navigator.mediaSession.setActionHandler(action, fn); }
      catch { /* ignorar acciones no soportadas */ }
    };
    register("play", () => audio.play());
    register("pause", () => audio.pause());
  }
  return audio;
}

// --- Opener unificado ------------------------------------------------------
// Construye un nodo fresco de tutorial, abre una ventana (PiP o popup) y
// mete el nodo adentro. `mode`: "pip" (Document PiP simple), "pip-meet"
// (Document PiP + audio/MediaSession), "popup" (window.open).
async function openWindowWith(data, mode) {
  // Si ya hay una ventana abierta, swapeamos el contenido en vez de abrir
  // otra. Más rápido y no rompe el always-on-top.
  if (floatingWin && !floatingWin.closed) {
    log(`swap de contenido → "${data.title}" en la ventana existente`, "evt");
    const node = buildTutorialNode(data);
    floatingWin.document.body.replaceChildren(node);
    floatingWin.document.title = data.title;
    floatingWin.focus?.();
    return;
  }

  const node = buildTutorialNode(data);
  let audio = null;

  if (mode === "pip" || mode === "pip-meet") {
    if (!("documentPictureInPicture" in window)) {
      supportWarning.hidden = false;
      log(`${mode}: API no disponible`, "err");
      return;
    }
    if (mode === "pip-meet") audio = await primeMediaSession(data);

    try {
      log(`requestWindow (${mode}) para "${data.title}"…`, "evt");
      floatingWin = await window.documentPictureInPicture.requestWindow({
        width: 380,
        height: Math.min(window.screen.availHeight - 120, 780),
        // Sin preferInitialWindowPlacement: así el browser recuerda dónde
        // estaba la PiP la última vez. Arrastrala una vez a la derecha y
        // en las próximas aperturas va a volver ahí sola.
      });
      floatingKind = mode;
      log("requestWindow resolvió", "ok");
    } catch (err) {
      log(`requestWindow falló: ${err.name}: ${err.message}`, "err");
      floatingWin = null;
      return;
    }
  } else if (mode === "popup") {
    const w = 380;
    const h = Math.min(window.screen.availHeight, 800);
    const left = window.screen.availWidth - w;
    const features = `popup=yes,width=${w},height=${h},left=${left},top=0`;
    log(`window.open features="${features}" para "${data.title}"`, "evt");
    floatingWin = window.open("about:blank", `pip-poc-${Date.now()}`, features);
    if (!floatingWin) {
      log("window.open devolvió null (popup blocker?)", "err");
      return;
    }
    floatingKind = "popup";
    floatingWin.document.open();
    floatingWin.document.write(`<!doctype html><html><head><title>${data.title}</title></head><body></body></html>`);
    floatingWin.document.close();
  }

  copyStylesTo(floatingWin.document);
  floatingWin.document.title = data.title;
  floatingWin.document.body.append(node);

  setTimeout(() => probeWindowKind(floatingWin, mode === "popup" ? "popup" : "pip"), 50);

  floatingWin.addEventListener("resize", () => {
    log(`resize: ${floatingWin.innerWidth}×${floatingWin.innerHeight}`, "evt");
  });

  const cleanup = () => {
    log("ventana cerrada → limpiando", "evt");
    floatingWin = null;
    floatingKind = null;
    if (audio) audio.pause();
  };
  floatingWin.addEventListener("pagehide", cleanup);

  if (mode === "popup") {
    const poll = setInterval(() => {
      if (!floatingWin || floatingWin.closed) {
        clearInterval(poll);
        if (floatingWin) cleanup();
      }
    }, 500);
  }
}

function openPiP(data) { return openWindowWith(data, "pip"); }
function openPiPMeetStyle(data) { return openWindowWith(data, "pip-meet"); }
function openPopup(data) { return openWindowWith(data, "popup"); }

// --- init ------------------------------------------------------------------
if (!("documentPictureInPicture" in window)) {
  supportWarning.hidden = false;
  $("#pip-btn").disabled = true;
}
