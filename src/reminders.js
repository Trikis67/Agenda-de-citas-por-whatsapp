/**
 * Recordatorios automáticos: cada 10 minutos revisa qué citas empiezan dentro de
 * las próximas N horas (HORAS_RECORDATORIO) y le manda el recordatorio al cliente.
 */
const cron = require('node-cron');
const { DateTime } = require('luxon');
const config = require('./config');
const store = require('./store');
const calendar = require('./calendar');
const wa = require('./whatsapp');
const { fmtDia, fmtHora, desdeISO } = require('./bot');

async function revisarRecordatorios({ forzar = false } = {}) {
  const limite = DateTime.now().plus({ hours: config.recordatorio.horasAntes });
  const pendientes = store
    .citasPendientesDeRecordatorio()
    .filter((c) => forzar || DateTime.fromISO(c.inicio) <= limite);

  for (const cita of pendientes) {
    try {
      // Si el encargado borró la cita directamente en Google Calendar, no se recuerda
      if (!(await calendar.eventoExiste(cita.eventoId))) {
        store.actualizarCita(cita.id, { estado: 'cancelada', canceladaEn: new Date().toISOString(), motivo: 'borrada en calendario' });
        continue;
      }
      const inicio = desdeISO(cita.inicio);
      await wa.enviarAviso(cita.telefono, {
        plantilla: config.whatsapp.plantillas.recordatorio,
        // Orden de las variables {{1}}..{{5}} en la plantilla de Meta
        parametros: [cita.nombre, cita.servicio, fmtDia(inicio), fmtHora(inicio), config.negocio.nombre],
        textoAlternativo:
          `⏰ *Recordatorio de cita*\n\nHola ${cita.nombre}, te recordamos tu cita de *${cita.servicio}* ` +
          `el ${fmtDia(inicio)} a las ${fmtHora(inicio)} en ${config.negocio.nombre}.\n📍 ${config.negocio.direccion}\n\n` +
          'Responde *CONFIRMAR* para confirmar o *CANCELAR* si no puedes asistir.',
      });
      store.actualizarCita(cita.id, { recordatorioEnviado: true, recordatorioEnviadoEn: new Date().toISOString() });
      console.log(`[recordatorios] Enviado a +${cita.telefono} (${cita.nombre})`);
    } catch (err) {
      console.error(`[recordatorios] Error con la cita ${cita.id}:`, err.message);
    }
  }
}

function iniciarRecordatorios() {
  cron.schedule('*/10 * * * *', () => revisarRecordatorios(), { timezone: config.negocio.zonaHoraria });
  console.log(`[recordatorios] Activos: se envían ${config.recordatorio.horasAntes} h antes de cada cita.`);
  revisarRecordatorios();
}

module.exports = { iniciarRecordatorios, revisarRecordatorios };
