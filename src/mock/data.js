export const MOCK_CLIENTES = [
  { id:'c1', nombre:'Carlos Ramírez',   telefono:'55 1234 5678', email:'carlos@email.com', visitas:12, puntos:240, notas:'Prefiere degradado bajo, sin gel.', creadoEn: new Date('2024-01-15') },
  { id:'c2', nombre:'Miguel Hernández', telefono:'55 9876 5432', email:'miguel@email.com',  visitas:8,  puntos:160, notas:'Corte clásico con raya al lado.',   creadoEn: new Date('2024-03-02') },
  { id:'c3', nombre:'Luis Torres',      telefono:'55 5555 1234', email:'',                  visitas:5,  puntos:100, notas:'',                                   creadoEn: new Date('2024-05-20') },
  { id:'c4', nombre:'Andrés Morales',   telefono:'55 3333 9999', email:'andres@email.com',  visitas:20, puntos:400, notas:'Cliente frecuente. Barba + corte.',  creadoEn: new Date('2023-11-08') },
  { id:'c5', nombre:'Fernando Díaz',    telefono:'55 7777 2222', email:'',                  visitas:3,  puntos:60,  notas:'',                                   creadoEn: new Date('2024-08-01') },
  { id:'c6', nombre:'Roberto Sánchez',  telefono:'55 4444 8888', email:'roberto@email.com', visitas:15, puntos:300, notas:'Fade alto, barba perfilada.',        creadoEn: new Date('2024-02-10') },
];

const hoy    = new Date();
const ayer   = new Date(hoy); ayer.setDate(hoy.getDate()-1);
const manana = new Date(hoy); manana.setDate(hoy.getDate()+1);

export const MOCK_CITAS = [
  { id:'a1',  clientId:'c1', clienteNombre:'Carlos Ramírez',   servicio:'Corte + Barba',    hora:'09:00', precio:160, duracion:50, estado:'confirmed', fecha:new Date(hoy) },
  { id:'a2',  clientId:'c2', clienteNombre:'Miguel Hernández', servicio:'Fade / Degradado',  hora:'10:00', precio:120, duracion:40, estado:'confirmed', fecha:new Date(hoy) },
  { id:'a3',  clientId:'c3', clienteNombre:'Luis Torres',      servicio:'Corte de cabello', hora:'11:30', precio:100, duracion:30, estado:'completed', fecha:new Date(hoy) },
  { id:'a4',  clientId:'c4', clienteNombre:'Andrés Morales',   servicio:'Corte + Barba',    hora:'13:00', precio:160, duracion:50, estado:'confirmed', fecha:new Date(hoy) },
  { id:'a5',  clientId:'c5', clienteNombre:'Fernando Díaz',    servicio:'Arreglo de barba', hora:'14:30', precio:80,  duracion:25, estado:'cancelled', fecha:new Date(hoy) },
  { id:'a6',  clientId:'c6', clienteNombre:'Roberto Sánchez',  servicio:'Fade / Degradado',  hora:'16:00', precio:120, duracion:40, estado:'confirmed', fecha:new Date(hoy) },
  { id:'a7',  clientId:'c1', clienteNombre:'Carlos Ramírez',   servicio:'Corte + Barba',    hora:'10:00', precio:160, duracion:50, estado:'completed', fecha:new Date(ayer) },
  { id:'a8',  clientId:'c2', clienteNombre:'Miguel Hernández', servicio:'Corte de cabello', hora:'12:00', precio:100, duracion:30, estado:'completed', fecha:new Date(ayer) },
  { id:'a9',  clientId:'c4', clienteNombre:'Andrés Morales',   servicio:'Tratamiento',      hora:'09:30', precio:200, duracion:45, estado:'confirmed', fecha:new Date(manana) },
  { id:'a10', clientId:'c6', clienteNombre:'Roberto Sánchez',  servicio:'Corte + Barba',    hora:'11:00', precio:160, duracion:50, estado:'confirmed', fecha:new Date(manana) },
];

export const MOCK_MENSAJES = {
  c1: [
    { id:'m1', de:'client', texto:'Buenas, ¿me pueden dar cita mañana a las 10?', timestamp: new Date(Date.now()-3600000*3) },
    { id:'m2', de:'bot',    texto:'Claro! Mañana a las 10 está disponible. ¿Te confirmo corte + barba como siempre? 💈', timestamp: new Date(Date.now()-3600000*2.9) },
    { id:'m3', de:'client', texto:'Sí, perfecto 👍', timestamp: new Date(Date.now()-3600000*2) },
    { id:'m4', de:'bot',    texto:'Listo, ya quedó agendada. Te esperamos! ✂️', timestamp: new Date(Date.now()-3600000*1.9) },
  ],
  c2: [
    { id:'m5', de:'client', texto:'¿Cuánto sale el fade?', timestamp: new Date(Date.now()-86400000) },
    { id:'m6', de:'owner',  texto:'El fade está en $120, dura como 40 min 😊', timestamp: new Date(Date.now()-86400000+300000) },
    { id:'m7', de:'client', texto:'Ok gracias, paso el jueves', timestamp: new Date(Date.now()-3600000) },
  ],
  c4: [
    { id:'m8', de:'bot',    texto:'Hola! Te recordamos que mañana tienes cita a las 9:30 am 📅 ¿Todo bien?', timestamp: new Date(Date.now()-7200000) },
    { id:'m9', de:'client', texto:'Sí gracias! Ahí estaré 🙌', timestamp: new Date(Date.now()-7000000) },
  ],
};

export const MOCK_SERVICIOS = [
  { id:'s1', nombre:'Corte de cabello', precio:100, duracion:30, emoji:'✂️' },
  { id:'s2', nombre:'Arreglo de barba', precio:80,  duracion:25, emoji:'🪒' },
  { id:'s3', nombre:'Corte + Barba',    precio:160, duracion:50, emoji:'💈' },
  { id:'s4', nombre:'Fade / Degradado', precio:120, duracion:40, emoji:'⚡' },
  { id:'s5', nombre:'Tratamiento',      precio:200, duracion:45, emoji:'✨' },
  { id:'s6', nombre:'Corte niños',      precio:80,  duracion:25, emoji:'👦' },
];

export const HORARIOS_TRABAJO = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00','19:30',
];

// Convertir hora 24h a 12h
export const to12h = (hora24) => {
  if (!hora24) return '';
  const [h, m] = hora24.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2,'0')} ${ampm}`;
};