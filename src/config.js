/**
 * CONFIGURACIÓN DEL NEGOCIO
 * Este es el único archivo que necesitas cambiar para adaptar el bot a otro negocio.
 */
require('dotenv').config();

const config = {
  negocio: {
    nombre: 'Mi Negocio',
    direccion: 'Calle Principal #123',
    zonaHoraria: process.env.ZONA_HORARIA || 'America/Guatemala',
  },

  // Horario de atención (formato 24 h)
  horario: {
    apertura: '09:00',
    cierre: '17:00',
    // 1 = lunes ... 7 = domingo
    diasLaborales: [1, 2, 3, 4, 5],
    // Cada cuántos minutos se ofrece un horario (09:00, 09:30, 10:00...)
    intervaloMinutos: 30,
    // No se puede agendar con menos de estas horas de anticipación
    anticipacionMinimaHoras: 2,
    // Cuántos días hacia adelante se muestran para elegir
    diasAMostrar: 7,
  },

  // Servicios que ofrece el negocio (duración en minutos)
  servicios: [
    { id: 'consulta', nombre: 'Consulta general', duracion: 30 },
    { id: 'servicio_completo', nombre: 'Servicio completo', duracion: 60 },
    { id: 'revision', nombre: 'Revisión / seguimiento', duracion: 30 },
  ],

  // Persona encargada que recibe el aviso de cada cita nueva
  encargado: {
    nombre: 'Encargado',
    telefono: process.env.TELEFONO_ENCARGADO || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || '',
  },

  recordatorio: {
    horasAntes: Number(process.env.HORAS_RECORDATORIO || 24),
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    plantillas: {
      recordatorio: process.env.TEMPLATE_RECORDATORIO || '',
      avisoEncargado: process.env.TEMPLATE_AVISO_ENCARGADO || '',
      idioma: process.env.TEMPLATE_IDIOMA || 'es',
    },
  },

  google: {
    credentialsFile: process.env.GOOGLE_CREDENTIALS_FILE || '',
  },

  port: Number(process.env.PORT || 3000),
};

module.exports = config;
