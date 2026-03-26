import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import {
  listenClientes, listenCitas, listenServicios,
  crearCliente, actualizarClienteFS, eliminarClienteFS,
  crearCita, actualizarCita,
  crearServicio, actualizarServicio, eliminarServicio,
  sumarPuntosCliente,
} from '../services/firestoreService';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toast, setToast]             = useState(null);
  const [citas, setCitas]             = useState([]);
  const [clientes, setClientes]       = useState([]);
  const [servicios, setServicios]     = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let loadedCount = 0;
    const checkLoaded = () => { loadedCount++; if (loadedCount >= 3) setLoadingData(false); };
    const unsubClientes  = listenClientes(data  => { setClientes(data);  checkLoaded(); });
    const unsubCitas     = listenCitas(data      => { setCitas(data);     checkLoaded(); });
    const unsubServicios = listenServicios(data  => { setServicios(data); checkLoaded(); });
    return () => { unsubClientes(); unsubCitas(); unsubServicios(); };
  }, []);

  // ── Toast ────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success', duration = 3500) => {
    if (!message) { setToast(null); return; }
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => setToast(t => t?.id === id ? null : t), duration);
  }, []);

  // ── Citas ────────────────────────────────────────────────────────
  const completarCita = useCallback(async (id) => {
    await actualizarCita(id, { estado: 'completed' });
    const cita = citas.find(c => c.id === id);
    if (cita?.clientId) {
      await sumarPuntosCliente(cita.clientId, 10);
    }
  }, [citas]);

  const cancelarCita = useCallback(async (id) => {
    await actualizarCita(id, { estado: 'cancelled' });
  }, []);

  const agregarCita = useCallback(async (data) => {
    await crearCita(data);
  }, []);

  // ── Clientes ─────────────────────────────────────────────────────
  const agregarCliente = useCallback(async (data) => {
    const ref = await crearCliente(data);
    return { id: ref.id, ...data, visitas: 0, puntos: 0, creadoEn: new Date() };
  }, []);

  const actualizarCliente = useCallback(async (id, data) => {
    await actualizarClienteFS(id, data);
  }, []);

  const eliminarCliente = useCallback(async (id) => {
    await eliminarClienteFS(id);
  }, []);

  // ── Servicios ────────────────────────────────────────────────────
  const actualizarServicios = useCallback(async (lista) => {
    const promises = lista.map(svc =>
      svc.isNew ? crearServicio(svc) : actualizarServicio(svc.id, svc)
    );
    await Promise.all(promises);
  }, []);

  const eliminarServicioCtx = useCallback(async (id) => {
    await eliminarServicio(id);
  }, []);

  // ── Stats ────────────────────────────────────────────────────────
  const hoy = new Date();

  const citasHoy = useMemo(() =>
    citas.filter(a => {
      const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
      return d.toDateString() === hoy.toDateString();
    }), [citas]
  );

  const ingresosMes = useMemo(() =>
    citas
      .filter(a => {
        const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
        return a.estado === 'completed' &&
          d.getMonth() === hoy.getMonth() &&
          d.getFullYear() === hoy.getFullYear();
      })
      .reduce((s, a) => s + (Number(a.precio) || 0), 0),
    [citas]
  );

  const citasCompletadasMes = useMemo(() =>
    citas.filter(a => {
      const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
      return a.estado === 'completed' &&
        d.getMonth() === hoy.getMonth() &&
        d.getFullYear() === hoy.getFullYear();
    }).length,
    [citas]
  );

  return (
    <AppContext.Provider value={{
      toast, showToast,
      citas, completarCita, cancelarCita, agregarCita,
      clientes, agregarCliente, actualizarCliente, eliminarCliente,
      servicios, actualizarServicios, eliminarServicioCtx,
      citasHoy, ingresosMes, citasCompletadasMes,
      loadingData,
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