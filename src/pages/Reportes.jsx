import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { StatusBadge } from '../components/ui/Badge';
import { to12h } from '../mock/data';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function StatCard({ emoji, label, value, sub, accent }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderLeft:`3px solid ${accent}`, borderRadius:'var(--r-lg)', padding:'16px 18px', display:'flex', alignItems:'flex-start', gap:12 }}>
      <div style={{ width:36, height:36, borderRadius:'var(--r-md)', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--elevated)', flexShrink:0 }}>{emoji}</div>
      <div>
        <div style={{ fontFamily:'var(--font-d)', fontSize:'1.6rem', fontWeight:500, lineHeight:1, marginBottom:4 }}>{value}</div>
        <div style={{ fontSize:'0.78rem', color:'var(--text2)', fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function Reportes() {
  const { citas, showToast } = useApp();

  const hoy = new Date();
  const [filtroEstado, setFiltroEstado]       = useState('todas');
  const [filtroMes, setFiltroMes]             = useState('todos');
  const [filtroServicio, setFiltroServicio]   = useState('todos');
  const [busqueda, setBusqueda]               = useState('');
  const [showAllClientes, setShowAllClientes] = useState(false);
  const [eliminando, setEliminando]           = useState(null);

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    citas.forEach(a => {
      const d = new Date(a.fecha);
      set.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    return [...set].sort().reverse();
  }, [citas]);

  const serviciosUnicos = useMemo(() =>
    [...new Set(citas.map(a => a.servicio))].sort(),
    [citas]
  );

  const citasFiltradas = useMemo(() => {
    return citas
      .filter(a => {
        const d = new Date(a.fecha);
        const mesKey = `${d.getFullYear()}-${d.getMonth()}`;
        if (filtroEstado !== 'todas' && a.estado !== filtroEstado) return false;
        if (filtroMes !== 'todos' && mesKey !== filtroMes) return false;
        if (filtroServicio !== 'todos' && a.servicio !== filtroServicio) return false;
        if (busqueda && !a.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) && !a.servicio?.toLowerCase().includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [citas, filtroEstado, filtroMes, filtroServicio, busqueda]);

  const stats = useMemo(() => {
    const completadas = citas.filter(a => a.estado === 'completed');
    const canceladas  = citas.filter(a => a.estado === 'cancelled');
    const ingresos    = completadas.reduce((s, a) => s + (Number(a.precio) || 0), 0);

    const conteo = {};
    completadas.forEach(a => { conteo[a.servicio] = (conteo[a.servicio] || 0) + 1; });
    const topServicio = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];

    const conteoClientes = {};
    completadas.forEach(a => {
      conteoClientes[a.clienteNombre] = (conteoClientes[a.clienteNombre] || 0) + 1;
    });
    const rankingClientes = Object.entries(conteoClientes).sort((a, b) => b[1] - a[1]);

    const ingresosMes = completadas
      .filter(a => {
        const d = new Date(a.fecha);
        return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      })
      .reduce((s, a) => s + (Number(a.precio) || 0), 0);

    return { completadas: completadas.length, canceladas: canceladas.length, ingresos, ingresosMes, topServicio, rankingClientes };
  }, [citas]);

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    setEliminando(id);
    try {
      await deleteDoc(doc(db, 'citas', id));
      showToast('Registro eliminado', 'info');
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar', 'error');
    } finally {
      setEliminando(null);
    }
  };

  const mesLabel = (key) => {
    const [anio, mes] = key.split('-').map(Number);
    return `${MESES[mes]} ${anio}`;
  };

  const inp = {
    height:36, background:'var(--elevated)', border:'1px solid var(--b-soft)',
    borderRadius:'var(--r-md)', padding:'0 12px', color:'var(--text)',
    fontSize:'0.8rem', fontFamily:'var(--font-b)',
  };

  const clientesMostrados = showAllClientes
    ? stats.rankingClientes
    : stats.rankingClientes.slice(0, 5);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, animation:'fadeIn .3s var(--ease) both' }}>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        <StatCard emoji="✅" label="Completadas"  value={stats.completadas} sub="en total" accent="var(--green)" />
        <StatCard emoji="❌" label="Canceladas"   value={stats.canceladas}  sub="en total" accent="var(--red)" />
        <StatCard emoji="💰" label="Ingresos mes" value={`$${stats.ingresosMes.toLocaleString()}`} sub="MXN este mes" accent="var(--gold)" />
        <StatCard emoji="💵" label="Total ganado" value={`$${stats.ingresos.toLocaleString()}`} sub="MXN histórico" accent="var(--blue)" />
      </div>

      {/* Servicio top + Ranking */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start' }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16 }}>
          <p style={{ fontSize:'0.7rem', color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em' }}>Servicio más pedido</p>
          <p style={{ fontSize:'1rem', fontWeight:500, color:'var(--text)' }}>{stats.topServicio?.[0] || '—'}</p>
          {stats.topServicio && <p style={{ fontSize:'0.72rem', color:'var(--gold)', marginTop:2 }}>{stats.topServicio[1]} veces</p>}
        </div>

        <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:8 }}>
          <p style={{ fontSize:'0.7rem', color:'var(--muted)', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.08em' }}>Clientas frecuentes</p>
          {stats.rankingClientes.length === 0 ? (
            <p style={{ fontSize:'0.78rem', color:'var(--muted)' }}>Sin datos aún</p>
          ) : (
            <>
              {clientesMostrados.map(([nombre, visitas], idx) => (
                <div key={nombre} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontFamily:'var(--font-m)', fontSize:'0.7rem', color:'var(--muted)', minWidth:16 }}>#{idx+1}</span>
                  <span style={{ flex:1, fontSize:'0.82rem', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {nombre.split(' ')[0]}
                  </span>
                  <span style={{ fontSize:'0.72rem', color:'var(--gold)', fontFamily:'var(--font-m)', flexShrink:0 }}>{visitas}x</span>
                </div>
              ))}
              {stats.rankingClientes.length > 5 && (
                <button onClick={() => setShowAllClientes(v => !v)} style={{ fontSize:'0.72rem', color:'var(--gold)', fontFamily:'var(--font-b)', fontWeight:500, textAlign:'left', marginTop:2 }}>
                  {showAllClientes ? 'Ver menos ↑' : `Ver todas (${stats.rankingClientes.length}) →`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Distribución por servicio */}
      {serviciosUnicos.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16 }}>
          <p style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text2)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.06em' }}>Servicios realizados</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {serviciosUnicos.map(svc => {
              const total = citas.filter(a => a.servicio === svc && a.estado === 'completed').length;
              const max   = Math.max(...serviciosUnicos.map(s => citas.filter(a => a.servicio === s && a.estado === 'completed').length), 1);
              const pct   = Math.round((total / max) * 100);
              const ingresoSvc = citas.filter(a => a.servicio === svc && a.estado === 'completed').reduce((s, a) => s + (Number(a.precio) || 0), 0);
              return (
                <div key={svc}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                    <span style={{ fontSize:'0.82rem', color:'var(--text)' }}>{svc}</span>
                    <div style={{ display:'flex', gap:12 }}>
                      <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{total} veces</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--gold)', fontFamily:'var(--font-m)' }}>${ingresoSvc.toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{ height:4, background:'var(--overlay)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:'var(--gold)', borderRadius:2, transition:'width 600ms var(--ease)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <p style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Historial de citas</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input style={{ ...inp, flex:1, minWidth:160 }} placeholder="🔍 Buscar clienta o servicio..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <select style={{ ...inp, cursor:'pointer', appearance:'none', minWidth:130 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="confirmed">Confirmadas</option>
            <option value="completed">Completadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <select style={{ ...inp, cursor:'pointer', appearance:'none', minWidth:150 }} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="todos">Todos los meses</option>
            {mesesDisponibles.map(k => <option key={k} value={k}>{mesLabel(k)}</option>)}
          </select>
          <select style={{ ...inp, cursor:'pointer', appearance:'none', minWidth:150 }} value={filtroServicio} onChange={e => setFiltroServicio(e.target.value)}>
            <option value="todos">Todos los servicios</option>
            {serviciosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>
            {citasFiltradas.length} cita{citasFiltradas.length !== 1 ? 's' : ''} encontrada{citasFiltradas.length !== 1 ? 's' : ''}
          </span>
          {(filtroEstado !== 'todas' || filtroMes !== 'todos' || filtroServicio !== 'todos' || busqueda) && (
            <button onClick={() => { setFiltroEstado('todas'); setFiltroMes('todos'); setFiltroServicio('todos'); setBusqueda(''); }} style={{ fontSize:'0.72rem', color:'var(--gold)', fontFamily:'var(--font-b)', fontWeight:500 }}>
              Limpiar filtros ×
            </button>
          )}
        </div>
      </div>

      {/* Lista de citas */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {citasFiltradas.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--muted)', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', fontSize:'0.875rem' }}>
            Sin citas con esos filtros
          </div>
        ) : citasFiltradas.map(a => (
          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', transition:'border-color 150ms' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b-soft)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b-subtle)'}
          >
            {/* Fecha */}
            <div style={{ minWidth:52, flexShrink:0, textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, lineHeight:1 }}>{new Date(a.fecha).getDate()}</div>
              <div style={{ fontSize:'0.6rem', color:'var(--muted)', textTransform:'uppercase', marginTop:1 }}>{MESES[new Date(a.fecha).getMonth()].slice(0,3)}</div>
              <div style={{ fontSize:'0.58rem', color:'var(--muted)' }}>{new Date(a.fecha).getFullYear()}</div>
            </div>

            <div style={{ width:1, height:36, background:'var(--b-subtle)', flexShrink:0 }} />

            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'0.875rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.clienteNombre}</div>
              <div style={{ fontSize:'0.75rem', color:'var(--text2)', marginTop:2 }}>{a.servicio} · {to12h(a.hora)}</div>
            </div>

            {/* Precio */}
            <div style={{ fontFamily:'var(--font-m)', fontSize:'0.82rem', color: a.estado==='completed'?'var(--gold)':'var(--muted)', flexShrink:0 }}>
              {a.estado === 'cancelled' ? '—' : `$${a.precio}`}
            </div>

            {/* Estado */}
            <div style={{ flexShrink:0 }}>
              <StatusBadge estado={a.estado} />
            </div>

            {/* Botón eliminar */}
            <button
              onClick={() => handleEliminar(a.id)}
              disabled={eliminando === a.id}
              style={{
                width:28, height:28, borderRadius:'var(--r-sm)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: eliminando === a.id ? 'var(--red)' : 'var(--muted)',
                fontSize:'0.8rem', flexShrink:0, background:'transparent',
                transition:'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color= eliminando===a.id ? 'var(--red)' : 'var(--muted)'; }}
            >
              {eliminando === a.id ? '...' : '🗑'}
            </button>
          </div>
        ))}
      </div>

      {/* Total */}
      {citasFiltradas.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.82rem', color:'var(--text2)' }}>
            Total ({citasFiltradas.filter(a => a.estado==='completed').length} completadas)
          </span>
          <span style={{ fontFamily:'var(--font-m)', fontSize:'0.95rem', color:'var(--gold)', fontWeight:500 }}>
            ${citasFiltradas.filter(a => a.estado==='completed').reduce((s, a) => s + (Number(a.precio)||0), 0).toLocaleString()} MXN
          </span>
        </div>
      )}
    </div>
  );
}