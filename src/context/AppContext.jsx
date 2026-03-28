import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, Timestamp,
  where, writeBatch, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';

const AppContext = createContext(null);

// ── Timezone Mexico City ──────────────────────────────────────────
export function nowMX() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
}

export function fechaStrMX(date) {
  const d  = date ? new Date(date) : new Date();
  const mx = new Date(d.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  return `${mx.getFullYear()}-${String(mx.getMonth()+1).padStart(2,'0')}-${String(mx.getDate()).padStart(2,'0')}`;
}

export function AppProvider({ children }) {
  const [toast,       setToast]       = useState(null);
  const [clientes,    setClientes]    = useState([]);
  const [citas,       setCitas]       = useState([]);
  const [servicios,   setServicios]   = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const showToast = useCallback((message, type = 'success', duration = 3500) => {
    if (!message) { setToast(null); return; }
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => setToast(t => t?.id === id ? null : t), duration);
  }, []);

  // ── Listeners Firebase ────────────────────────────────────────
  useEffect(() => {
    let loaded = 0;
    const done = () => { loaded++; if (loaded >= 3) setLoadingData(false); };

    const unsubClientes = onSnapshot(
      query(collection(db, 'clientes'), orderBy('nombre')),
      snap => {
        setClientes(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id, ...data,
            creadoEn: data.creadoEn instanceof Timestamp
              ? data.creadoEn.toDate()
              : data.creadoEn ? new Date(data.creadoEn) : new Date(),
          };
        }));
        done();
      },
      err => { console.error('clientes:', err); done(); }
    );

    const unsubCitas = onSnapshot(
      query(collection(db, 'citas'), orderBy('fechaStr', 'desc'), limit(500)),
      snap => {
        setCitas(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id, ...data,
            fecha: data.fechaStr ? new Date(data.fechaStr + 'T12:00:00') : new Date(),
          };
        }));
        done();
      },
      err => { console.error('citas:', err); done(); }
    );

    const unsubServicios = onSnapshot(
      collection(db, 'servicios'),
      snap => {
        setServicios(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.nombre && Number(s.precio) > 0)
            .sort((a, b) => (a.nombre||'').localeCompare(b.nombre||''))
        );
        done();
      },
      err => { console.error('servicios:', err); done(); }
    );

    return () => { unsubClientes(); unsubCitas(); unsubServicios(); };
  }, []);

  // ── Stats con timezone Mexico ─────────────────────────────────
  const hoyStr = fechaStrMX();

  const mx = nowMX();

  // Fecha de mañana
  const mañanaMX = new Date(mx);
  mañanaMX.setDate(mañanaMX.getDate() + 1);
  const mañanaStr = fechaStrMX(mañanaMX);

  const citasHoy     = citas.filter(a => a.fechaStr === hoyStr);
  const citasMañana  = citas.filter(a => a.fechaStr === mañanaStr && a.estado !== 'cancelled');

  // Citas pendientes de hoy (confirmadas, no completadas ni canceladas)
  const citasPendientesHoy = citasHoy.filter(a => a.estado === 'confirmed');
  const citasCompletadasHoy = citasHoy.filter(a => a.estado === 'completed');

  // Próxima cita global (la más próxima en el tiempo)
  const proximaCitaGlobal = (() => {
    const ahora = mx;
    return citas
      .filter(a => a.estado === 'confirmed' && a.fechaStr && a.hora)
      .map(a => ({ ...a, dt: new Date(`${a.fechaStr}T${a.hora}`) }))
      .filter(a => a.dt >= ahora)
      .sort((a, b) => a.dt - b.dt)[0] || null;
  })();

  const ingresosMes = (() => {
    return citas
      .filter(a => {
        if (a.estado !== 'completed' || !a.fechaStr) return false;
        const d = new Date(a.fechaStr + 'T12:00:00');
        return d.getMonth() === mx.getMonth() && d.getFullYear() === mx.getFullYear();
      })
      .reduce((s, a) => s + (Number(a.precio) || 0), 0);
  })();

  // Ingresos de la semana actual
  const ingresosSemana = (() => {
    const inicioSemana = new Date(mx);
    inicioSemana.setDate(mx.getDate() - mx.getDay());
    inicioSemana.setHours(0,0,0,0);
    return citas
      .filter(a => {
        if (a.estado !== 'completed' || !a.fechaStr) return false;
        const d = new Date(a.fechaStr + 'T12:00:00');
        return d >= inicioSemana;
      })
      .reduce((s, a) => s + (Number(a.precio) || 0), 0);
  })();

  const citasCompletadasMes = (() => {
    return citas.filter(a => {
      if (a.estado !== 'completed' || !a.fechaStr) return false;
      const d = new Date(a.fechaStr + 'T12:00:00');
      return d.getMonth() === mx.getMonth() && d.getFullYear() === mx.getFullYear();
    }).length;
  })();

  // Tasa de completadas (vs total no canceladas del mes)
  const tasaCompletadasMes = (() => {
    const total = citas.filter(a => {
      if (!a.fechaStr || a.estado === 'cancelled') return false;
      const d = new Date(a.fechaStr + 'T12:00:00');
      return d.getMonth() === mx.getMonth() && d.getFullYear() === mx.getFullYear();
    }).length;
    if (!total) return 0;
    return Math.round((citasCompletadasMes / total) * 100);
  })();

  // Cliente con más visitas
  const clienteTop = clientes.reduce((top, c) => {
    return (c.visitas || 0) > (top?.visitas || 0) ? c : top;
  }, null);

  // ── CRUD Clientes ─────────────────────────────────────────────
  const agregarCliente = async (data) => {
    const ref = await addDoc(collection(db, 'clientes'), {
      nombre:   data.nombre?.trim()   || '',
      telefono: data.telefono?.trim() || '',
      email:    data.email?.trim()    || '',
      notas:    data.notas?.trim()    || '',
      visitas: 0, puntos: 0,
      creadoEn: serverTimestamp(),
    });
    return { id: ref.id, ...data };
  };

  const actualizarCliente = async (id, data) => {
    await updateDoc(doc(db, 'clientes', id), {
      nombre:   data.nombre?.trim()   || '',
      telefono: data.telefono?.trim() || '',
      email:    data.email?.trim()    || '',
      notas:    data.notas?.trim()    || '',
    });
  };

  const eliminarCliente = async (id) => {
    await deleteDoc(doc(db, 'clientes', id));
  };

  // ── CRUD Citas ────────────────────────────────────────────────
  const agregarCita = async (data) => {
    const snap = await getDocs(
      query(collection(db, 'citas'),
        where('fechaStr', '==', data.fechaStr),
        where('hora',     '==', data.hora),
        where('estado',   '!=', 'cancelled')
      )
    );
    if (!snap.empty) throw new Error('Ese horario ya está ocupado');
    return addDoc(collection(db, 'citas'), {
      ...data,
      precio:   Number(data.precio) || 0,
      duracion: Number(data.duracion) || 30,
      estado:   'confirmed',
      creadoEn: serverTimestamp(),
    });
  };

  const completarCita = async (id) => {
    const cita  = citas.find(c => c.id === id);
    if (!cita) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'citas', id), { estado: 'completed' });
    if (cita.clientId) {
      const cliente = clientes.find(c => c.id === cita.clientId);
      if (cliente) {
        batch.update(doc(db, 'clientes', cita.clientId), {
          puntos:  (cliente.puntos  || 0) + 10,
          visitas: (cliente.visitas || 0) + 1,
        });
      }
    }
    await batch.commit();
  };

  const cancelarCita = async (id) => {
    await updateDoc(doc(db, 'citas', id), { estado: 'cancelled' });
  };

  const eliminarCita = async (id) => {
    await deleteDoc(doc(db, 'citas', id));
  };

  // ── CRUD Servicios ────────────────────────────────────────────
  const guardarServicio = async (id, data) => {
    const precio = Number(data.precio);
    if (isNaN(precio) || precio <= 0) throw new Error('Precio inválido');
    const payload = {
      nombre:   data.nombre?.trim() || '',
      precio,
      duracion: Number(data.duracion) || 30,
      emoji:    data.emoji || '✂️',
    };
    if (id) await updateDoc(doc(db, 'servicios', id), payload);
    else    await addDoc(collection(db, 'servicios'), payload);
  };

  const eliminarServicio = async (id) => {
    await deleteDoc(doc(db, 'servicios', id));
  };

  return (
    <AppContext.Provider value={{
      toast, showToast,
      clientes, citas, servicios,
      // Stats hoy
      citasHoy, citasPendientesHoy, citasCompletadasHoy,
      // Stats mañana
      citasMañana,
      // Stats mes
      ingresosMes, ingresosSemana, citasCompletadasMes, tasaCompletadasMes,
      // Otros
      proximaCitaGlobal, clienteTop,
      loadingData, hoyStr, mañanaStr,
      // CRUD
      agregarCliente, actualizarCliente, eliminarCliente,
      agregarCita, completarCita, cancelarCita, eliminarCita,
      guardarServicio, eliminarServicio,
      nowMX, fechaStrMX,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp fuera de AppProvider');
  return ctx;
};