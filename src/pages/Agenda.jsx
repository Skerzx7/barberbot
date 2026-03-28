import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { to12h } from '../mock/data';

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay()+6)%7)); return r; }
const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export default function Agenda() {
  const navigate = useNavigate();
  const { citas, completarCita, cancelarCita, showToast } = useApp();
  const [fecha,           setFecha]           = useState(new Date());
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);

  const hoyReal   = new Date();
  const weekStart = startOfWeek(fecha);
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isToday   = (d) => d.toDateString() === hoyReal.toDateString();
  const isSelected = (d) => d.toDateString() === fecha.toDateString();

  const irAHoy = () => setFecha(new Date());

  const citasDelDia = citas
    .filter(a => {
      const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
      if (d.toDateString() !== fecha.toDateString()) return false;
      if (!mostrarCanceladas && a.estado === 'cancelled') return false;
      return true;
    })
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

  const citasActivasDelDia = citas.filter(a => {
    const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
    return d.toDateString() === fecha.toDateString() && a.estado !== 'cancelled';
  });

  const handleComplete = async (id, nombre) => {
    await completarCita(id);
    showToast(`Cita completada ✓ +10 pts para ${nombre?.split(' ')[0]}`, 'success');
  };

  const handleCancel = async (id) => {
    await cancelarCita(id);
    showToast('Cita cancelada', 'warning');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s var(--ease) both' }}>

      {/* Week strip */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:10, display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setFecha(d => addDays(d, -7))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem', flexShrink:0 }}>←</button>

        <div style={{ flex:1, display:'flex', gap:4, justifyContent:'space-between', overflowX:'auto' }}>
          {weekDays.map(day => {
            const active = isSelected(day);
            const today  = isToday(day);
            const count  = citas.filter(a => {
              const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
              return d.toDateString() === day.toDateString() && a.estado !== 'cancelled';
            }).length;
            return (
              <button key={day.toISOString()} onClick={() => setFecha(day)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:40, padding:'8px 6px', borderRadius:'var(--r-md)', background: active ? 'var(--gold-bg)' : 'transparent', border: active ? '1px solid var(--gold-b)' : '1px solid transparent', transition:'all 150ms', fontFamily:'var(--font-b)', position:'relative' }}>
                <span style={{ fontSize:'0.58rem', textTransform:'uppercase', letterSpacing:'0.08em', color: active ? 'var(--gold)' : 'var(--muted)' }}>
                  {DAYS_ES[day.getDay()]}
                </span>
                <span style={{ fontFamily:'var(--font-d)', fontSize:'1.15rem', fontWeight:500, lineHeight:1, color: active ? 'var(--gold)' : today ? 'var(--gold)' : 'var(--text)' }}>
                  {day.getDate()}
                </span>
                {/* Indicador cantidad */}
                {count > 0 ? (
                  <span style={{ fontSize:'0.5rem', fontWeight:700, background: active ? 'var(--gold)' : 'var(--muted)', color: active ? '#000' : 'var(--bg)', borderRadius:'var(--r-full)', padding:'1px 4px', minWidth:14, textAlign:'center' }}>
                    {count}
                  </span>
                ) : (
                  <span style={{ height:10 }} />
                )}
              </button>
            );
          })}
        </div>

        <button onClick={() => setFecha(d => addDays(d, 7))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem', flexShrink:0 }}>→</button>
      </div>

      {/* Date label + controles */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontFamily:'var(--font-d)', fontSize:'0.95rem', color:'var(--text2)', textTransform:'capitalize' }}>
          {DAYS_ES[fecha.getDay()].toLowerCase()}, {fecha.getDate()} de {MONTHS_ES[fecha.getMonth()]}
        </span>
        {isToday(fecha) && (
          <span style={{ fontSize:'0.65rem', fontWeight:600, background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'2px 7px' }}>Hoy</span>
        )}
        {!isToday(fecha) && (
          <button onClick={irAHoy} style={{ fontSize:'0.65rem', fontWeight:600, color:'var(--text2)', padding:'2px 8px', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)', transition:'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--gold-b)'; e.currentTarget.style.color='var(--gold)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--b-subtle)'; e.currentTarget.style.color='var(--text2)'; }}
          >→ Hoy</button>
        )}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {/* Toggle canceladas */}
          <button
            onClick={() => setMostrarCanceladas(v => !v)}
            style={{ fontSize:'0.65rem', fontWeight:600, color: mostrarCanceladas ? 'var(--red)' : 'var(--muted)', padding:'2px 8px', background: mostrarCanceladas ? 'var(--red-bg)' : 'var(--elevated)', border:`1px solid ${mostrarCanceladas ? 'var(--red-b)' : 'var(--b-subtle)'}`, borderRadius:'var(--r-full)', transition:'all 150ms' }}
          >
            {mostrarCanceladas ? '✕ Canceladas' : '+ Canceladas'}
          </button>
          <span style={{ fontSize:'0.7rem', color:'var(--muted)' }}>
            {citasActivasDelDia.length} cita{citasActivasDelDia.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Citas */}
      {citasDelDia.length === 0 ? (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontSize:'0.875rem', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:'2.5rem' }}>📅</span>
          <p>Sin citas para este día</p>
          <button onClick={() => navigate('/agenda/nueva')} style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--gold)', padding:'7px 16px', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>
            + Agendar cita
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {citasDelDia.map(a => (
            <div key={a.id}
              style={{ display:'flex', gap:12, padding:14, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', transition:'border-color 150ms', opacity: a.estado === 'cancelled' ? 0.5 : 1 }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--b-soft)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--b-subtle)'}
            >
              {/* Timeline hora */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, width:48, flexShrink:0 }}>
                <span style={{ fontFamily:'var(--font-m)', fontSize:'0.72rem', color:'var(--gold)', fontWeight:600 }}>{to12h(a.hora)}</span>
                <div style={{ flex:1, width:1, background:'var(--b-subtle)', minHeight:16 }} />
              </div>

              {/* Contenido */}
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  {/* Avatar + nombre */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'0.85rem', flexShrink:0 }}>
                      {(a.clienteNombre||'?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize:'0.875rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.clienteNombre}</span>
                  </div>
                  <StatusBadge estado={a.estado} />
                </div>
                <span style={{ fontSize:'0.78rem', color:'var(--text2)', paddingLeft:38 }}>{a.servicio}</span>
                <span style={{ fontFamily:'var(--font-m)', fontSize:'0.68rem', color:'var(--muted)', paddingLeft:38 }}>
                  ${a.precio} MXN · {a.duracion} min
                </span>

                {a.estado === 'confirmed' && (
                  <div style={{ display:'flex', gap:6, marginTop:4, paddingLeft:38, flexWrap:'wrap' }}>
                    <button onClick={() => handleComplete(a.id, a.clienteNombre)} style={{ height:26, padding:'0 10px', borderRadius:'var(--r-sm)', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green-b)', fontSize:'0.7rem', fontWeight:600 }}>
                      ✓ Completar
                    </button>
                    <button onClick={() => handleCancel(a.id)} style={{ height:26, padding:'0 10px', borderRadius:'var(--r-sm)', background:'var(--red-bg)', color:'var(--red)', border:'1px solid var(--red-b)', fontSize:'0.7rem', fontWeight:600 }}>
                      Cancelar
                    </button>
                    {a.clientId && (
                      <button onClick={() => navigate(`/mensajes/${a.clientId}`)} style={{ height:26, padding:'0 10px', borderRadius:'var(--r-sm)', background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', fontSize:'0.7rem', fontWeight:600 }}>
                        💬 Chat
                      </button>
                    )}
                    {a.clientId && (
                      <button onClick={() => navigate(`/clientes/${a.clientId}`)} style={{ height:26, padding:'0 10px', borderRadius:'var(--r-sm)', background:'var(--elevated)', color:'var(--text2)', border:'1px solid var(--b-subtle)', fontSize:'0.7rem', fontWeight:500 }}>
                        👤 Perfil
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}