/**
 * Envío de mensajes por la WhatsApp Cloud API (Meta).
 * En modo simulación los mensajes se imprimen en la consola en lugar de enviarse.
 */
const crypto = require('crypto');
const config = require('./config');

let modoSimulacion = false;
let salidaSimulada = (to, texto) => console.log(`\n[BOT -> ${to}]\n${texto}\n`);

function activarSimulacion(fnSalida) {
  modoSimulacion = true;
  if (fnSalida) salidaSimulada = fnSalida;
}

async function llamarApi(payload) {
  const { apiVersion, phoneNumberId, token } = config.whatsapp;
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    throw new Error(`WhatsApp API ${res.status}: ${msg}`);
  }
  return data;
}

/** Mensaje de texto normal (solo funciona dentro de las 24 h desde el último mensaje del usuario). */
async function enviarTexto(to, texto) {
  if (modoSimulacion) return salidaSimulada(to, texto);
  return llamarApi({ to, type: 'text', text: { preview_url: false, body: texto } });
}

/**
 * Mensaje con plantilla aprobada por Meta (necesario para escribirle primero a alguien,
 * por ejemplo los recordatorios). `parametros` reemplaza {{1}}, {{2}}, ... del cuerpo.
 */
async function enviarPlantilla(to, nombrePlantilla, parametros = []) {
  if (modoSimulacion) {
    return salidaSimulada(to, `(plantilla "${nombrePlantilla}") ${parametros.join(' | ')}`);
  }
  return llamarApi({
    to,
    type: 'template',
    template: {
      name: nombrePlantilla,
      language: { code: config.whatsapp.plantillas.idioma },
      components: parametros.length
        ? [{ type: 'body', parameters: parametros.map((p) => ({ type: 'text', text: String(p) })) }]
        : [],
    },
  });
}

/**
 * Envía con plantilla si está configurada; si no, como texto normal.
 * Útil para avisos que el bot inicia (recordatorios, aviso al encargado).
 */
async function enviarAviso(to, { plantilla, parametros, textoAlternativo }) {
  if (plantilla) return enviarPlantilla(to, plantilla, parametros);
  return enviarTexto(to, textoAlternativo);
}

/** Verifica la firma X-Hub-Signature-256 que Meta añade a cada webhook. */
function firmaValida(rawBody, firmaHeader) {
  if (!config.whatsapp.appSecret) return true; // sin App Secret no se valida
  if (!firmaHeader) return false;
  const esperada =
    'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(firmaHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extrae los mensajes de texto entrantes del cuerpo del webhook. */
function extraerMensajes(body) {
  const mensajes = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contactos = value.contacts || [];
      for (const m of value.messages || []) {
        let texto = '';
        if (m.type === 'text') texto = m.text?.body || '';
        else if (m.type === 'button') texto = m.button?.text || '';
        else if (m.type === 'interactive') {
          texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        }
        const contacto = contactos.find((c) => c.wa_id === m.from);
        mensajes.push({
          id: m.id,
          de: m.from,
          nombrePerfil: contacto?.profile?.name || '',
          texto,
          tipo: m.type,
        });
      }
    }
  }
  return mensajes;
}

module.exports = {
  activarSimulacion,
  enviarTexto,
  enviarPlantilla,
  enviarAviso,
  firmaValida,
  extraerMensajes,
};
