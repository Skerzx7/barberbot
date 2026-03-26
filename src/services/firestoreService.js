import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  setDoc, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

// ── CLIENTES ──────────────────────────────────────────────────────
export function listenClientes(callback) {
  const q = query(collection(db, 'clientes'));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      creadoEn: d.data().creadoEn?.toDate ? d.data().creadoEn.toDate() : new Date(),
    }));
    data.sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
    callback(data);
  }, err => console.error('listenClientes error:', err));
}

export async function crearCliente(data) {
  return addDoc(collection(db, 'clientes'), {
    nombre:   data.nombre   || '',
    telefono: data.telefono || '',
    email:    data.email    || '',
    notas:    data.notas    || '',
    visitas:  0,
    puntos:   0,
    creadoEn: serverTimestamp(),
  });
}

export async function actualizarClienteFS(id, data) {
  const { id: _id, creadoEn, ...rest } = data;
  return updateDoc(doc(db, 'clientes', id), rest);
}

export async function eliminarClienteFS(id) {
  return deleteDoc(doc(db, 'clientes', id));
}

export async function sumarPuntosCliente(clienteId, puntos = 10) {
  return updateDoc(doc(db, 'clientes', clienteId), {
    puntos:  increment(puntos),
    visitas: increment(1),
  });
}

// ── CITAS ─────────────────────────────────────────────────────────
export function listenCitas(callback) {
  const q = query(collection(db, 'citas'));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      fecha: d.data().fechaStr
        ? new Date(d.data().fechaStr + 'T12:00:00')
        : d.data().fecha?.toDate
          ? d.data().fecha.toDate()
          : new Date(d.data().fecha || Date.now()),
    }));
    data.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    callback(data);
  }, err => console.error('listenCitas error:', err));
}

export async function crearCita(data) {
  const fechaDate = data.fecha instanceof Date ? data.fecha : new Date(data.fecha);
  const fechaStr  = `${fechaDate.getFullYear()}-${String(fechaDate.getMonth()+1).padStart(2,'0')}-${String(fechaDate.getDate()).padStart(2,'0')}`;
  return addDoc(collection(db, 'citas'), {
    clientId:      data.clientId      || null,
    clienteNombre: data.clienteNombre || 'Cliente',
    servicio:      data.servicio      || '',
    precio:        Number(data.precio)   || 0,
    duracion:      Number(data.duracion) || 30,
    hora:          data.hora          || '09:00',
    fechaStr,
    fecha:         fechaDate,
    estado:        'confirmed',
    creadoEn:      serverTimestamp(),
  });
}

export async function actualizarCita(id, data) {
  return updateDoc(doc(db, 'citas', id), data);
}

// ── SERVICIOS ─────────────────────────────────────────────────────
export function listenServicios(callback) {
  const q = query(collection(db, 'servicios'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      precio:   Number(d.data().precio)   || 0,
      duracion: Number(d.data().duracion) || 30,
    })));
  }, err => console.error('listenServicios error:', err));
}

export async function crearServicio(data) {
  return addDoc(collection(db, 'servicios'), {
    nombre:   data.nombre   || 'Servicio',
    precio:   Number(data.precio)   || 0,
    duracion: Number(data.duracion) || 30,
    emoji:    data.emoji    || '✂️',
    activo:   true,
  });
}

export async function actualizarServicio(id, data) {
  return updateDoc(doc(db, 'servicios', id), {
    nombre:   data.nombre,
    precio:   Number(data.precio),
    duracion: Number(data.duracion),
    emoji:    data.emoji,
  });
}

export async function eliminarServicio(id) {
  return deleteDoc(doc(db, 'servicios', id));
}

// ── MENSAJES ──────────────────────────────────────────────────────
export function listenMensajes(clienteId, callback) {
  if (!clienteId) return () => {};
  const q = query(
    collection(db, 'clientes', clienteId, 'mensajes'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      timestamp: d.data().timestamp?.toDate ? d.data().timestamp.toDate() : new Date(),
    })));
  }, err => console.error('listenMensajes error:', err));
}

export async function enviarMensaje(clienteId, data) {
  return addDoc(collection(db, 'clientes', clienteId, 'mensajes'), {
    de:        data.de    || 'owner',
    texto:     data.texto || '',
    timestamp: serverTimestamp(),
  });
}

// ── CONFIG ────────────────────────────────────────────────────────
export async function guardarConfig(data) {
  return setDoc(doc(db, 'config', 'negocio'), data, { merge: true });
}