const steps = [
  {
    title: "Paso 1 · Introducción",
    html: `
      <p>Bienvenido al tutorial de prueba. Esta ventana puede despegarse y
      quedar siempre visible encima de cualquier otra aplicación.</p>
      <p>Cuando estés listo, apretá <strong>Siguiente</strong>.</p>
    `,
  },
  {
    title: "Paso 2 · Desarrollo",
    html: `
      <p>Ahora cambiá a otra tab o ventana. La ventanita flotante debería
      seguirte y mantenerse encima.</p>
      <p>Probá redimensionarla, moverla, y usar los botones de Anterior /
      Siguiente desde adentro.</p>
    `,
  },
  {
    title: "Paso 3 · Conclusión",
    html: `
      <p>Eso es todo. Cerrá la ventanita (o volvé a la tab original) y el
      tutorial va a volver a su lugar.</p>
      <p>✅ POC funcionando.</p>
    `,
  },
];

let current = 0;
let floatingWin = null;
let floatingKind = null; // "pip" | "popup"

const $ = (sel, root = document) => root.querySelector(sel);
const host = $("#host");
const tutorial = $("#tutorial");
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
function render() {
  $("#step-title", tutorial).textContent = steps[current].title;
  $("#step-body", tutorial).innerHTML = steps[current].html;
  $("#step-indicator", tutorial).textContent = `${current + 1} / ${steps.length}`;
  $("#prev-btn", tutorial).disabled = current === 0;
  $("#next-btn", tutorial).disabled = current === steps.length - 1;
}

tutorial.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.id === "prev-btn" && current > 0) { current--; render(); log(`step → ${current + 1}`, "evt"); }
  if (t.id === "next-btn" && current < steps.length - 1) { current++; render(); log(`step → ${current + 1}`, "evt"); }
  if (t.id === "pip-btn") openPiP();
  if (t.id === "popup-btn") openPopup();
  if (t.id === "pip-meet-btn") openPiPMeetStyle();
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

function attachCloseHandler(win, evtName) {
  win.addEventListener(evtName, () => {
    log(`evento '${evtName}' → restaurando tutorial al host`, "evt");
    host.append(tutorial);
    floatingWin = null;
    floatingKind = null;
  });
}

// --- Document PiP ----------------------------------------------------------
async function openPiP() {
  if (!("documentPictureInPicture" in window)) {
    supportWarning.hidden = false;
    log("openPiP: API no disponible", "err");
    return;
  }
  if (floatingWin) { log("ya hay una ventana flotante abierta"); floatingWin.focus?.(); return; }

  try {
    log("llamando a documentPictureInPicture.requestWindow(...)", "evt");
    floatingWin = await window.documentPictureInPicture.requestWindow({
      width: 380,
      height: Math.min(window.screen.availHeight - 120, 780),
      preferInitialWindowPlacement: true,
    });
    floatingKind = "pip";
    log("requestWindow resolvió: ventana creada", "ok");

    copyStylesTo(floatingWin.document);
    floatingWin.document.title = "Tutorial";
    floatingWin.document.body.append(tutorial);

    // pequeño delay para que el display-mode se estabilice
    setTimeout(() => probeWindowKind(floatingWin, "pip"), 50);

    floatingWin.addEventListener("resize", () => {
      log(`resize: ${floatingWin.innerWidth}×${floatingWin.innerHeight}`, "evt");
    });
    attachCloseHandler(floatingWin, "pagehide");
  } catch (err) {
    log(`requestWindow falló: ${err.name}: ${err.message}`, "err");
    floatingWin = null;
  }
}

// --- PiP "estilo Meet": audio + Media Session ------------------------------
// Hipótesis: Arc mantiene la PiP always-on-top solo cuando la tab es tratada
// como una "media app" (Meet lo logra con getUserMedia; acá lo intentamos con
// un <audio> silencioso en loop + handlers de Media Session registrados
// ANTES de llamar a requestWindow).
async function openPiPMeetStyle() {
  if (!("documentPictureInPicture" in window)) {
    log("openPiPMeetStyle: API no disponible", "err");
    return;
  }
  if (floatingWin) { log("ya hay una ventana flotante abierta"); return; }

  const audio = $("#silent-audio");
  try {
    await audio.play();
    log(`audio silencioso reproduciendo (paused=${audio.paused})`, "ok");
  } catch (err) {
    log(`audio.play() falló: ${err.message} — seguimos igual`, "err");
  }

  // Metadata ayuda a que el browser considere la tab como media app
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Tutorial",
      artist: "PiP POC",
    });
    navigator.mediaSession.playbackState = "playing";

    const register = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
        log(`mediaSession action registrada: ${action}`, "ok");
      } catch {
        log(`mediaSession action no soportada: ${action}`);
      }
    };
    register("play", () => audio.play());
    register("pause", () => audio.pause());
    register("previoustrack", () => { if (current > 0) { current--; render(); } });
    register("nexttrack", () => { if (current < steps.length - 1) { current++; render(); } });
    // previousslide/nextslide son las "correctas" para este caso de uso
    register("previousslide", () => { if (current > 0) { current--; render(); } });
    register("nextslide", () => { if (current < steps.length - 1) { current++; render(); } });
    register("enterpictureinpicture", () => openPiPMeetStyle());
  }

  try {
    log("requestWindow con tab marcada como media app…", "evt");
    floatingWin = await window.documentPictureInPicture.requestWindow({
      width: 380,
      height: Math.min(window.screen.availHeight - 120, 780),
      preferInitialWindowPlacement: true,
    });
    floatingKind = "pip-meet";
    log("requestWindow resolvió", "ok");

    copyStylesTo(floatingWin.document);
    floatingWin.document.title = "Tutorial";
    floatingWin.document.body.append(tutorial);

    setTimeout(() => probeWindowKind(floatingWin, "pip"), 50);

    floatingWin.addEventListener("resize", () => {
      log(`resize: ${floatingWin.innerWidth}×${floatingWin.innerHeight}`, "evt");
    });
    floatingWin.addEventListener("pagehide", () => {
      log("pagehide → restaurando", "evt");
      host.append(tutorial);
      floatingWin = null;
      floatingKind = null;
      audio.pause();
    });
  } catch (err) {
    log(`requestWindow falló: ${err.name}: ${err.message}`, "err");
    floatingWin = null;
  }
}

// --- window.open fallback --------------------------------------------------
function openPopup() {
  if (floatingWin) { log("ya hay una ventana flotante abierta"); floatingWin.focus?.(); return; }

  const w = 380;
  const h = Math.min(window.screen.availHeight, 800);
  // window.open sí acepta left/top (son hints, cada navegador decide)
  const left = window.screen.availWidth - w;
  const top = 0;
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top}`;

  log(`llamando a window.open con features="${features}"`, "evt");
  floatingWin = window.open("about:blank", "pip-poc-popup", features);
  if (!floatingWin) {
    log("window.open devolvió null (bloqueado por popup blocker?)", "err");
    return;
  }
  floatingKind = "popup";
  log("window.open resolvió: ventana creada", "ok");

  // Preparar el documento de la ventana
  floatingWin.document.open();
  floatingWin.document.write(`<!doctype html><html><head><title>Tutorial</title></head><body></body></html>`);
  floatingWin.document.close();

  copyStylesTo(floatingWin.document);
  floatingWin.document.body.append(tutorial);

  setTimeout(() => probeWindowKind(floatingWin, "popup"), 50);

  floatingWin.addEventListener("resize", () => {
    log(`resize: ${floatingWin.innerWidth}×${floatingWin.innerHeight}`, "evt");
  });
  // Detectar cierre: pagehide en la propia ventana + polling como red de seguridad
  attachCloseHandler(floatingWin, "pagehide");
  const poll = setInterval(() => {
    if (!floatingWin || floatingWin.closed) {
      clearInterval(poll);
      if (floatingWin) {
        log("popup cerrado (polling) → restaurando tutorial", "evt");
        host.append(tutorial);
        floatingWin = null;
        floatingKind = null;
      }
    }
  }, 500);
}

// --- init ------------------------------------------------------------------
if (!("documentPictureInPicture" in window)) {
  supportWarning.hidden = false;
  $("#pip-btn").disabled = true;
}

render();
