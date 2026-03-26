import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/ui/Badge';
import { to12h } from '../mock/data';

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clientes, citas, actualizarCliente, eliminarCliente, showToast, loadingData } = useApp();

  const cliente = clientes.find(c => c.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ nombre:'', telefono:'', email:'', notas:'' });
  const [tab, setTab]         = useState('historial');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!loadingData && !cliente) {
      navigate('/clientes');
      return;
    }
    if (cliente) {
      setForm({
        nombre:   cliente.nombre   || '',
        telefono: cliente.telefono || '',
        email:    cliente.email    || '',
        notas:    cliente.notas    || '',
      });
    }
  }, [cliente, loadingData]);

  if (loadingData) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <span style={{ width:24, height:24, border:'2px solid var(--gold)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite', display:'block' }}/>
      </div>
    );
  }

  if (!cliente) return null;

  const historial = citas
    .filter(a => a.clientId === id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const completadas  = historial.filter(a => a.estado === 'completed');
  const totalGastado = completadas.reduce((s, a) => s + (Number(a.precio) || 0), 0);
  const servicioFav  = (() => {
    const c = {};
    completadas.forEach(a => { c[a.servicio] = (c[a.servicio]||0)+1; });
    return Object.entries(c).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
  })();

  const puntos    = Number(cliente.puntos) || 0;
  const nivel     = puntos >= 500 ? 'Gold ⭐' : puntos >= 200 ? 'Silver 🥈' : 'Bronze 🥉';
  const proxNivel = puntos >= 500 ? 1000 : puntos >= 200 ? 500 : 200;
  const pct       = Math.min(100, Math.round((puntos / proxNivel) * 100));

  const handleSave = async () => {
    setSaving(true);
    try {
      await actualizarCliente(id, form);
      setEditing(false);
      showToast('Clienta actualizada ✓', 'success');
    } catch (err) {
      console.error(err);
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    flex:1, height:36, background:'var(--surface)',
    border:'1px solid var(--b-soft)', borderRadius:'var(--r-sm)',
    padding:'0 10px', color:'var(--text)', fontSize:'0.875rem', fontFamily:'var(--font-b)',
  };

  const fechaLabel = (fecha) => {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return isNaN(d) ? '—' : d;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>

      {/* Header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-xl)', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
          <div style={{ width:68, height:68, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'1.8rem', flexShrink:0 }}>
            {(editing ? form.nombre : cliente.nombre || '?')[0]?.toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
            {editing
              ? <input style={{ ...inp, width:'100%', fontSize:'1rem', fontFamily:'var(--font-d)' }} value={form.nombre} onChange={e => setForm(v => ({...v, nombre:e.target.value}))} />
              : <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:500, marginBottom:3 }}>{cliente.nombre}</h2>
            }
            <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
              Cliente desde {MONTHS[new Date(cliente.creadoEn).getMonth()]} {new Date(cliente.creadoEn).getFullYear()}
            </span>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.8rem' }}>✕</button>
                <button onClick={handleSave} disabled={saving} style={{ height:32, padding:'0 14px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.78rem', fontWeight:600, fontFamily:'var(--font-b)', display:'flex', alignItems:'center', gap:5 }}>
                  {saving ? <span style={{ width:12, height:12, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }}/> : 'Guardar'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.85rem' }}>✏️</button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`¿Eliminar a ${cliente.nombre}?`)) return;
                    try {
                      await eliminarCliente(id);
                      showToast('Clienta eliminada', 'info');
                      navigate('/clientes');
                    } catch { showToast('Error al eliminar', 'error'); }
                  }}
                  style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.85rem' }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; }}
                >🗑</button>
              </>


            )}
          </div>
        </div>

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
                <a href={`tel:${cliente.telefono}`} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.78rem', color:'var(--text2)', padding:'5px 10px', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)' }}>
                  📞 {cliente.telefono}
                </a>
              )}
              {cliente.email && (
                <a href={`mailto:${cliente.email}`} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.78rem', color:'var(--text2)', padding:'5px 10px', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)' }}>
                  ✉️ {cliente.email}
                </a>
              )}
              {!cliente.telefono && !cliente.email && !editing && (
                <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Sin datos de contacto</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[
          ['💅', 'Visitas',    completadas.length,         'var(--gold)'],
          ['💰', 'Gastado',    `$${totalGastado}`,          'var(--green)'],
          ['✂️', 'Favorito',   servicioFav.split(' ')[0],  'var(--blue)'],
        ].map(([emoji, label, value, accent]) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderLeft:`3px solid ${accent}`, borderRadius:'var(--r-lg)', padding:14, display:'flex', alignItems:'center', gap:10 }}>
            <span>{emoji}</span>
            <div>
              <div style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500, lineHeight:1 }}>{value}</div>
              <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:1 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Loyalty */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>⭐</span>
          <span style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, flex:1 }}>{nivel}</span>
          <span style={{ fontFamily:'var(--font-m)', fontSize:'0.85rem', color:'var(--gold)', fontWeight:500 }}>{puntos} pts</span>
        </div>
        <div style={{ height:4, background:'var(--overlay)', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'var(--gold)', borderRadius:2, transition:'width 600ms var(--ease)' }} />
        </div>
        <span style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{proxNivel - puntos} pts para el siguiente nivel</span>
      </div>

      {/* CTAs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <button onClick={() => navigate(`/mensajes/${id}`)} style={{ height:42, display:'flex', alignItems:'center', justifyContent:'center', gap:7, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.82rem', fontWeight:500, fontFamily:'var(--font-b)' }}>
          💬 Enviar mensaje
        </button>
        <button onClick={() => navigate('/agenda/nueva')} style={{ height:42, display:'flex', alignItems:'center', justifyContent:'center', gap:7, background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.82rem', fontWeight:600, fontFamily:'var(--font-b)' }}>
          📅 Nueva cita
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--b-subtle)' }}>
        {[['historial','📋 Historial'], ['notas','📝 Notas']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding:'10px 16px', fontSize:'0.8rem', fontWeight:500, fontFamily:'var(--font-b)', color: tab===k?'var(--gold)':'var(--muted)', borderBottom: tab===k?'2px solid var(--gold)':'2px solid transparent', marginBottom:-1, transition:'all 150ms' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Historial */}
      {tab === 'historial' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {historial.length === 0
            ? <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:'0.875rem' }}>Sin historial de citas aún</div>
            : historial.map(a => {
              const d = a.fecha instanceof Date ? a.fecha : new Date(a.fecha);
              return (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:14, padding:14, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)' }}>
                  <div style={{ textAlign:'center', minWidth:36, flexShrink:0 }}>
                    <div style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, lineHeight:1 }}>{d.getDate()}</div>
                    <div style={{ fontSize:'0.62rem', color:'var(--muted)', textTransform:'uppercase' }}>{MONTHS[d.getMonth()]}</div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'0.85rem', fontWeight:500 }}>{a.servicio}</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginTop:2 }}>⏰ {to12h(a.hora)}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                    <StatusBadge estado={a.estado} />
                    {a.precio && <span style={{ fontFamily:'var(--font-m)', fontSize:'0.72rem', color:'var(--gold)' }}>${a.precio}</span>}
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* Notas */}
      {tab === 'notas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <textarea
            style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-lg)', padding:16, color:'var(--text)', fontSize:'0.875rem', lineHeight:1.55, resize:'vertical', fontFamily:'var(--font-b)' }}
            rows={6}
            placeholder="Notas sobre esta clienta: preferencias, alergias, corte favorito..."
            value={form.notas}
            onChange={e => setForm(v => ({...v, notas:e.target.value}))}
          />
          <button onClick={handleSave} disabled={saving} style={{ alignSelf:'flex-end', height:38, padding:'0 20px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.82rem', fontWeight:600, fontFamily:'var(--font-b)', display:'flex', alignItems:'center', gap:6 }}>
            {saving ? <span style={{ width:14, height:14, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }}/> : 'Guardar notas'}
          </button>
        </div>
      )}
    </div>
  );
}