/**
 * Lógica del bot con menú numerado.
 * Cada cliente tiene un "paso" guardado en su sesión; según el paso se interpreta su respuesta.
 */
const crypto = require('crypto');
const { DateTime } = require('luxon');
const config = require('./config');
const store = require('./store');
const calendar = require('./calendar');
const wa = require('./whatsapp');

const zona = () => config.negocio.zonaHoraria;
const MINUTOS_EXPIRA_SESION = 30;

// ---------- Utilidades de formato ----------
const fmtDia = (dt) => {
  const s = dt.setZone(zona()).setLocale('es').toFormat("cccc d 'de' LLLL");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtHora = (dt) => dt.setZone(zona()).toFormat('h:mm a').replace('AM', 'a. m.').replace('PM', 'p. m.');
const fmtFechaHora = (dt) => `${fmtDia(dt)} a las ${fmtHora(dt)}`;
const desdeISO = (iso) => DateTime.fromISO(iso, { zone: zona() });

const normalizar = (t) =>
  (t || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const lista = (items) => items.map((t, i) => `*${i + 1}.* ${t}`).join('\n');

/** Convierte "2", "2." o " 2 " en el índice 1. Devuelve -1 si no es válido. */
function opcion(texto, total) {
  const n = parseInt(normalizar(texto), 10);
  return Number.isInteger(n) && n >= 1 && n <= total ? n - 1 : -1;
}

const PIE = '\n\n_Escribe *0* para volver al menú._';

// ---------- Textos ----------
function textoMenu(nombre) {
  const saludo = nombre ? `¡Hola, ${nombre}! 👋` : '¡Hola! 👋';
  return (
    `${saludo} Bienvenido a *${config.negocio.nombre}*.\n` +
    `Atendemos de ${config.horario.apertura} a ${config.horario.cierre}.\n\n` +
    '¿Qué deseas hacer?\n' +
    lista(['Agendar una cita', 'Ver mis citas', 'Cancelar una cita', 'Hablar con una persona']) +
    '\n\nResponde con el *número* de la opción.'
  );
}

// ---------- Avisos al encargado ----------
async function avisarEncargado(texto, parametrosPlantilla) {
  const tel = config.encargado.telefono;
  if (!tel) return;
  try {
    await wa.enviarAviso(tel, {
      plantilla: parametrosPlantilla ? config.whatsapp.plantillas.avisoEncargado : '',
      parametros: parametrosPlantilla,
      textoAlternativo: texto,
    });
  } catch (err) {
    console.error('[bot] No se pudo avisar al encargado:', err.message);
  }
}

// ---------- Manejador principal ----------
async function manejarMensaje({ de, texto, nombrePerfil }) {
  const enviar = (t) => wa.enviarTexto(de, t);
  const t = normalizar(texto);
  let sesion = store.obtenerSesion(de);

  // La sesión expira si el cliente deja la conversación a medias
  if (sesion.actualizado) {
    const minutos = (Date.now() - new Date(sesion.actualizado).getTime()) / 60000;
    if (minutos > MINUTOS_EXPIRA_SESION) sesion = { paso: 'inicio', datos: {} };
  }

  // Palabras clave que funcionan en cualquier momento
  if (['0', 'menu', 'hola', 'inicio', 'buenas', 'buenos dias', 'buenas tardes'].includes(t)) {
    sesion = { paso: 'inicio', datos: {} };
  } else if (t === 'cancelar' && sesion.paso !== 'nombre') {
    return mostrarCitasParaCancelar(de, enviar);
  } else if (t === 'confirmar' && sesion.paso !== 'nombre') {
    const proximas = store.citasFuturasDe(de);
    if (proximas.length) {
      store.actualizarCita(proximas[0].id, { confirmadaPorCliente: true });
      return enviar(`¡Gracias por confirmar! ✅ Te esperamos el ${fmtFechaHora(desdeISO(proximas[0].inicio))}`);
    }
  }

  const guardar = (paso, datos = sesion.datos) => store.guardarSesion(de, { paso, datos });

  switch (sesion.paso) {
    case 'inicio': {
      guardar('menu', { nombrePerfil });
      return enviar(textoMenu(nombrePerfil));
    }

    case 'menu': {
      const op = opcion(t, 4);
      if (op === 0) return pedirServicio(de, enviar, sesion.datos);
      if (op === 1) return mostrarMisCitas(de, enviar);
      if (op === 2) return mostrarCitasParaCancelar(de, enviar);
      if (op === 3) {
        store.borrarSesion(de);
        await avisarEncargado(`📞 El cliente +${de} (${nombrePerfil || 'sin nombre'}) pidió hablar con una persona.`);
        return enviar('Listo, avisamos a nuestro equipo. Una persona te escribirá pronto por este chat. 🙌');
      }
      return enviar('No entendí tu respuesta. 🤔\n\n' + textoMenu());
    }

    case 'servicio': {
      const op = opcion(t, config.servicios.length);
      if (op < 0) return enviar('Por favor responde con el número del servicio.' + PIE);
      const servicio = config.servicios[op];
      const dias = calendar.proximosDiasLaborales();
      guardar('dia', { ...sesion.datos, servicioId: servicio.id, dias: dias.map((d) => d.toISODate()) });
      return enviar(
        `Elegiste: *${servicio.nombre}* (${servicio.duracion} min).\n\n¿Qué día te queda mejor?\n` +
          lista(dias.map(fmtDia)) +
          PIE
      );
    }

    case 'dia': {
      const dias = sesion.datos.dias || [];
      const op = opcion(t, dias.length);
      if (op < 0) return enviar('Por favor responde con el número del día.' + PIE);
      const servicio = config.servicios.find((s) => s.id === sesion.datos.servicioId);
      const dia = DateTime.fromISO(dias[op], { zone: zona() });
      const libres = await calendar.horariosLibres(dia, servicio.duracion);
      if (!libres.length) {
        return enviar(`😕 No quedan horarios libres el ${fmtDia(dia)}. Elige otro día:\n` + lista(dias.map((d) => fmtDia(desdeISO(d)))) + PIE);
      }
      guardar('hora', { ...sesion.datos, dia: dias[op], horarios: libres.map((h) => h.toISO()) });
      return enviar(`Horarios disponibles el *${fmtDia(dia)}*:\n` + lista(libres.map(fmtHora)) + PIE);
    }

    case 'hora': {
      const horarios = sesion.datos.horarios || [];
      const op = opcion(t, horarios.length);
      if (op < 0) return enviar('Por favor responde con el número del horario.' + PIE);
      guardar('nombre', { ...sesion.datos, inicio: horarios[op] });
      const sugerencia = sesion.datos.nombrePerfil
        ? `\n\nResponde *1* para usar "${sesion.datos.nombrePerfil}" o escribe otro nombre.`
        : '';
      return enviar('¿A nombre de quién agendamos la cita? ✍️' + sugerencia);
    }

    case 'nombre': {
      let nombre = (texto || '').trim();
      if (t === '1' && sesion.datos.nombrePerfil) nombre = sesion.datos.nombrePerfil;
      if (nombre.length < 2) return enviar('Por favor escribe tu nombre.');
      const servicio = config.servicios.find((s) => s.id === sesion.datos.servicioId);
      guardar('confirmar', { ...sesion.datos, nombre });
      return enviar(
        '📋 *Revisa tu cita:*\n\n' +
          `👤 Nombre: ${nombre}\n` +
          `💼 Servicio: ${servicio.nombre}\n` +
          `📅 Fecha: ${fmtDia(desdeISO(sesion.datos.inicio))}\n` +
          `🕐 Hora: ${fmtHora(desdeISO(sesion.datos.inicio))}\n` +
          `📍 ${config.negocio.direccion}\n\n` +
          lista(['Confirmar', 'Cancelar'])
      );
    }

    case 'confirmar': {
      const op = opcion(t, 2);
      if (op === 1) {
        store.borrarSesion(de);
        return enviar('Cita no agendada. Escribe *hola* cuando quieras empezar de nuevo.');
      }
      if (op !== 0) return enviar('Responde *1* para confirmar o *2* para cancelar.');
      return crearCita(de, enviar, sesion.datos);
    }

    case 'cancelar': {
      const ids = sesion.datos.citas || [];
      const op = opcion(t, ids.length);
      if (op < 0) return enviar('Por favor responde con el número de la cita que quieres cancelar.' + PIE);
      return cancelarCita(de, enviar, ids[op]);
    }

    default:
      guardar('menu');
      return enviar(textoMenu());
  }
}

// ---------- Acciones ----------
function pedirServicio(de, enviar, datos) {
  store.guardarSesion(de, { paso: 'servicio', datos });
  return enviar(
    '¿Qué servicio necesitas?\n' + lista(config.servicios.map((s) => `${s.nombre} (${s.duracion} min)`)) + PIE
  );
}

async function crearCita(de, enviar, datos) {
  const servicio = config.servicios.find((s) => s.id === datos.servicioId);
  const inicio = desdeISO(datos.inicio);
  const fin = inicio.plus({ minutes: servicio.duracion });

  // Alguien pudo haber tomado el horario mientras el cliente respondía
  if (!(await calendar.horarioSigueLibre(inicio, servicio.duracion))) {
    store.guardarSesion(de, { paso: 'servicio', datos: { nombrePerfil: datos.nombrePerfil } });
    return enviar('😕 Lo sentimos, ese horario se acaba de ocupar. Elige el servicio de nuevo para ver otros horarios:\n' +
      lista(config.servicios.map((s) => `${s.nombre} (${s.duracion} min)`)));
  }

  const eventoId = await calendar.crearEvento({
    resumen: `${servicio.nombre} - ${datos.nombre}`,
    descripcion: `Cliente: ${datos.nombre}\nWhatsApp: +${de}\nServicio: ${servicio.nombre}\nAgendada por el bot de WhatsApp.`,
    inicio,
    fin,
  });

  // Si la cita es para muy pronto no hace falta el recordatorio de "mañana"
  const horasHastaCita = inicio.diffNow('hours').hours;
  const cita = store.agregarCita({
    id: crypto.randomUUID(),
    eventoId,
    telefono: de,
    nombre: datos.nombre,
    servicioId: servicio.id,
    servicio: servicio.nombre,
    inicio: inicio.toUTC().toISO(),
    fin: fin.toUTC().toISO(),
    estado: 'confirmada',
    recordatorioEnviado: horasHastaCita <= config.recordatorio.horasAntes,
    creada: new Date().toISOString(),
  });
  store.borrarSesion(de);

  await avisarEncargado(
    `🆕 *Nueva cita*\n👤 ${cita.nombre} (+${de})\n💼 ${cita.servicio}\n📅 ${fmtFechaHora(inicio)}`,
    [cita.nombre, cita.servicio, fmtDia(inicio), fmtHora(inicio), `+${de}`]
  );

  return enviar(
    `✅ *¡Cita agendada!*\n\n${cita.servicio}\n📅 ${fmtFechaHora(inicio)}\n📍 ${config.negocio.direccion}\n\n` +
      `Te enviaremos un recordatorio antes de tu cita. Si necesitas cancelar escribe *cancelar*.`
  );
}

function mostrarMisCitas(de, enviar) {
  store.borrarSesion(de);
  const citas = store.citasFuturasDe(de);
  if (!citas.length) return enviar('No tienes citas próximas. Escribe *hola* para agendar una.');
  return enviar(
    '📅 *Tus próximas citas:*\n\n' +
      citas.map((c) => `• ${c.servicio} — ${fmtFechaHora(desdeISO(c.inicio))}`).join('\n') +
      PIE
  );
}

function mostrarCitasParaCancelar(de, enviar) {
  const citas = store.citasFuturasDe(de);
  if (!citas.length) {
    store.borrarSesion(de);
    return enviar('No tienes citas próximas para cancelar. Escribe *hola* para ver el menú.');
  }
  store.guardarSesion(de, { paso: 'cancelar', datos: { citas: citas.map((c) => c.id) } });
  return enviar(
    '¿Qué cita quieres cancelar?\n' +
      lista(citas.map((c) => `${c.servicio} — ${fmtFechaHora(desdeISO(c.inicio))}`)) +
      PIE
  );
}

async function cancelarCita(de, enviar, citaId) {
  const cita = store.citasFuturasDe(de).find((c) => c.id === citaId);
  store.borrarSesion(de);
  if (!cita) return enviar('Esa cita ya no está activa. Escribe *hola* para ver el menú.');

  await calendar.eliminarEvento(cita.eventoId);
  store.actualizarCita(cita.id, { estado: 'cancelada', canceladaEn: new Date().toISOString() });

  const inicio = desdeISO(cita.inicio);
  await avisarEncargado(`❌ *Cita cancelada*\n👤 ${cita.nombre} (+${de})\n💼 ${cita.servicio}\n📅 ${fmtFechaHora(inicio)}`);
  return enviar(`Tu cita del ${fmtFechaHora(inicio)} fue cancelada. ❌\nEscribe *hola* si quieres agendar otra.`);
}

module.exports = { manejarMensaje, fmtDia, fmtHora, fmtFechaHora, desdeISO };
