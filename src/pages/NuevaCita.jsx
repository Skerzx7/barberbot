import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { to12h } from '../mock/data';
import { useApp } from '../context/AppContext';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_CORTOS = ['L','M','X','J','V','S','D'];
const DIAS_ES = ['dom','lun','mar','mié','jue','vie','sáb'];
const EMOJIS = ['💫','🌸','✨','💎','🌿','🦋','💜','🎀','⭐','🔥','💅','🌺','🪄','🩷'];

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
              width:34, height:34, borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.85rem',
              background: current>n ? 'var(--green-bg)' : current===n ? 'var(--gold-bg)' : 'var(--elevated)',
              border: `1px solid ${current>n ? 'var(--green-b)' : current===n ? 'var(--gold-b)' : 'var(--b-soft)'}`,
              color: current>n ? 'var(--green)' : current===n ? 'var(--gold)' : 'var(--muted)',
              transition:'all 250ms',
            }}>
              {current > n ? '✓' : emoji}
            </div>
            <span style={{ fontSize:'0.65rem', fontWeight:500, color: current===n?'var(--gold)':'var(--muted)', whiteSpace:'nowrap' }}>{label}</span>
          </div>
          {idx < steps.length-1 && (
            <div style={{ flex:1, height:1, background: current>n?'var(--green)':'var(--b-subtle)', margin:'0 8px', marginBottom:20, opacity:current>n?0.5:1 }} />
          )}
        </div>
      ))}
    </div>
  );
}

const inp = {
  height:40, background:'var(--elevated)',
  border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)',
  padding:'0 12px', color:'var(--text)', fontSize:'0.875rem',
  fontFamily:'var(--font-b)', width:'100%',
};

export default function NuevaCita() {
  const navigate = useNavigate();
  const { showToast, agregarCita, clientes, agregarCliente, servicios } = useApp();

  const [step, setStep]           = useState(1);
  const [servicio, setServicio]   = useState(null);
  const [esPersonalizado, setEsPersonalizado] = useState(false);
  const [servicioCustom, setServicioCustom]   = useState({ nombre:'', precio:'', duracion:'30', emoji:'💫' });
  const [mesVista, setMesVista]   = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [fecha, setFecha]         = useState(null);
  const [hora, setHora]           = useState('');
  const [clienteId, setClienteId] = useState(null);
  const [busqueda, setBusqueda]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [modoNuevo, setModoNuevo] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre:'', telefono:'' });

  const cambiarMes = (delta) => {
    const nueva = new Date(mesVista.getFullYear(), mesVista.getMonth() + delta, 1);
    setMesVista(nueva);
    if (fecha && (fecha.getMonth() !== nueva.getMonth() || fecha.getFullYear() !== nueva.getFullYear())) {
      setFecha(null);
      setHora('');
    }
  };

  const anio = mesVista.getFullYear();
  const mes  = mesVista.getMonth();
  const diasEnMes    = new Date(anio, mes+1, 0).getDate();
  const offsetInicio = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const hoyStr = new Date().toDateString();

  const clientesFiltrados = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono?.includes(busqueda)
  );
  const clienteSeleccionado = clientes.find(c => c.id === clienteId);

  const servicioFinal = esPersonalizado
    ? {
        nombre:   servicioCustom.nombre || 'Servicio personalizado',
        precio:   Number(servicioCustom.precio) || 0,
        duracion: Number(servicioCustom.duracion) || 30,
        emoji:    servicioCustom.emoji,
      }
    : servicio;

  const puedeAvanzar1  = servicio || (esPersonalizado && servicioCustom.nombre.trim());
  const puedeAvanzar2  = fecha && hora;
  const puedeConfirmar = clienteId || (modoNuevo && nuevoCliente.nombre.trim());

  const handleConfirm = async () => {
    setSaving(true);
    try {
      let cid    = clienteId;
      let nombre = clienteSeleccionado?.nombre;

      if (modoNuevo && nuevoCliente.nombre.trim()) {
        const nuevo = await agregarCliente(nuevoCliente);
        cid    = nuevo.id;
        nombre = nuevo.nombre;
      }

      await agregarCita({
        clientId:      cid,
        clienteNombre: nombre || 'Cliente',
        servicio:      servicioFinal.nombre,
        precio:        servicioFinal.precio,
        duracion:      servicioFinal.duracion,
        hora,
        fecha:         new Date(fecha),
        estado:        'confirmed',
      });

      showToast(`Cita agendada para ${nombre?.split(' ')[0]} 🎉`, 'success');
      navigate('/agenda');
    } catch (err) {
      console.error(err);
      showToast('Error al agendar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const btnPrimary = (disabled) => ({
    height:44, flex:1,
    background: disabled ? 'var(--elevated)' : 'var(--gold)',
    color: disabled ? 'var(--muted)' : '#000',
    borderRadius:'var(--r-md)', fontWeight:600,
    fontSize:'0.9rem', fontFamily:'var(--font-b)',
    opacity: disabled ? 0.5 : 1,
    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    transition:'all 200ms',
  });

  const btnBack = {
    height:44, padding:'0 20px',
    background:'var(--elevated)', border:'1px solid var(--b-soft)',
    borderRadius:'var(--r-md)', color:'var(--text2)',
    fontSize:'0.875rem', fontFamily:'var(--font-b)',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>
      <Stepper current={step} />

      {/* PASO 1 — Servicio */}
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Qué servicio?</h2>

          {servicios.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:'0.875rem', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)' }}>
              Sin servicios configurados. Ve a Configuración para agregarlos.
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
              {servicios.map(svc => (
                <button key={svc.id} onClick={() => { setServicio(svc); setEsPersonalizado(false); }} style={{
                  display:'flex', flexDirection:'column', gap:4, padding:16, textAlign:'left',
                  background: !esPersonalizado && servicio?.id===svc.id ? 'var(--gold-bg)' : 'var(--surface)',
                  border: `1px solid ${!esPersonalizado && servicio?.id===svc.id ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                  borderRadius:'var(--r-lg)', cursor:'pointer', fontFamily:'var(--font-b)', transition:'all 150ms',
                }}>
                  <span style={{ fontSize:'1.4rem' }}>{svc.emoji}</span>
                  <span style={{ fontSize:'0.82rem', fontWeight:500, color:'var(--text)' }}>{svc.nombre}</span>
                  <span style={{ fontFamily:'var(--font-m)', fontSize:'0.9rem', color:'var(--gold)', fontWeight:500 }}>${svc.precio}</span>
                  <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{svc.duracion} min</span>
                </button>
              ))}

              <button onClick={() => { setEsPersonalizado(true); setServicio(null); }} style={{
                display:'flex', flexDirection:'column', gap:4, padding:16, textAlign:'left',
                background: esPersonalizado ? 'var(--gold-bg)' : 'var(--surface)',
                border: `1px solid ${esPersonalizado ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                borderRadius:'var(--r-lg)', cursor:'pointer', fontFamily:'var(--font-b)', transition:'all 150ms',
                gridColumn:'span 2',
              }}>
                <span style={{ fontSize:'1.4rem' }}>🎨</span>
                <span style={{ fontSize:'0.82rem', fontWeight:500, color:'var(--text)' }}>Servicio personalizado</span>
                <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>Algo especial o a la medida</span>
              </button>
            </div>
          )}

          {esPersonalizado && (
            <div style={{ background:'var(--elevated)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:'0.78rem', color:'var(--text2)' }}>Describe el servicio:</p>
              <div style={{ display:'flex', gap:8 }}>
                <input style={{ ...inp, flex:1 }} placeholder="Nombre *" value={servicioCustom.nombre} onChange={e => setServicioCustom(v => ({...v, nombre:e.target.value}))} />
                <select style={{ ...inp, width:64, padding:'0 6px', cursor:'pointer' }} value={servicioCustom.emoji} onChange={e => setServicioCustom(v => ({...v, emoji:e.target.value}))}>
                  {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Precio ($)</label>
                  <input type="number" style={inp} placeholder="0" value={servicioCustom.precio} onChange={e => setServicioCustom(v => ({...v, precio:e.target.value}))} />
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Duración (min)</label>
                  <input type="number" style={inp} placeholder="30" value={servicioCustom.duracion} onChange={e => setServicioCustom(v => ({...v, duracion:e.target.value}))} />
                </div>
              </div>
            </div>
          )}

          <button onClick={() => setStep(2)} disabled={!puedeAvanzar1} style={btnPrimary(!puedeAvanzar1)}>
            Continuar →
          </button>
        </div>
      )}

      {/* PASO 2 — Fecha y hora */}
      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Cuándo?</h2>

          {/* Navegador mes */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:'12px 16px' }}>
            <button onClick={() => cambiarMes(-1)} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'1rem' }}>←</button>
            <span style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500 }}>
              {MESES[mes]} <span style={{ fontSize:'0.82rem', color:'var(--text2)', fontFamily:'var(--font-b)' }}>{anio}</span>
            </span>
            <button onClick={() => cambiarMes(1)} style={{ width:32, height:32, borderRadius:'var(--r-sm)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'1rem' }}>→</button>
          </div>

          {/* Calendario */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:8 }}>
              {DIAS_CORTOS.map(d => (
                <span key={d} style={{ textAlign:'center', fontSize:'0.65rem', color:'var(--muted)', fontWeight:600, padding:'4px 0' }}>{d}</span>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
              {Array.from({ length: offsetInicio }, (_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: diasEnMes }, (_, i) => {
                const day    = new Date(anio, mes, i+1);
                const isPast = day < new Date(new Date().setHours(0,0,0,0));
                const isSun  = day.getDay() === 0;
                const isSelec = fecha && day.toDateString() === fecha.toDateString();
                const isHoy  = day.toDateString() === hoyStr;
                return (
                  <button
                    key={i}
                    disabled={isPast || isSun}
                    onClick={() => { setFecha(day); setHora(''); }}
                    style={{
                      aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center',
                      borderRadius:'var(--r-sm)', fontFamily:'var(--font-b)', fontSize:'0.85rem',
                      background: isSelec ? 'var(--gold)' : isHoy ? 'var(--gold-bg)' : 'transparent',
                      color: isSelec ? '#000' : isPast||isSun ? 'var(--muted)' : isHoy ? 'var(--gold)' : 'var(--text)',
                      border: isSelec ? '1px solid var(--gold)' : isHoy ? '1px solid var(--gold-b)' : '1px solid transparent',
                      cursor: isPast||isSun ? 'not-allowed' : 'pointer',
                      opacity: isPast||isSun ? 0.3 : 1,
                      fontWeight: isSelec||isHoy ? 700 : 400,
                      transition:'all 150ms',
                    }}
                  >{i+1}</button>
                );
              })}
            </div>
          </div>

          {/* Selector de hora */}
          {fecha && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <label style={{ fontSize:'0.78rem', color:'var(--text2)', fontWeight:500 }}>
                Hora para el {fecha.getDate()} de {MESES[fecha.getMonth()]}:
              </label>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <input
                  type="time"
                  style={{
                    flex:1, height:44,
                    background:'var(--elevated)',
                    border:'1px solid var(--b-soft)',
                    borderRadius:'var(--r-md)',
                    padding:'0 14px', color:'var(--text)',
                    fontSize:'1rem', fontFamily:'var(--font-m)',
                    colorScheme:'dark',
                  }}
                  value={hora}
                  onChange={e => setHora(e.target.value)}
                />
                {hora && (
                  <div style={{
                    height:44, padding:'0 16px',
                    background:'var(--gold-bg)', border:'1px solid var(--gold-b)',
                    borderRadius:'var(--r-md)', display:'flex', alignItems:'center',
                    fontFamily:'var(--font-m)', fontSize:'0.9rem',
                    color:'var(--gold)', fontWeight:600, flexShrink:0,
                  }}>
                    {to12h(hora)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setStep(1)} style={btnBack}>← Atrás</button>
            <button onClick={() => setStep(3)} disabled={!puedeAvanzar2} style={btnPrimary(!puedeAvanzar2)}>Continuar →</button>
          </div>
        </div>
      )}

      {/* PASO 3 — Cliente */}
      {step === 3 && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, animation:'slideUp .3s var(--ease) both' }}>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'1.4rem', fontWeight:400 }}>¿Para quién?</h2>

          {/* Resumen */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            {[
              ['Servicio', `${servicioFinal?.emoji || ''} ${servicioFinal?.nombre}`],
              ['Precio',   `$${servicioFinal?.precio} MXN`],
              ['Fecha',    fecha ? `${DIAS_ES[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}` : ''],
              ['Hora',     to12h(hora)],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text2)' }}>{k}</span>
                <strong style={{ color: k==='Precio'?'var(--gold)':'var(--text)', fontFamily: k==='Hora'?'var(--font-m)':'inherit' }}>{v}</strong>
              </div>
            ))}
          </div>

          {/* Toggle */}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setModoNuevo(false)} style={{ flex:1, height:36, borderRadius:'var(--r-md)', fontFamily:'var(--font-b)', fontSize:'0.8rem', fontWeight:500, background: !modoNuevo?'var(--gold-bg)':'var(--elevated)', color: !modoNuevo?'var(--gold)':'var(--text2)', border:`1px solid ${!modoNuevo?'var(--gold-b)':'var(--b-subtle)'}` }}>
              🔍 Buscar existente
            </button>
            <button onClick={() => { setModoNuevo(true); setClienteId(null); }} style={{ flex:1, height:36, borderRadius:'var(--r-md)', fontFamily:'var(--font-b)', fontSize:'0.8rem', fontWeight:500, background: modoNuevo?'var(--gold-bg)':'var(--elevated)', color: modoNuevo?'var(--gold)':'var(--text2)', border:`1px solid ${modoNuevo?'var(--gold-b)':'var(--b-subtle)'}` }}>
              ➕ Cliente nueva
            </button>
          </div>

          {!modoNuevo && (
            <>
              <input
                style={{ width:'100%', height:42, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'0 14px', color:'var(--text)', fontSize:'0.875rem' }}
                placeholder="Buscar por nombre o teléfono..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                {clientesFiltrados.length === 0 ? (
                  <p style={{ fontSize:'0.8rem', color:'var(--muted)', textAlign:'center', padding:16 }}>
                    Sin resultados — prueba con otro nombre o crea una nueva clienta
                  </p>
                ) : clientesFiltrados.slice(0,8).map(c => (
                  <button key={c.id} onClick={() => setClienteId(c.id)} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'11px 14px',
                    background: clienteId===c.id ? 'var(--gold-bg)' : 'var(--surface)',
                    border: `1px solid ${clienteId===c.id ? 'var(--gold-b)' : 'var(--b-subtle)'}`,
                    borderRadius:'var(--r-md)', textAlign:'left', fontFamily:'var(--font-b)', transition:'all 150ms',
                  }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--overlay)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'1rem', flexShrink:0 }}>
                      {(c.nombre||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.85rem', fontWeight:500, color:'var(--text)' }}>{c.nombre}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{c.telefono || 'Sin teléfono'} · {c.visitas || 0} visitas</div>
                    </div>
                    {clienteId===c.id && <span style={{ color:'var(--gold)', fontSize:'1rem' }}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {modoNuevo && (
            <div style={{ background:'var(--elevated)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)', padding:16, display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:'0.78rem', color:'var(--text2)' }}>Datos de la nueva clienta:</p>
              <input style={inp} placeholder="Nombre completo *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(v => ({...v, nombre:e.target.value}))} />
              <input style={inp} placeholder="Teléfono (opcional)" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(v => ({...v, telefono:e.target.value}))} />
              <p style={{ fontSize:'0.7rem', color:'var(--muted)' }}>Se creará el perfil al confirmar la cita.</p>
            </div>
          )}

          <div style={{ display:'flex', gap:10, paddingTop:4 }}>
            <button onClick={() => setStep(2)} style={btnBack}>← Atrás</button>
            <button
              onClick={handleConfirm}
              disabled={saving || !puedeConfirmar}
              style={{ ...btnPrimary(!puedeConfirmar), background: !puedeConfirmar ? 'var(--elevated)' : 'var(--green)', flex:1 }}
            >
              {saving
                ? <span style={{ width:18, height:18, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
                : '✓ Confirmar cita'
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}