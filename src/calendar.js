/**
 * Conexión con Google Calendar.
 * Si no hay archivo de credenciales, usa un calendario simulado en memoria
 * para poder probar el bot sin configurar Google.
 */
const fs = require('fs');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const config = require('./config');

const zona = () => config.negocio.zonaHoraria;

// ---------- Calendario simulado ----------
const eventosSimulados = new Map(); // id -> { calendarId, inicio, fin, resumen }

const simulado = {
  async ocupados(calendarId, desde, hasta) {
    return [...eventosSimulados.values()]
      .filter((e) => e.calendarId === calendarId && e.inicio < hasta && e.fin > desde)
      .map((e) => ({ inicio: e.inicio, fin: e.fin }));
  },
  async crearEvento({ calendarId, resumen, inicio, fin }) {
    const id = crypto.randomUUID();
    eventosSimulados.set(id, { calendarId, resumen, inicio, fin });
    return id;
  },
  async eliminarEvento(calendarId, id) {
    eventosSimulados.delete(id);
  },
  async eventoExiste(calendarId, id) {
    return eventosSimulados.has(id);
  },
};

// ---------- Google Calendar real ----------
function crearClienteGoogle() {
  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    keyFile: config.google.credentialsFile,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const cal = google.calendar({ version: 'v3', auth });

  return {
    async ocupados(calendarId, desde, hasta) {
      const res = await cal.freebusy.query({
        requestBody: {
          timeMin: desde.toISO(),
          timeMax: hasta.toISO(),
          timeZone: zona(),
          items: [{ id: calendarId }],
        },
      });
      const info = res.data.calendars?.[calendarId];
      if (info?.errors?.length) {
        throw new Error(
          `No se pudo leer el calendario ${calendarId}: ${info.errors.map((e) => e.reason).join(', ')}. ` +
            '¿Lo compartiste con el correo de la cuenta de servicio?'
        );
      }
      return (info?.busy || []).map((b) => ({
        inicio: DateTime.fromISO(b.start, { zone: zona() }),
        fin: DateTime.fromISO(b.end, { zone: zona() }),
      }));
    },

    async crearEvento({ calendarId, resumen, descripcion, inicio, fin }) {
      const res = await cal.events.insert({
        calendarId,
        requestBody: {
          summary: resumen,
          description: descripcion,
          start: { dateTime: inicio.toISO(), timeZone: zona() },
          end: { dateTime: fin.toISO(), timeZone: zona() },
          reminders: { useDefault: true },
        },
      });
      return res.data.id;
    },

    async eliminarEvento(calendarId, id) {
      try {
        await cal.events.delete({ calendarId, eventId: id });
      } catch (err) {
        if (err.code !== 404 && err.code !== 410) throw err; // ya estaba borrado
      }
    },

    async eventoExiste(calendarId, id) {
      try {
        const res = await cal.events.get({ calendarId, eventId: id });
        return res.data.status !== 'cancelled';
      } catch (err) {
        if (err.code === 404 || err.code === 410) return false;
        throw err;
      }
    },
  };
}

const hayCredenciales =
  config.google.credentialsFile && fs.existsSync(config.google.credentialsFile) && config.encargado.calendarId;

const cliente = hayCredenciales ? crearClienteGoogle() : simulado;
if (!hayCredenciales) {
  console.warn('[calendar] Sin credenciales de Google: usando calendario SIMULADO en memoria.');
}
if (!config.encargado.calendarId) config.encargado.calendarId = 'simulado';

// ---------- Lógica de horarios ----------

/** Devuelve los próximos días laborales (DateTime al inicio del día). */
function proximosDiasLaborales() {
  const { diasLaborales, diasAMostrar, cierre } = config.horario;
  const dias = [];
  let dia = DateTime.now().setZone(zona()).startOf('day');
  // Si ya pasó la hora de cierre de hoy, empezamos mañana
  const [hC, mC] = cierre.split(':').map(Number);
  if (DateTime.now().setZone(zona()) >= dia.set({ hour: hC, minute: mC })) dia = dia.plus({ days: 1 });

  while (dias.length < diasAMostrar) {
    if (diasLaborales.includes(dia.weekday)) dias.push(dia);
    dia = dia.plus({ days: 1 });
  }
  return dias;
}

/** Horarios libres de un día para un servicio con cierta duración. */
async function horariosLibres(dia, duracionMin) {
  const { apertura, cierre, intervaloMinutos, anticipacionMinimaHoras } = config.horario;
  const [hA, mA] = apertura.split(':').map(Number);
  const [hC, mC] = cierre.split(':').map(Number);
  const inicioDia = dia.set({ hour: hA, minute: mA, second: 0, millisecond: 0 });
  const finDia = dia.set({ hour: hC, minute: mC, second: 0, millisecond: 0 });
  const minimo = DateTime.now().setZone(zona()).plus({ hours: anticipacionMinimaHoras });

  const ocupados = await cliente.ocupados(config.encargado.calendarId, inicioDia, finDia);

  const libres = [];
  for (let s = inicioDia; s.plus({ minutes: duracionMin }) <= finDia; s = s.plus({ minutes: intervaloMinutos })) {
    const f = s.plus({ minutes: duracionMin });
    if (s < minimo) continue;
    const choca = ocupados.some((o) => s < o.fin && f > o.inicio);
    if (!choca) libres.push(s);
  }
  return libres;
}

/** ¿Sigue libre este horario? (se revisa justo antes de crear la cita) */
async function horarioSigueLibre(inicio, duracionMin) {
  const fin = inicio.plus({ minutes: duracionMin });
  const ocupados = await cliente.ocupados(config.encargado.calendarId, inicio, fin);
  return !ocupados.some((o) => inicio < o.fin && fin > o.inicio);
}

module.exports = {
  proximosDiasLaborales,
  horariosLibres,
  horarioSigueLibre,
  crearEvento: (datos) => cliente.crearEvento({ calendarId: config.encargado.calendarId, ...datos }),
  eliminarEvento: (id) => cliente.eliminarEvento(config.encargado.calendarId, id),
  eventoExiste: (id) => cliente.eventoExiste(config.encargado.calendarId, id),
  usandoSimulado: !hayCredenciales,
};
