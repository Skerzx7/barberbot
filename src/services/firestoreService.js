import {
  collection, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function listenMensajes(clienteId, callback) {
  const q = query(
    collection(db, 'clientes', clienteId, 'mensajes'),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => {
      const data = d.data();
      let ts = data.timestamp;
      if (ts instanceof Timestamp) ts = ts.toDate();
      else if (typeof ts === 'string') ts = new Date(ts);
      else ts = new Date();
      return { id: d.id, ...data, timestamp: ts };
    });
    callback(msgs);
  });
}

export async function enviarMensaje(clienteId, { de, texto, canal = 'app' }) {
  if (!clienteId || !texto?.trim()) return;
  return addDoc(collection(db, 'clientes', clienteId, 'mensajes'), {
    de,
    texto:     texto.trim(),
    canal,
    timestamp: serverTimestamp(),
  });
}