/**
 * Simulador: prueba el bot en la consola sin WhatsApp ni Google.
 *   npm run simular
 * Comandos especiales:
 *   /recordar  -> envía los recordatorios pendientes ahora mismo
 *   /salir     -> termina
 */
process.env.GOOGLE_CREDENTIALS_FILE = ''; // siempre calendario simulado
const readline = require('readline');
const config = require('./config');
const wa = require('./whatsapp');
const store = require('./store');

const TEL_CLIENTE = process.argv[2] || '50200000000';
config.encargado.telefono ||= '50299999999';

store.usarSoloMemoria();
wa.activarSimulacion((to, texto) => {
  const quien = to === config.encargado.telefono ? 'ENCARGADO' : 'CLIENTE';
  console.log(`\n\x1b[36m[BOT -> ${quien} +${to}]\x1b[0m\n${texto}\n`);
});

const { manejarMensaje } = require('./bot');
const { revisarRecordatorios } = require('./reminders');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\x1b[32mTú> \x1b[0m' });
console.log('Simulador del bot de citas. Escribe "hola" para empezar. (/recordar, /salir)\n');
rl.prompt();

let cola = Promise.resolve();
rl.on('line', (linea) => {
  cola = cola.then(async () => {
    const texto = linea.trim();
    if (texto === '/salir') return rl.close();
    if (texto === '/recordar') await revisarRecordatorios({ forzar: true });
    else if (texto) await manejarMensaje({ de: TEL_CLIENTE, texto, nombrePerfil: 'Cliente Prueba' });
    rl.prompt();
  }).catch((err) => {
    console.error(err);
    rl.prompt();
  });
});
rl.on('close', () => cola.then(() => process.exit(0)));
