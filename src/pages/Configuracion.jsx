import { useState } from 'react';
import { useApp } from '../context/AppContext';

const EMOJIS = ['✂️','🪒','💈','⚡','✨','👦','💇','🧴','💆','🎨'];

export default function Configuracion() {
  const { showToast, servicios, guardarServicio, eliminarServicio, citas } = useApp();

  const [editandoId, setEditandoId] = useState(null);
  const [form,       setForm]       = useState({});
  const [saving,     setSaving]     = useState(false);
  const [agregando,  setAgregando]  = useState(false);
  const [nuevoForm,  setNuevoForm]  = useState({ nombre:'', precio:'', duracion:'30', emoji:'✂️' });

  // Calcular cuántas veces se usó cada servicio
  const usoPorServicio = {};
  citas.forEach(a => {
    if (a.estado !== 'cancelled') {
      usoPorServicio[a.servicio] = (usoPorServicio[a.servicio] || 0) + 1;
    }
  });

  const abrirEditar = (svc) => {
    setEditandoId(svc.id);
    setForm({ nombre: svc.nombre, precio: String(svc.precio), duracion: String(svc.duracion||30), emoji: svc.emoji||'✂️' });
  };

  // Validar que solo sean números en el precio
  const handlePrecioChange = (value, setFn) => {
    // Solo permitir dígitos
    const soloNumeros = value.replace(/\D/g, '');
    setFn(f => ({...f, precio: soloNumeros}));
  };

  // Validar que solo sean números en duración
  const handleDuracionChange = (value, setFn) => {
    const soloNumeros = value.replace(/\D/g, '');
    setFn(f => ({...f, duracion: soloNumeros}));
  };

  const handleGuardar = async (id) => {
    const precio = Number(form.precio);
    if (!form.nombre?.trim()) { showToast('El nombre es obligatorio', 'error'); return; }
    if (isNaN(precio) || precio <= 0) { showToast('El precio debe ser mayor a 0', 'error'); return; }
    if (precio > 10000) { showToast('El precio parece muy alto', 'warning'); return; }
    setSaving(true);
    try {
      await guardarServicio(id, { ...form, precio });
      setEditandoId(null);
      showToast('Servicio guardado ✓', 'success');
    } catch(err) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally { setSaving(false); }
  };

  const handleEliminar = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar "${nombre}"?`)) return;
    try {
      await eliminarServicio(id);
      showToast('Servicio eliminado', 'info');
    } catch { showToast('Error al eliminar', 'error'); }
  };

  const handleAgregar = async () => {
    const precio = Number(nuevoForm.precio);
    if (!nuevoForm.nombre?.trim()) { showToast('El nombre es obligatorio', 'error'); return; }
    if (isNaN(precio) || precio <= 0) { showToast('El precio debe ser mayor a 0', 'error'); return; }
    if (precio > 10000) { showToast('El precio parece muy alto', 'warning'); return; }
    setSaving(true);
    try {
      await guardarServicio(null, { ...nuevoForm, precio });
      setAgregando(false);
      setNuevoForm({ nombre:'', precio:'', duracion:'30', emoji:'✂️' });
      showToast('Servicio agregado ✓', 'success');
    } catch(err) {
      showToast(err.message || 'Error al agregar', 'error');
    } finally { setSaving(false); }
  };

  const inp = {
    background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)',
    padding:'0 12px', color:'var(--text)', fontSize:'0.875rem', fontFamily:'var(--font-b)',
  };

  // Ingresos potenciales por servicio (precio × usos)
  const ingresosPorServicio = (svc) => {
    const usos = usoPorServicio[svc.nombre] || 0;
    return usos * svc.precio;
  };

  // Stats globales
  const totalIngresos = servicios.reduce((sum, svc) => sum + ingresosPorServicio(svc), 0);
  const totalCitas = Object.values(usoPorServicio).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>

      {/* Stats globales de servicios */}
      {servicios.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem', fontWeight:500, color:'var(--gold)' }}>{servicios.length}</div>
            <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>Servicios</div>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem', fontWeight:500, color:'var(--green)' }}>
              ${Math.min(...servicios.map(s => s.precio))}–${Math.max(...servicios.map(s => s.precio))}
            </div>
            <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>Rango precios</div>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem', fontWeight:500, color:'var(--blue)' }}>
              ${totalIngresos.toLocaleString()}
            </div>
            <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>Ingresos totales</div>
          </div>
        </div>
      )}

      {/* Catálogo */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-xl)', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>💈</span>
          <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, flex:1 }}>Catálogo de servicios</h3>
          <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{totalCitas} citas totales</span>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {servicios.length === 0 && (
            <p style={{ fontSize:'0.8rem', color:'var(--muted)', textAlign:'center', padding:12 }}>Sin servicios aún.</p>
          )}

          {servicios.map(svc => {
            const usos = usoPorServicio[svc.nombre] || 0;
            const ingresos = ingresosPorServicio(svc);
            return (
              <div key={svc.id} style={{ background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', overflow:'hidden' }}>
                {editandoId === svc.id ? (
                  <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
                    {/* Emoji picker */}
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => setForm(f => ({...f, emoji:e}))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', fontSize:'1.1rem', background: form.emoji===e ? 'var(--gold-bg)' : 'transparent', border: form.emoji===e ? '1px solid var(--gold-b)' : '1px solid transparent' }}>
                          {e}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <div style={{ flex:2, minWidth:120, display:'flex', flexDirection:'column', gap:4 }}>
                        <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Nombre</label>
                        <input style={{ ...inp, height:36, width:'100%' }} value={form.nombre} onChange={e => setForm(f => ({...f, nombre:e.target.value}))} autoFocus />
                      </div>
                      <div style={{ flex:1, minWidth:70, display:'flex', flexDirection:'column', gap:4 }}>
                        <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Precio $</label>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          pattern="[0-9]*"
                          style={{ ...inp, height:36, width:'100%' }} 
                          value={form.precio} 
                          onChange={e => handlePrecioChange(e.target.value, setForm)}
                          placeholder="100"
                        />
                      </div>
                      <div style={{ flex:1, minWidth:70, display:'flex', flexDirection:'column', gap:4 }}>
                        <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Min</label>
                        <input 
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          style={{ ...inp, height:36, width:'100%' }} 
                          value={form.duracion} 
                          onChange={e => handleDuracionChange(e.target.value, setForm)}
                        />
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => setEditandoId(null)} style={{ flex:1, height:34, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.8rem', fontFamily:'var(--font-b)' }}>Cancelar</button>
                      <button onClick={() => handleGuardar(svc.id)} disabled={saving} style={{ flex:2, height:34, background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600, fontFamily:'var(--font-b)' }}>
                        {saving ? '...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 12px' }}>
                    <span style={{ fontSize:'1.25rem', flexShrink:0 }}>{svc.emoji||'✂️'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.85rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{svc.nombre}</div>
                      <div style={{ display:'flex', gap:8, marginTop:2 }}>
                        <span style={{ fontSize:'0.65rem', color:'var(--muted)' }}>{svc.duracion} min</span>
                        {usos > 0 && <span style={{ fontSize:'0.65rem', color:'var(--green)' }}>✓ {usos} citas · ${ingresos.toLocaleString()}</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily:'var(--font-m)', fontSize:'0.9rem', color:'var(--gold)', fontWeight:500, flexShrink:0 }}>${svc.precio}</span>
                    <button onClick={() => abrirEditar(svc)} style={{ width:26, height:26, borderRadius:'var(--r-sm)', color:'var(--muted)', fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.color='var(--gold)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--muted)'; }}
                    >✏️</button>
                    <button onClick={() => handleEliminar(svc.id, svc.nombre)} style={{ width:26, height:26, borderRadius:'var(--r-sm)', color:'var(--muted)', fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--muted)'; }}
                    >🗑</button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Form nuevo */}
          {agregando ? (
            <div style={{ padding:12, background:'var(--elevated)', border:'1px dashed var(--gold-b)', borderRadius:'var(--r-md)', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setNuevoForm(f => ({...f, emoji:e}))} style={{ width:32, height:32, borderRadius:'var(--r-sm)', fontSize:'1.1rem', background: nuevoForm.emoji===e ? 'var(--gold-bg)' : 'transparent', border: nuevoForm.emoji===e ? '1px solid var(--gold-b)' : '1px solid transparent' }}>
                    {e}
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div style={{ flex:2, minWidth:120, display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Nombre *</label>
                  <input style={{ ...inp, height:36, width:'100%' }} placeholder="Ej: Corte de cabello" value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({...f, nombre:e.target.value}))} autoFocus />
                </div>
                <div style={{ flex:1, minWidth:70, display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Precio $ *</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    style={{ ...inp, height:36, width:'100%' }} 
                    placeholder="100" 
                    value={nuevoForm.precio} 
                    onChange={e => handlePrecioChange(e.target.value, setNuevoForm)}
                  />
                </div>
                <div style={{ flex:1, minWidth:70, display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:'0.7rem', color:'var(--text2)' }}>Min</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    style={{ ...inp, height:36, width:'100%' }} 
                    placeholder="30" 
                    value={nuevoForm.duracion} 
                    onChange={e => handleDuracionChange(e.target.value, setNuevoForm)}
                  />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setAgregando(false)} style={{ flex:1, height:34, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', color:'var(--text2)', fontSize:'0.8rem', fontFamily:'var(--font-b)' }}>Cancelar</button>
                <button onClick={handleAgregar} disabled={saving} style={{ flex:2, height:34, background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600, fontFamily:'var(--font-b)' }}>
                  {saving ? '...' : '+ Agregar'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAgregando(true)} style={{ height:36, background:'var(--gold-bg)', color:'var(--gold)', border:'1px dashed var(--gold-b)', borderRadius:'var(--r-md)', fontSize:'0.78rem', fontWeight:600, fontFamily:'var(--font-b)', transition:'all 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--gold)'; e.currentTarget.style.color='#000'; e.currentTarget.style.borderStyle='solid'; }}
              onMouseLeave={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.color='var(--gold)'; e.currentTarget.style.borderStyle='dashed'; }}
            >
              + Agregar servicio
            </button>
          )}
        </div>
      </div>

      {/* Info bot */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:14, display:'flex', flexDirection:'column', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>🤖</span>
          <h3 style={{ fontFamily:'var(--font-d)', fontSize:'0.9rem', fontWeight:500 }}>Bot de WhatsApp</h3>
        </div>
        <p style={{ fontSize:'0.75rem', color:'var(--muted)', lineHeight:1.5 }}>
          El bot usa estos servicios para agendar citas automáticamente. Los precios y nombres se muestran tal cual a las clientas.
        </p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
          <span style={{ fontSize:'0.68rem', padding:'3px 8px', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green-b)', borderRadius:'var(--r-full)' }}>✓ Recordatorios 24h</span>
          <span style={{ fontSize:'0.68rem', padding:'3px 8px', background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>✓ Agendado automático</span>
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 4px', fontSize:'0.68rem', color:'var(--muted)' }}>
        <span>Barbería Zaira</span>
        <span style={{ fontFamily:'var(--font-m)' }}>BarberBot v3.0</span>
      </div>
    </div>
  );
}
