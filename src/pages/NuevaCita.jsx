import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { fechaStrMX, nowMX } from '../context/AppContext';

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
const DAYS_ES = ['dom','lun','mar','mié','jue','vie','sáb'];
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const HORARIOS = [
  '09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
  '18:00','18:30','19:00',
];

function Stepper({ current }) {
  const steps = [
    { n:1, label:'Servicio', emoji:'✂️' },
    { n:2, label:'Fecha',    emoji:'📅' },
    { n:3, label:'Cliente',  emoji:'👤' },
  ];
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'20px 0 8px' }}>
      {steps.map(({ n, label, emoji }, idx) => (
        <div key={n} style={{ display:'flex', alignItems:'center', flex: idx < steps.length-1 ? 1 : 0 }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{
              width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'0.85rem',
              background: current > n ? 'var(--green-bg)' : current === n ? 'var(--gold-bg)' : 'var(--elevated)',
              border: `1px solid ${current > n ? 'var(--green-b)' : current === n ? 'var(--gold-b)' : 'var(--b-soft)'}`,
              color:   current > n ? 'var(--green)' : current === n ? 'var(--gold)' : 'var(--muted)',
              transition:'all 250ms',
            }}>
              {current > n ? '✓' : emoji}
            </div>
            <span style={{ fontSize:'0.65rem', fontWeight:500, color: current === n ? 'var(--gold)' : 'var(--muted)', whiteSpace:'nowrap' }}>
              {label}
            </span>
          </div>
          {idx < steps.length-1 && (
            <div style={{ flex:1, height:1, background: current > n ? 'var(--green)' : 'var(--b-subtle)', margin:'0 8px', marginBottom:20, opacity: current > n ? 0.5 : 1 }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NuevaCita() {
  const navigate = useNavigate();
  const { showToast, servicios, clientes, citas, agregarCita, fechaStrMX } = useApp();

  const [step,      setStep]      = useState(1);
  const [servicio,  setServicio]  = useState(null);
  const [fecha,     setFecha]     = useState(null);
  const [hora,      setHora]      = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [busqueda,  setBusqueda]  = useState('');
  const [saving,    setSaving]    = useState(false);

  const hoyMX = nowMX();
  hoyMX.setHours(0,0,0,0);

  const dias = Array.from({ length: 14 }, (_, i) => addDays(hoyMX, i))
    .filter(d => d.getDay() !== 0);

  // FIX: verificar disponibilidad real con datos de Firebase
  const horariosOcupados = fecha
    ? new Set(
        citas
          .filter(a => a.fechaStr === fechaStrMX(fecha) && a.estado !== 'cancelled')
          .map(a => a.hora)
      )
    : new Set();

  const clientesFiltrados = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono?.includes(busqueda)
  );

  const clienteSeleccionado = clientes.find(c => c.id === clienteId);

  const handleConfirm = async () => {
    if (!servicio || !fecha || !hora || !clienteId) return;
    setSaving(true);
    try {
      await agregarCita({
        clientId:      clienteId,
        clienteNombre: clienteSeleccionado?.nombre || '',
        servicio:      servicio.nombre,
        precio:        Number(servicio.precio) || 0,
        duracion:      Number(servicio.duracion) || 30,
        hora,
        fechaStr:      fechaStrMX(fecha),
        estado:        'confirmed',
      });
      showToast(`Cita agendada para ${clienteSeleccionado?.nombre?.split(' ')[0]} 🎉`, 'success');
      navigate('/agenda');
    } catch (err) {
      showToast(err.message || 'Error al agendar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = (active) => ({
    padding:'16px', textAlign:'left', width:'100%',
    background:    active ? 'var(--gold-bg)' : 'var(--surface)',
    border:        `1px solid ${active ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
    borderRadius:  'var(--r-lg)', cursor:'pointer',
    fontFamily:    'var(--font-b)', transition:'all 150ms',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>
      <Stepper current={step} />

      {/* PASO 1 — Servicio */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Qué servicio necesita?</h2>
          {servicios.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:'0.875rem' }}>
              Sin servicios configurados. Ve a Configuración para agregar.
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
              {servicios.map(svc => (
                <button key={svc.id} onClick={() => setServicio(svc)} style={{ ...cardStyle(servicio?.id === svc.id), display:'flex', flexDirection:'column', gap:4 }}>
                  <span style={{ fontSize:'1.4rem' }}>{svc.emoji || '✂️'}</span>
                  <span style={{ fontSize:'0.82rem', fontWeight:500, color:'var(--text)' }}>{svc.nombre}</span>
                  <span style={{ fontFamily:'var(--font-m)', fontSize:'0.9rem', color:'var(--gold)', fontWeight:500 }}>${svc.precio}</span>
                  <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{svc.duracion} min</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setStep(2)} disabled={!servicio} style={{
            height:44, background: servicio ? 'var(--gold)' : 'var(--elevated)',
            color: servicio ? '#000' : 'var(--muted)', borderRadius:'var(--r-md)',
            fontWeight:600, fontSize:'0.9rem', fontFamily:'var(--font-b)', transition:'all 200ms', opacity: servicio ? 1 : 0.5,
          }}>Continuar →</button>
        </div>
      )}

      {/* PASO 2 — Fecha y hora */}
      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Cuándo?</h2>

          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
            {dias.map(day => (
              <button key={day.toISOString()} onClick={() => { setFecha(day); setHora(null); }} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                minWidth:52, padding:'10px 8px', fontFamily:'var(--font-b)',
                background: fecha?.toDateString() === day.toDateString() ? 'var(--gold-bg)' : 'var(--surface)',
                border: `1px solid ${fecha?.toDateString() === day.toDateString() ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                borderRadius:'var(--r-md)', transition:'all 150ms', flexShrink:0,
              }}>
                <span style={{ fontSize:'0.6rem', textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{DAYS_ES[day.getDay()]}</span>
                <span style={{ fontFamily:'var(--font-d)', fontSize:'1.2rem', fontWeight:500, color: fecha?.toDateString() === day.toDateString() ? 'var(--gold)' : 'var(--text)' }}>{day.getDate()}</span>
                <span style={{ fontSize:'0.55rem', color:'var(--muted)' }}>{MONTHS_ES[day.getMonth()]}</span>
              </button>
            ))}
          </div>

          {fecha && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
              {HORARIOS.map(h => {
                const ocupado = horariosOcupados.has(h);
                return (
                  <button key={h} onClick={() => !ocupado && setHora(h)} disabled={ocupado} style={{
                    padding:'10px 6px', fontFamily:'var(--font-m)', fontSize:'0.78rem',
                    background: hora === h ? 'var(--gold-bg)' : ocupado ? 'var(--overlay)' : 'var(--surface)',
                    border: `1px solid ${hora === h ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                    color: hora === h ? 'var(--gold)' : ocupado ? 'var(--muted)' : 'var(--text2)',
                    borderRadius:'var(--r-sm)', transition:'all 150ms',
                    opacity: ocupado ? 0.4 : 1, cursor: ocupado ? 'not-allowed' : 'pointer',
                    textDecoration: ocupado ? 'line-through' : 'none',
                  }}>{h}</button>
                );
              })}
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep(1)} style={{ height:44, padding:'0 20px', background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.875rem', fontFamily:'var(--font-b)' }}>← Atrás</button>
            <button onClick={() => setStep(3)} disabled={!fecha || !hora} style={{ flex:1, height:44, background:(fecha&&hora)?'var(--gold)':'var(--elevated)', color:(fecha&&hora)?'#000':'var(--muted)', borderRadius:'var(--r-md)', fontWeight:600, fontSize:'0.875rem', fontFamily:'var(--font-b)', transition:'all 200ms', opacity:(fecha&&hora)?1:0.5 }}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* PASO 3 — Cliente */}
      {step === 3 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Para quién?</h2>

          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { k:'Servicio', v: servicio?.nombre },
              { k:'Precio',   v: `$${servicio?.precio} MXN` },
              { k:'Fecha',    v: fecha ? `${DAYS_ES[fecha.getDay()]} ${fecha.getDate()} de ${MONTHS_ES[fecha.getMonth()]}` : '' },
              { k:'Hora',     v: hora },
            ].map(({ k, v }) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text2)' }}>{k}</span>
                <strong style={{ color: k === 'Precio' ? 'var(--gold)' : 'var(--text)' }}>{v}</strong>
              </div>
            ))}
          </div>

          <input
            style={{ width:'100%', height:44, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'0 14px', color:'var(--text)', fontSize:'0.875rem' }}
            placeholder="Buscar clienta..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />

          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
            {clientesFiltrados.length === 0 ? (
              <p style={{ textAlign:'center', color:'var(--muted)', fontSize:'0.8rem', padding:16 }}>Sin resultados</p>
            ) : clientesFiltrados.slice(0, 8).map(c => (
              <button key={c.id} onClick={() => setClienteId(c.id)} style={{
                display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                background: clienteId === c.id ? 'var(--gold-bg)' : 'var(--surface)',
                border: `1px solid ${clienteId === c.id ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                borderRadius:'var(--r-md)', textAlign:'left', fontFamily:'var(--font-b)', transition:'all 150ms',
              }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', flexShrink:0 }}>
                  {(c.nombre||'?')[0]}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nombre}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{c.telefono || 'Sin teléfono'}</div>
                </div>
                {clienteId === c.id && <span style={{ color:'var(--gold)', flexShrink:0 }}>✓</span>}
              </button>
            ))}
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep(2)} style={{ height:44, padding:'0 20px', background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.875rem', fontFamily:'var(--font-b)' }}>← Atrás</button>
            <button onClick={handleConfirm} disabled={saving || !clienteId} style={{
              flex:1, height:44, background: clienteId ? 'var(--green)' : 'var(--elevated)',
              color: clienteId ? '#000' : 'var(--muted)', borderRadius:'var(--r-md)',
              fontWeight:600, fontSize:'0.875rem', fontFamily:'var(--font-b)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all 200ms', opacity: clienteId ? 1 : 0.5,
            }}>
              {saving
                ? <span style={{ width:18, height:18, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                : '✓ Confirmar cita'
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}