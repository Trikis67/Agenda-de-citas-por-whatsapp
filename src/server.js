/**
 * Servidor web que recibe los mensajes de WhatsApp (webhook de Meta).
 */
const express = require('express');
const config = require('./config');
const wa = require('./whatsapp');
const { manejarMensaje } = require('./bot');
const { iniciarRecordatorios } = require('./reminders');

const app = express();
// Guardamos el cuerpo "crudo" para poder validar la firma de Meta
app.use(express.json({ verify: (req, _res, buf) => (req.rawBody = buf) }));

app.get('/', (_req, res) => res.send('Bot de citas funcionando ✅'));

// 1) Meta verifica el webhook una sola vez al configurarlo
app.get('/webhook', (req, res) => {
  const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (modo === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('[webhook] Verificado por Meta');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta puede reenviar el mismo mensaje; evitamos procesarlo dos veces
const procesados = new Set();
// Procesamos los mensajes de cada cliente en orden
const colas = new Map();

function encolar(telefono, tarea) {
  const anterior = colas.get(telefono) || Promise.resolve();
  const siguiente = anterior.then(tarea).catch((err) => console.error('[bot] Error:', err));
  colas.set(telefono, siguiente);
  siguiente.finally(() => colas.get(telefono) === siguiente && colas.delete(telefono));
}

// 2) Cada mensaje que llega al número de WhatsApp
app.post('/webhook', (req, res) => {
  if (!wa.firmaValida(req.rawBody, req.get('x-hub-signature-256'))) {
    console.warn('[webhook] Firma inválida, se ignora');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // respondemos rápido; Meta reintenta si tardamos

  for (const msg of wa.extraerMensajes(req.body)) {
    if (procesados.has(msg.id)) continue;
    procesados.add(msg.id);
    if (procesados.size > 5000) procesados.delete(procesados.values().next().value);

    console.log(`[webhook] +${msg.de}: ${msg.texto || `(${msg.tipo})`}`);
    encolar(msg.de, async () => {
      if (!msg.texto) {
        return wa.enviarTexto(msg.de, 'Por ahora solo entiendo mensajes de texto. Escribe *hola* para ver el menú.');
      }
      try {
        await manejarMensaje(msg);
      } catch (err) {
        console.error('[bot] Error procesando mensaje:', err);
        await wa.enviarTexto(msg.de, 'Ocurrió un error, por favor intenta de nuevo en unos minutos. 🙏').catch(() => {});
      }
    });
  }
});

app.listen(config.port, () => {
  console.log(`Servidor escuchando en http://localhost:${config.port}`);
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.warn('⚠️  Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en el archivo .env');
  }
  iniciarRecordatorios();
});
