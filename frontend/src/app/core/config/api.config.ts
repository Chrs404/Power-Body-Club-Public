/**
 * URL base delle API.
 *
 * ---------------------------------------------------------------------------
 * DA MODIFICARE PRIMA DI GENERARE L'APK ANDROID
 * ---------------------------------------------------------------------------
 * Dentro un'app installata non esiste un "server da cui provengo": il
 * contenuto e' locale al telefono, quindi un indirizzo relativo o
 * "localhost" punterebbero al telefono stesso. Serve l'indirizzo completo
 * del backend, raggiungibile dalla rete del telefono.
 *
 * Esempi validi:
 *   'https://gym-backend.onrender.com/api'   backend online (consigliato)
 *   'https://qualcosa.trycloudflare.com/api' tunnel verso il PC di casa
 *   'http://192.168.1.50:3000/api'           solo sulla stessa rete Wi-Fi
 */
const API_URL_APP = 'https://power-body-club.onrender.com/api';

/**
 * Fuori dall'app installata l'indirizzo viene riconosciuto da solo:
 *
 * 1. SVILUPPO — server Angular sulla 4200, backend sulla 3000.
 *    Viene usato lo stesso host della pagina, non "localhost":
 *    aprendo dal telefono, "localhost" sarebbe il telefono.
 *
 * 2. ORIGINE SINGOLA — app compilata servita dal backend stesso:
 *    basta un percorso relativo.
 *
 * 3. HOSTING SEPARATO (Vercel, Netlify) — il frontend sta su un dominio
 *    e il backend su un altro. Qui il percorso relativo non funziona:
 *    punterebbe al dominio del frontend, dove non c'e' alcuna API.
 *    La richiesta finisce sulla regola di riscrittura, viene servito
 *    index.html, e un POST riceve 405 "metodo non consentito".
 */
const DEV_SERVER_PORTS = ['4200', '8100'];
const BACKEND_PORT = 3000;

/** Vero quando il codice gira dentro un'app Capacitor, non in un browser. */
function isNativeApp(): boolean {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return w.Capacitor?.isNativePlatform?.() === true;
}

function resolveApiBaseUrl(): string {
  if (isNativeApp()) {
    return API_URL_APP;
  }

  const { protocol, hostname, port } = window.location;

  if (DEV_SERVER_PORTS.includes(port)) {
    return `${protocol}//${hostname}:${BACKEND_PORT}/api`;
  }

  /*
   * Se il frontend e' servito da un dominio diverso dal backend, il
   * percorso relativo non basta: serve l'indirizzo assoluto, lo stesso
   * usato dall'app installata.
   *
   * Il riconoscimento e' per esclusione: gli host che NON servono anche
   * l'API sono quelli delle piattaforme di hosting statico.
   */
  const HOST_SOLO_FRONTEND = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev'];
  if (HOST_SOLO_FRONTEND.some((h) => hostname.endsWith(h))) {
    return API_URL_APP;
  }

  return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
