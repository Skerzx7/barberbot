import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/ui/Badge';
import { to12h } from '../mock/data';

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setDate(r.getDate()-((r.getDay()+6)%7)); return r; }
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function Agenda() {
  const navigate = useNavigate();
  const { showToast, citas, completarCita, cancelarCita } = useApp();
  const [fecha, setFecha] = useState(new Date());
  const [vistaActual, setVistaActual] = useState('semana'); // semana | mes

  const weekStart = startOfWeek(fecha);
  const weekDays  = Array.from({ length:7 }, (_, i) => addDays(weekStart, i));
  const isToday   = d => d.toDateString() === new Date().toDateString();

  const citasDelDia = citas
    .filter(a => new Date(a.fecha).toDateString() === fecha.toDateString())
    .sort((a,b) => a.hora.localeCompare(b.hora));

  // Dias del mes actual
  const mesActual = fecha.getMonth();
  const anioActual = fecha.getFullYear();
  const primerDiaMes = new Date(anioActual, mesActual, 1);
  const diasEnMes = new Date(anioActual, mesActual+1, 0).getDate();
  const offsetInicio = (primerDiaMes.getDay()+6) % 7;
  const diasMes = Array.from({ length: diasEnMes }, (_, i) => new Date(anioActual, mesActual, i+1));

  const tieneCitas = (d) => citas.some(a => new Date(a.fecha).toDateString() === d.toDateString() && a.estado !== 'cancelled');

  const handleComplete = (id) => {
    completarCita(id);
    showToast('Cita completada ✓', 'success');
  };
  const handleCancel = (id) => {
    cancelarCita(id);
    showToast('Cita cancelada', 'warning');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'fadeIn .3s var(--ease) both' }}>

      {/* Header mes + navegación */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:'12px 16px' }}>
        <button onClick={() => setFecha(d => new Date(d.getFullYear(), d.getMonth()-1, 1))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem' }}>←</button>
        <div style={{ textAlign:'center' }}>
          <span style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500 }}>{MONTHS[mesActual]}</span>
          <span style={{ fontSize:'0.8rem', color:'var(--text2)', marginLeft:8 }}>{anioActual}</span>
        </div>
        <button onClick={() => setFecha(d => new Date(d.getFullYear(), d.getMonth()+1, 1))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem' }}>→</button>
      </div>

      {/* Semana strip */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:10, display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setFecha(d => addDays(d,-7))} style={{ width:28, height:28, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.8rem', flexShrink:0 }}>‹</button>
        <div style={{ flex:1, display:'flex', gap:4, justifyContent:'space-between' }}>
          {weekDays.map(day => {
            const active = day.toDateString() === fecha.toDateString();
            const hasCitas = tieneCitas(day);
            return (
              <button key={day.toISOString()} onClick={() => setFecha(day)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, minWidth:38, padding:'7px 5px', borderRadius:'var(--r-md)', background: active ? 'var(--gold-bg)' : 'transparent', border: active ? '1px solid var(--gold-b)' : '1px solid transparent', transition:'all 150ms', fontFamily:'var(--font-b)', flexShrink:0, position:'relative' }}>
                <span style={{ fontSize:'0.55rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{DAYS_SHORT[day.getDay()]}</span>
                <span style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500, lineHeight:1, color: active ? 'var(--gold)' : isToday(day) ? 'var(--gold)' : 'var(--text)' }}>{day.getDate()}</span>
                {hasCitas && <span style={{ width:4, height:4, borderRadius:'50%', background: active ? 'var(--gold)' : 'var(--text2)', position:'absolute', bottom:4 }} />}
              </button>
            );
          })}
        </div>
        <button onClick={() => setFecha(d => addDays(d,7))} style={{ width:28, height:28, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.8rem', flexShrink:0 }}>›</button>
      </div>

      {/* Fecha seleccionada */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontFamily:'var(--font-d)', fontSize:'1rem', color:'var(--text2)', textTransform:'capitalize' }}>
          {DAYS_SHORT[fecha.getDay()]}, {fecha.getDate()} de {MONTHS[fecha.getMonth()]} {fecha.getFullYear()}
        </span>
        {isToday(fecha) && <span style={{ fontSize:'0.68rem', fontWeight:600, background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'2px 8px' }}>Hoy</span>}
        <span style={{ fontSize:'0.72rem', color:'var(--muted)', marginLeft:'auto' }}>{citasDelDia.length} cita{citasDelDia.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Lista de citas */}
      {citasDelDia.length === 0 ? (
        <div style={{ padding:'48px 20px', textAlign:'center', color:'var(--muted)', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:'2.5rem' }}>💅</span>
          <p style={{ fontSize:'0.875rem' }}>Sin citas para este día</p>
          <button onClick={() => navigate('/agenda/nueva')} style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--gold)', padding:'8px 16px', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>+ Agendar cita</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {citasDelDia.map(a => (
            <div key={a.id} style={{ display:'flex', gap:14, padding:16, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', transition:'border-color 150ms' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--b-soft)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--b-subtle)'}
            >
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, width:52, flexShrink:0 }}>
                <span style={{ fontFamily:'var(--font-m)', fontSize:'0.72rem', color:'var(--gold)', fontWeight:500, textAlign:'center', lineHeight:1.3 }}>{to12h(a.hora)}</span>
                <div style={{ flex:1, width:1, background:'var(--b-subtle)' }} />
              </div>
              <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:5 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:'0.9rem', fontWeight:500 }}>{a.clienteNombre}</span>
                  <StatusBadge estado={a.estado} />
                </div>
                <span style={{ fontSize:'0.8rem', color:'var(--text2)' }}>{a.servicio}</span>
                <span style={{ fontFamily:'var(--font-m)', fontSize:'0.72rem', color:'var(--muted)' }}>${a.precio} MXN · {a.duracion} min</span>
                {a.estado === 'confirmed' && (
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    <button onClick={() => handleComplete(a.id)} style={{ height:28, padding:'0 12px', borderRadius:'var(--r-sm)', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green-b)', fontSize:'0.72rem', fontWeight:600 }}>✓ Completar</button>
                    <button onClick={() => handleCancel(a.id)} style={{ height:28, padding:'0 12px', borderRadius:'var(--r-sm)', background:'var(--red-bg)', color:'var(--red)', border:'1px solid var(--red-b)', fontSize:'0.72rem', fontWeight:600 }}>Cancelar</button>
                    <button onClick={async () => {
                      if (!window.confirm('¿Eliminar esta cita definitivamente?')) return;
                      try {
                        const { actualizarCita } = await import('../services/firestoreService');
                        // Eliminamos actualizando estado a deleted para no romper historial
                        await actualizarCita(a.id, { estado: 'cancelled' });
                        showToast('Cita cancelada', 'info');
                      } catch { showToast('Error', 'error'); }
                    }} style={{ height:28, padding:'0 12px', borderRadius:'var(--r-sm)', background:'var(--elevated)', color:'var(--muted)', border:'1px solid var(--b-subtle)', fontSize:'0.72rem', fontWeight:600 }}>🗑</button>
                    <button onClick={() => navigate(`/mensajes/${a.clientId}`)} style={{ height:28, padding:'0 12px', borderRadius:'var(--r-sm)', background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', fontSize:'0.72rem', fontWeight:600 }}>💬 Chat</button>
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