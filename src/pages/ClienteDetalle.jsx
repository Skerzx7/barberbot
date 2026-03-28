import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { to12h } from '../mock/data';

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function tiempoRelativo(fechaStr) {
  if (!fechaStr) return null;
  const d = new Date(fechaStr + 'T12:00:00');
  const hoy = new Date();
  const diffDias = Math.floor((hoy - d) / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return 'Hoy';
  if (diffDias === 1) return 'Ayer';
  if (diffDias < 7) return `Hace ${diffDias} días`;
  if (diffDias < 30) return `Hace ${Math.floor(diffDias/7)} sem`;
  if (diffDias < 365) return `Hace ${Math.floor(diffDias/30)} meses`;
  return `Hace ${Math.floor(diffDias/365)} año${Math.floor(diffDias/365) > 1 ? 's' : ''}`;
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clientes, citas, actualizarCliente, eliminarCliente, showToast } = useApp();

  const cliente = clientes.find(c => c.id === id);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState('historial');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (cliente) setForm({ nombre: cliente.nombre||'', telefono: cliente.telefono||'', email: cliente.email||'', notas: cliente.notas||'' });
  }, [cliente]);

  if (!cliente) {
    return (
      <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>
        <p>Clienta no encontrada</p>
        <button onClick={() => navigate('/clientes')} style={{ marginTop:12, color:'var(--gold)', fontSize:'0.875rem' }}>← Volver</button>
      </div>
    );
  }

  const historial = citas
    .filter(a => a.clientId === id)
    .sort((a, b) => new Date(b.fechaStr||0) - new Date(a.fechaStr||0));

  const completadas  = historial.filter(a => a.estado === 'completed');
  const totalGastado = completadas.reduce((s, a) => s + (Number(a.precio)||0), 0);
  const servicioFav  = (() => {
    const counts = {};
    completadas.forEach(a => { counts[a.servicio] = (counts[a.servicio]||0)+1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
  })();

  // Próxima cita
  const hoy = new Date();
  const proximaCita = citas
    .filter(a => a.clientId === id && a.estado === 'confirmed')
    .map(a => ({ ...a, dt: new Date(a.fechaStr + 'T' + (a.hora || '00:00')) }))
    .filter(a => a.dt >= hoy)
    .sort((a,b) => a.dt - b.dt)[0] || null;

  // Última visita
  const ultimaVisita = completadas[0];

  const puntos    = cliente.puntos  || 0;
  const nivel     = puntos >= 500 ? 'Gold ⭐' : puntos >= 200 ? 'Silver 🥈' : 'Bronze 🥉';
  const proxNivel = puntos >= 500 ? 1000 : puntos >= 200 ? 500 : 200;
  const pct       = Math.min(100, Math.round((puntos / proxNivel) * 100));

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      await actualizarCliente(id, form);
      setEditing(false);
      showToast('Clienta actualizada ✓', 'success');
    } catch { showToast('Error al guardar', 'error'); }
    finally { setSaving(false); }
  };

  const handleEliminar = async () => {
    if (!window.confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarCliente(id);
      showToast('Clienta eliminada', 'info');
      navigate('/clientes');
    } catch { showToast('Error al eliminar', 'error'); }
  };

  const inp = { flex:1, height:36, background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-sm)', padding:'0 10px', color:'var(--text)', fontSize:'0.875rem', fontFamily:'var(--font-b)' };
  const creadoEn = cliente.creadoEn instanceof Date ? cliente.creadoEn : new Date(cliente.creadoEn || Date.now());

  const historialVisible = showAll ? historial : historial.slice(0, 5);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>

      {/* Header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-xl)', padding:18, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'1.7rem', flexShrink:0 }}>
            {(editing ? form.nombre : cliente.nombre)[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
            {editing
              ? <input style={{ ...inp, width:'100%', fontSize:'1rem', fontFamily:'var(--font-d)' }} value={form.nombre} onChange={e => setForm(v => ({...v, nombre:e.target.value}))} />
              : <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem', fontWeight:500, marginBottom:2 }}>{cliente.nombre}</h2>
            }
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:3 }}>
              <span style={{ fontSize:'0.7rem', color:'var(--muted)' }}>
                Desde {MONTHS[creadoEn.getMonth()]} {creadoEn.getFullYear()}
              </span>
              {ultimaVisita && (
                <span style={{ fontSize:'0.7rem', color:'var(--text2)' }}>
                  · Última visita: {tiempoRelativo(ultimaVisita.fechaStr)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.8rem' }}>✕</button>
                <button onClick={handleSave} disabled={saving} style={{ height:32, padding:'0 14px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.78rem', fontWeight:600, fontFamily:'var(--font-b)' }}>
                  {saving ? '...' : 'Guardar'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.85rem' }}>✏️</button>
                <button onClick={handleEliminar} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.85rem' }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; }}
                >🗑</button>
              </>
            )}
          </div>
        </div>

        {/* Contacto */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {editing ? (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:160 }}>
                <span style={{ color:'var(--muted)', fontSize:'0.8rem' }}>📞</span>
                <input style={inp} value={form.telefono} placeholder="Teléfono" onChange={e => setForm(v => ({...v, telefono:e.target.value}))} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:160 }}>
                <span style={{ color:'var(--muted)', fontSize:'0.8rem' }}>✉️</span>
                <input style={inp} value={form.email} placeholder="Email" onChange={e => setForm(v => ({...v, email:e.target.value}))} />
              </div>
            </>
          ) : (
            <>
              {cliente.telefono && (
                <>
                  <a href={`tel:${cliente.telefono}`} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'var(--text2)', padding:'5px 10px', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)' }}>
                    📞 {cliente.telefono}
                  </a>
                  {/* WhatsApp directo */}
                  <a href={`https://wa.me/52${cliente.telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'var(--green)', padding:'5px 10px', background:'var(--green-bg)', border:'1px solid var(--green-b)', borderRadius:'var(--r-full)' }}>
                    💬 WhatsApp
                  </a>
                </>
              )}
              {cliente.email && (
                <a href={`mailto:${cliente.email}`} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.75rem', color:'var(--text2)', padding:'5px 10px', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)' }}>
                  ✉️ {cliente.email}
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Próxima cita */}
      {proximaCita && (
        <div style={{ background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)', padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:'1.1rem' }}>📅</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'0.72rem', color:'var(--gold)', fontWeight:600, marginBottom:1 }}>Próxima cita</div>
            <div style={{ fontSize:'0.85rem', color:'var(--text)' }}>
              {proximaCita.servicio} · {to12h(proximaCita.hora)}
            </div>
            <div style={{ fontSize:'0.7rem', color:'var(--gold)' }}>
              {new Date(proximaCita.fechaStr+'T12:00:00').toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })}
            </div>
          </div>
          <button onClick={() => navigate(`/agenda`)} style={{ fontSize:'0.7rem', color:'var(--gold)', padding:'4px 10px', background:'rgba(0,0,0,.1)', borderRadius:'var(--r-sm)', border:'1px solid var(--gold-b)' }}>Ver →</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {[
          { emoji:'📅', label:'Visitas',  value: cliente.visitas||0,          accent:'var(--gold)'  },
          { emoji:'💰', label:'Gastado',  value: `$${totalGastado}`,           accent:'var(--green)' },
          { emoji:'✂️', label:'Favorito', value: servicioFav.split(' ')[0],    accent:'var(--blue)'  },
        ].map(({ emoji, label, value, accent }) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderLeft:`3px solid ${accent}`, borderRadius:'var(--r-lg)', padding:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:'0.9rem' }}>{emoji}</span>
            <div>
              <div style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, lineHeight:1 }}>{value}</div>
              <div style={{ fontSize:'0.62rem', color:'var(--muted)', marginTop:1 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Loyalty */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)', padding:14, display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:'1rem' }}>⭐</span>
          <span style={{ fontFamily:'var(--font-d)', fontSize:'0.95rem', fontWeight:500, flex:1 }}>{nivel}</span>
          <span style={{ fontFamily:'var(--font-m)', fontSize:'0.85rem', color:'var(--gold)', fontWeight:500 }}>{puntos} pts</span>
        </div>
        <div style={{ height:4, background:'var(--overlay)', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'var(--gold)', borderRadius:2, transition:'width 600ms var(--ease)' }} />
        </div>
        <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{proxNivel - puntos} pts para el siguiente nivel</span>
      </div>

      {/* CTAs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <button onClick={() => navigate(`/mensajes/${id}`)} style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.8rem', fontWeight:500 }}>
          💬 Chat
        </button>
        <button onClick={() => navigate('/agenda/nueva')} style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600 }}>
          📅 Nueva cita
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--b-subtle)' }}>
        {[['historial','📋 Historial'], ['notas','📝 Notas']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:'8px 14px', fontSize:'0.78rem', fontWeight:500, fontFamily:'var(--font-b)', color: tab===k ? 'var(--gold)' : 'var(--muted)', borderBottom: tab===k ? '2px solid var(--gold)' : '2px solid transparent', marginBottom:-1, transition:'all 150ms' }}>{label}</button>
        ))}
      </div>

      {tab === 'historial' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {historial.length === 0
            ? <div style={{ padding:28, textAlign:'center', color:'var(--muted)', fontSize:'0.875rem' }}>Sin historial aún</div>
            : <>
                {historialVisible.map(a => {
                  const d = new Date((a.fechaStr||'') + 'T12:00:00');
                  return (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:12, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', opacity: a.estado === 'cancelled' ? 0.5 : 1 }}>
                      <div style={{ textAlign:'center', minWidth:34, flexShrink:0 }}>
                        <div style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, lineHeight:1 }}>{d.getDate()}</div>
                        <div style={{ fontSize:'0.6rem', color:'var(--muted)', textTransform:'uppercase' }}>{MONTHS[d.getMonth()]}</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'0.82rem', fontWeight:500 }}>{a.servicio}</div>
                        <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginTop:2 }}>⏰ {to12h(a.hora)}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                        <StatusBadge estado={a.estado} />
                        {a.precio > 0 && <span style={{ fontFamily:'var(--font-m)', fontSize:'0.7rem', color:'var(--gold)' }}>${a.precio}</span>}
                      </div>
                    </div>
                  );
                })}
                {historial.length > 5 && (
                  <button onClick={() => setShowAll(v => !v)} style={{ padding:'8px', fontSize:'0.75rem', color:'var(--muted)', textAlign:'center', background:'transparent', transition:'color 150ms' }}
                    onMouseEnter={e => e.currentTarget.style.color='var(--gold)'}
                    onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}
                  >
                    {showAll ? '↑ Mostrar menos' : `↓ Ver ${historial.length - 5} más`}
                  </button>
                )}
              </>
          }
        </div>
      )}

      {tab === 'notas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <textarea
            style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-lg)', padding:14, color:'var(--text)', fontSize:'0.875rem', lineHeight:1.55, resize:'vertical', fontFamily:'var(--font-b)' }}
            rows={6}
            placeholder="Preferencias, alergias, corte favorito..."
            value={form.notas}
            onChange={e => setForm(v => ({...v, notas: e.target.value}))}
          />
          <button onClick={handleSave} disabled={saving} style={{ alignSelf:'flex-end', height:36, padding:'0 18px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600, fontFamily:'var(--font-b)' }}>
            {saving ? '...' : 'Guardar notas'}
          </button>
        </div>
      )}
    </div>
  );
}