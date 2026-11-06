/**
 * Genera las capturas de ejemplo del README (docs/img/*.svg).
 *   node scripts/generar-capturas.js
 * Los textos son los mismos que envía el bot (src/bot.js).
 */
const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, '..', 'docs', 'img');
const ANCHO = 380;
const MAX_BURBUJA = 290;
const FUENTE = 14;
const ALTO_LINEA = 19;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Ancho aproximado de un texto (emoji ~ 2 caracteres)
const largo = (s) => [...s.replace(/[*_]/g, '')].reduce((n, c) => n + (c.codePointAt(0) > 0x2000 ? 2 : 1), 0);

function envolver(texto, maxChars = 36) {
  const lineas = [];
  for (const parrafo of texto.split('\n')) {
    if (!parrafo) { lineas.push({ t: '', inicio: true }); continue; }
    let actual = '';
    let inicio = true;
    for (const palabra of parrafo.split(' ')) {
      const prueba = actual ? actual + ' ' + palabra : palabra;
      if (largo(prueba) > maxChars && actual) { lineas.push({ t: actual, inicio }); actual = palabra; inicio = false; }
      else actual = prueba;
    }
    lineas.push({ t: actual, inicio });
  }
  return lineas;
}

/**
 * Convierte *negrita* y _cursiva_ en <tspan>. `estado` se comparte entre las líneas
 * de una burbuja para que el formato continúe cuando el texto se parte en dos líneas.
 */
function formato(linea, estado) {
  let out = '';
  let trozo = '';
  const cerrar = () => {
    if (!trozo) return;
    const attrs = (estado.negrita ? ' font-weight="700"' : '') + (estado.cursiva ? ' font-style="italic" fill="#667781"' : '');
    out += attrs ? `<tspan${attrs}>${esc(trozo)}</tspan>` : esc(trozo);
    trozo = '';
  };
  for (const c of linea) {
    if (c === '*' || c === '_') {
      cerrar();
      if (c === '*') estado.negrita = !estado.negrita;
      else estado.cursiva = !estado.cursiva;
    } else trozo += c;
  }
  cerrar();
  return out;
}

function burbuja(msg, y) {
  const lineas = envolver(msg.texto);
  const anchoTexto = Math.min(MAX_BURBUJA - 24, Math.max(60, ...lineas.map((l) => largo(l.t) * 7.4)));
  const w = Math.max(anchoTexto + 24, 80);
  const h = lineas.length * ALTO_LINEA + 30;
  const esCliente = msg.de === 'cliente';
  const x = esCliente ? ANCHO - 14 - w : 14;
  const color = esCliente ? '#d9fdd3' : '#ffffff';
  let svg = `<g filter="url(#sombra)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${color}"/></g>`;
  const estado = { negrita: false, cursiva: false };
  lineas.forEach((l, i) => {
    if (l.inicio) estado.negrita = estado.cursiva = false; // cada renglón original empieza sin formato
    if (!l.t) return;
    svg += `<text x="${x + 12}" y="${y + 22 + i * ALTO_LINEA}" font-size="${FUENTE}" fill="#111b21">${formato(l.t, estado)}</text>`;
  });
  const hora = msg.hora + (esCliente ? '  ✓✓' : '');
  svg += `<text x="${x + w - 10}" y="${y + h - 8}" font-size="11" fill="${esCliente ? '#53bdeb' : '#667781'}" text-anchor="end">${hora}</text>`;
  return { svg, h };
}

function telefono({ titulo, subtitulo, iniciales, mensajes, archivo }) {
  let y = 92;
  let cuerpo = '';
  for (const m of mensajes) {
    if (m.separador) {
      cuerpo += `<rect x="${ANCHO / 2 - 55}" y="${y}" width="110" height="24" rx="7" fill="#ffffff" opacity="0.9"/>` +
        `<text x="${ANCHO / 2}" y="${y + 16}" font-size="12" fill="#54656f" text-anchor="middle">${esc(m.separador)}</text>`;
      y += 36;
      continue;
    }
    const b = burbuja(m, y);
    cuerpo += b.svg;
    y += b.h + 10;
  }
  const alto = y + 70;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}" viewBox="0 0 ${ANCHO} ${alto}" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">
<defs>
  <filter id="sombra" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="0.6" flood-opacity="0.18"/></filter>
  <pattern id="fondo" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#efeae2"/><circle cx="8" cy="8" r="1.4" fill="#e2d9cc"/><circle cx="28" cy="26" r="1.4" fill="#e2d9cc"/></pattern>
  <clipPath id="pantalla"><rect width="${ANCHO}" height="${alto}" rx="28"/></clipPath>
</defs>
<g clip-path="url(#pantalla)">
  <rect width="${ANCHO}" height="${alto}" fill="url(#fondo)"/>
  <rect width="${ANCHO}" height="76" fill="#0f766e"/>
  <text x="18" y="47" font-size="22" fill="#ffffff">‹</text>
  <circle cx="58" cy="40" r="20" fill="#5eead4"/>
  <text x="58" y="46" font-size="15" font-weight="700" fill="#0f766e" text-anchor="middle">${esc(iniciales)}</text>
  <text x="88" y="36" font-size="16" font-weight="600" fill="#ffffff">${esc(titulo)}</text>
  <text x="88" y="56" font-size="12.5" fill="#ccfbf1">${esc(subtitulo)}</text>
  ${cuerpo}
  <rect y="${alto - 58}" width="${ANCHO}" height="58" fill="#f0f2f5"/>
  <rect x="12" y="${alto - 48}" width="${ANCHO - 76}" height="38" rx="19" fill="#ffffff"/>
  <text x="30" y="${alto - 24}" font-size="14" fill="#8696a0">Escribe un mensaje</text>
  <circle cx="${ANCHO - 32}" cy="${alto - 29}" r="20" fill="#0f766e"/>
  <path d="M ${ANCHO - 40} ${alto - 37} L ${ANCHO - 22} ${alto - 29} L ${ANCHO - 40} ${alto - 21} L ${ANCHO - 37} ${alto - 29} Z" fill="#ffffff"/>
</g>
<rect x="0.5" y="0.5" width="${ANCHO - 1}" height="${alto - 1}" rx="28" fill="none" stroke="#d1d7db"/>
</svg>`;
  fs.writeFileSync(path.join(SALIDA, archivo), svg);
  console.log('✔', archivo, `${ANCHO}x${alto}`);
}

// ---------- Conversaciones de ejemplo ----------
const BOT = { titulo: 'Mi Negocio', subtitulo: 'Bot de citas · en línea', iniciales: 'MN' };

fs.mkdirSync(SALIDA, { recursive: true });

telefono({
  ...BOT,
  archivo: '1-menu.svg',
  mensajes: [
    { separador: 'HOY' },
    { de: 'cliente', hora: '10:02', texto: 'Hola' },
    { de: 'bot', hora: '10:02', texto: '¡Hola, Ana! 👋 Bienvenido a *Mi Negocio*.\nAtendemos de 09:00 a 17:00.\n\n¿Qué deseas hacer?\n*1.* Agendar una cita\n*2.* Ver mis citas\n*3.* Cancelar una cita\n*4.* Hablar con una persona\n\nResponde con el *número* de la opción.' },
    { de: 'cliente', hora: '10:03', texto: '1' },
    { de: 'bot', hora: '10:03', texto: '¿Qué servicio necesitas?\n*1.* Consulta general (30 min)\n*2.* Servicio completo (60 min)\n*3.* Revisión / seguimiento (30 min)\n\n_Escribe *0* para volver al menú._' },
  ],
});

telefono({
  ...BOT,
  archivo: '2-horarios.svg',
  mensajes: [
    { de: 'cliente', hora: '10:03', texto: '2' },
    { de: 'bot', hora: '10:03', texto: 'Elegiste: *Servicio completo* (60 min).\n\n¿Qué día te queda mejor?\n*1.* Lunes 9 de noviembre\n*2.* Martes 10 de noviembre\n*3.* Miércoles 11 de noviembre\n*4.* Jueves 12 de noviembre\n*5.* Viernes 13 de noviembre' },
    { de: 'cliente', hora: '10:04', texto: '2' },
    { de: 'bot', hora: '10:04', texto: 'Horarios disponibles el *Martes 10 de noviembre*:\n*1.* 9:00 a. m.\n*2.* 9:30 a. m.\n*3.* 11:00 a. m.\n*4.* 11:30 a. m.\n*5.* 2:00 p. m.\n*6.* 3:30 p. m.' },
    { de: 'cliente', hora: '10:04', texto: '3' },
  ],
});

telefono({
  ...BOT,
  archivo: '3-confirmacion.svg',
  mensajes: [
    { de: 'bot', hora: '10:04', texto: '¿A nombre de quién agendamos la cita? ✍️\n\nResponde *1* para usar "Ana López" o escribe otro nombre.' },
    { de: 'cliente', hora: '10:05', texto: '1' },
    { de: 'bot', hora: '10:05', texto: '📋 *Revisa tu cita:*\n\n👤 Nombre: Ana López\n💼 Servicio: Servicio completo\n📅 Fecha: Martes 10 de noviembre\n🕐 Hora: 11:00 a. m.\n📍 Calle Principal #123\n\n*1.* Confirmar\n*2.* Cancelar' },
    { de: 'cliente', hora: '10:05', texto: '1' },
    { de: 'bot', hora: '10:05', texto: '✅ *¡Cita agendada!*\n\nServicio completo\n📅 Martes 10 de noviembre a las 11:00 a. m.\n📍 Calle Principal #123\n\nTe enviaremos un recordatorio antes de tu cita.' },
  ],
});

telefono({
  ...BOT,
  archivo: '4-recordatorio.svg',
  mensajes: [
    { separador: 'LUNES' },
    { de: 'bot', hora: '11:00', texto: '⏰ *Recordatorio de cita*\n\nHola Ana López, te recordamos tu cita de *Servicio completo* el Martes 10 de noviembre a las 11:00 a. m. en Mi Negocio.\n📍 Calle Principal #123\n\nResponde *CONFIRMAR* para confirmar o *CANCELAR* si no puedes asistir.' },
    { de: 'cliente', hora: '11:12', texto: 'Confirmar' },
    { de: 'bot', hora: '11:12', texto: '¡Gracias por confirmar! ✅ Te esperamos el Martes 10 de noviembre a las 11:00 a. m.' },
  ],
});

telefono({
  titulo: 'Bot de citas',
  subtitulo: 'Avisos para el encargado',
  iniciales: '🔔',
  archivo: '5-encargado.svg',
  mensajes: [
    { separador: 'HOY' },
    { de: 'bot', hora: '10:05', texto: '🆕 *Nueva cita*\n👤 Ana López (+502 5555 1234)\n💼 Servicio completo\n📅 Martes 10 de noviembre a las 11:00 a. m.' },
    { de: 'bot', hora: '13:40', texto: '🆕 *Nueva cita*\n👤 Carlos Pérez (+502 5555 9876)\n💼 Consulta general\n📅 Miércoles 11 de noviembre a las 9:30 a. m.' },
    { de: 'bot', hora: '16:18', texto: '❌ *Cita cancelada*\n👤 Carlos Pérez (+502 5555 9876)\n💼 Consulta general\n📅 Miércoles 11 de noviembre a las 9:30 a. m.' },
  ],
});
