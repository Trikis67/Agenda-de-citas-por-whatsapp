/**
 * Almacenamiento simple en un archivo JSON (data/db.json).
 * Guarda las citas y el estado de la conversación de cada cliente.
 * Para un negocio con mucho volumen se puede cambiar por una base de datos real.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'data', 'db.json');

let db = { citas: [], sesiones: {} };
let enMemoria = false;

function cargar() {
  if (enMemoria) return;
  try {
    db = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    db.citas ||= [];
    db.sesiones ||= {};
  } catch {
    db = { citas: [], sesiones: {} };
  }
}

function guardar() {
  if (enMemoria) return;
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  const tmp = ARCHIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, ARCHIVO);
}

/** Para el simulador: no toca el archivo real. */
function usarSoloMemoria() {
  enMemoria = true;
  db = { citas: [], sesiones: {} };
}

// ---------- Sesiones (estado del menú) ----------
function obtenerSesion(telefono) {
  return db.sesiones[telefono] || { paso: 'inicio', datos: {} };
}

function guardarSesion(telefono, sesion) {
  db.sesiones[telefono] = { ...sesion, actualizado: new Date().toISOString() };
  guardar();
}

function borrarSesion(telefono) {
  delete db.sesiones[telefono];
  guardar();
}

// ---------- Citas ----------
function agregarCita(cita) {
  db.citas.push(cita);
  guardar();
  return cita;
}

function actualizarCita(id, cambios) {
  const cita = db.citas.find((c) => c.id === id);
  if (cita) Object.assign(cita, cambios);
  guardar();
  return cita;
}

function citasFuturasDe(telefono) {
  const ahora = new Date().toISOString();
  return db.citas
    .filter((c) => c.telefono === telefono && c.estado === 'confirmada' && c.inicio > ahora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function citasPendientesDeRecordatorio() {
  const ahora = new Date().toISOString();
  return db.citas.filter((c) => c.estado === 'confirmada' && !c.recordatorioEnviado && c.inicio > ahora);
}

cargar();

module.exports = {
  usarSoloMemoria,
  obtenerSesion,
  guardarSesion,
  borrarSesion,
  agregarCita,
  actualizarCita,
  citasFuturasDe,
  citasPendientesDeRecordatorio,
};
