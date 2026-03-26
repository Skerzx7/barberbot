import { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { crearServicio, actualizarServicio, eliminarServicio } from '../services/firestoreService';

const EMOJIS = ['✂️','🪒','💈','⚡','✨','👦','💅','🌸','💎','🌿','🎀','🔥','🪄','🩷','💜','⭐'];

function ServiceRow({ svc, onChange, onDelete }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:12, background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', flexWrap:'wrap' }}>
      {/* Emoji selector */}
      <select
        style={{ width:52, height:34, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-sm)', padding:'0 4px', color:'var(--text)', fontSize:'1rem', cursor:'pointer', textAlign:'center' }}
        value={svc.emoji}
        onChange={e => onChange(svc.id, 'emoji', e.target.value)}
      >
        {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
      </select>

      {/* Nombre */}
      <input
        style={{ flex:1, minWidth:120, height:34, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-sm)', padding:'0 10px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font-b)' }}
        value={svc.nombre}
        onChange={e => onChange(svc.id, 'nombre', e.target.value)}
        placeholder="Nombre del servicio"
      />

      {/* Precio */}
      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
        <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>$</span>
        <input
          type="number"
          style={{ width:68, height:34, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-sm)', padding:'0 8px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font-m)', textAlign:'right' }}
          value={svc.precio}
          onChange={e => onChange(svc.id, 'precio', e.target.value)}
        />
      </div>

      {/* Duración */}
      <div style={{ display:'flex', alignItems:'center', gap:3 }}>
        <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>min</span>
        <input
          type="number"
          style={{ width:54, height:34, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-sm)', padding:'0 8px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'var(--font-m)', textAlign:'right' }}
          value={svc.duracion}
          onChange={e => onChange(svc.id, 'duracion', e.target.value)}
        />
      </div>

      {/* Eliminar */}
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={() => onDelete(svc.id, svc.isNew)}
        style={{ width:30, height:30, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:'0.85rem', flexShrink:0 }}
        onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
        onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--muted)'; }}
      >🗑</button>
    </div>
  );
}

const inp = {
  width:'100%', height:42, background:'var(--elevated)',
  border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)',
  padding:'0 14px', color:'var(--text)', fontSize:'0.875rem',
};

function Section({ title, emoji, children }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-xl)', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span>{emoji}</span>
        <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, flex:1 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Configuracion() {
  const { showToast, servicios } = useApp();
  const [localServicios, setLocalServicios] = useState([]);
  const [nombreNegocio, setNombre]          = useState('Barbería Zaira');
  const [recordMin, setRecordMin]           = useState(60);
  const [saving, setSaving]                 = useState(false);

  // Sincronizar con Firestore cuando llegan los servicios
  useEffect(() => {
    if (servicios.length > 0) {
      setLocalServicios(servicios.map(s => ({ ...s })));
    }
  }, [servicios]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises = localServicios.map(svc => {
        if (svc.isNew) {
          return crearServicio({
            nombre:   svc.nombre,
            precio:   Number(svc.precio)   || 0,
            duracion: Number(svc.duracion) || 30,
            emoji:    svc.emoji || '✂️',
            activo:   true,
          });
        } else {
          return actualizarServicio(svc.id, {
            nombre:   svc.nombre,
            precio:   Number(svc.precio)   || 0,
            duracion: Number(svc.duracion) || 30,
            emoji:    svc.emoji || '✂️',
          });
        }
      });
      await Promise.all(promises);
      showToast('Configuración guardada ✓', 'success');
    } catch (err) {
      console.error('Error al guardar:', err);
      showToast('Error al guardar. Intenta de nuevo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = useCallback((id, key, val) => {
    setLocalServicios(prev => prev.map(s => s.id === id ? { ...s, [key]: val } : s));
  }, []);

  const handleDelete = useCallback(async (id, isNew) => {
    if (!isNew) {
      try {
        await eliminarServicio(id);
      } catch (err) {
        console.error('Error al eliminar:', err);
      }
    }
    setLocalServicios(prev => prev.filter(s => s.id !== id));
    showToast('Servicio eliminado', 'info');
  }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'fadeIn .3s var(--ease) both', maxWidth:640 }}>

      <Section title="Tu negocio" emoji="💅">
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:'0.75rem', fontWeight:500, color:'var(--text2)' }}>Nombre de la barbería</label>
          <input style={inp} value={nombreNegocio} onChange={e => setNombre(e.target.value)} placeholder="Nombre de tu negocio" />
        </div>
      </Section>

      <Section title="Catálogo de servicios" emoji="✂️">
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {localServicios.length === 0 && (
            <p style={{ fontSize:'0.8rem', color:'var(--muted)', textAlign:'center', padding:12 }}>
              Cargando servicios...
            </p>
          )}
          {localServicios.map(svc => (
            <ServiceRow key={svc.id} svc={svc} onChange={handleChange} onDelete={handleDelete} />
          ))}
          <button
            onClick={() => setLocalServicios(p => [...p, {
              id:      `new_${Date.now()}`,
              nombre:  'Nuevo servicio',
              precio:  100,
              duracion:30,
              emoji:   '✨',
              isNew:   true,
            }])}
            style={{ height:38, background:'var(--gold-bg)', color:'var(--gold)', border:'1px dashed var(--gold-b)', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600, fontFamily:'var(--font-b)' }}
          >
            + Agregar servicio
          </button>
        </div>
      </Section>

      <Section title="Sistema de puntos" emoji="⭐">
        <div style={{ display:'flex', flexDirection:'column', gap:10, fontSize:'0.82rem', color:'var(--text2)', lineHeight:1.6 }}>
          <p>Cada clienta acumula puntos automáticamente por cada cita completada:</p>
          <div style={{ background:'var(--elevated)', borderRadius:'var(--r-md)', padding:14, display:'flex', flexDirection:'column', gap:8 }}>
            {[
              ['🥉','Bronze','0 – 199 pts','var(--text2)'],
              ['🥈','Silver','200 – 499 pts','var(--blue)'],
              ['⭐','Gold','500+ pts','var(--gold)'],
            ].map(([em, nivel, rango, color]) => (
              <div key={nivel} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>{em} <strong style={{ color }}>{nivel}</strong></span>
                <span style={{ fontFamily:'var(--font-m)', fontSize:'0.75rem', color:'var(--muted)' }}>{rango}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
            Cada cita completada suma <strong style={{ color:'var(--text)' }}>10 puntos</strong>.
          </p>
        </div>
      </Section>

      <Section title="Recordatorios automáticos" emoji="🔔">
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <label style={{ fontSize:'0.75rem', fontWeight:500, color:'var(--text2)' }}>Enviar recordatorio antes de la cita</label>
          <select style={{ ...inp, cursor:'pointer', appearance:'none' }} value={recordMin} onChange={e => setRecordMin(Number(e.target.value))}>
            <option value={30}>30 minutos antes</option>
            <option value={60}>1 hora antes</option>
            <option value={120}>2 horas antes</option>
            <option value={1440}>1 día antes</option>
            <option value={2880}>2 días antes</option>
          </select>
        </div>
      </Section>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ height:48, background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.9rem', fontWeight:600, fontFamily:'var(--font-b)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:saving?0.6:1, transition:'all 200ms' }}
      >
        {saving
          ? <span style={{ width:18, height:18, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
          : '💾 Guardar configuración'
        }
      </button>

      <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 4px', fontSize:'0.7rem', color:'var(--muted)' }}>
        <span>Barbería Zaira — {new Date().getFullYear()}</span>
        <span style={{ fontFamily:'var(--font-m)' }}>v1.0.0</span>
      </div>
    </div>
  );
}