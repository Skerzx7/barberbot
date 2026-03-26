import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function MenuContextual({ clienteId, onClose, onEliminar, onEditar }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{
      position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
      background:'var(--elevated)', border:'1px solid var(--b-soft)',
      borderRadius:'var(--r-md)', boxShadow:'var(--sh-md)',
      zIndex:10, overflow:'hidden', minWidth:130,
    }}>
      <button onClick={onEditar} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 14px', fontSize:'0.8rem', color:'var(--text)', fontFamily:'var(--font-b)', borderBottom:'1px solid var(--b-subtle)', transition:'background 150ms' }}
        onMouseEnter={e => e.currentTarget.style.background='var(--hover)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}
      >✏️ Editar</button>
      <button onClick={onEliminar} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 14px', fontSize:'0.8rem', color:'var(--red)', fontFamily:'var(--font-b)', transition:'background 150ms' }}
        onMouseEnter={e => e.currentTarget.style.background='var(--red-bg)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}
      >🗑 Eliminar</button>
    </div>
  );
}

export default function Clientes() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast, clientes, agregarCliente, actualizarCliente, eliminarCliente, loadingData } = useApp();

  const [search, setSearch]       = useState('');
  const [showModal, setShowModal] = useState(params.get('nuevo') === '1');
  const [editando, setEditando]   = useState(null); // cliente completo a editar
  const [form, setForm]           = useState({ nombre:'', telefono:'', email:'', notas:'' });
  const [saving, setSaving]       = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(null); // id del cliente con menu abierto

  const filtered = clientes.filter(c =>
    c.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefono?.includes(search)
  );

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre:'', telefono:'', email:'', notas:'' });
    setShowModal(true);
  };

  const abrirEditar = (c) => {
    setMenuAbierto(null);
    setEditando(c);
    setForm({ nombre: c.nombre||'', telefono: c.telefono||'', email: c.email||'', notas: c.notas||'' });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditando(null);
    setForm({ nombre:'', telefono:'', email:'', notas:'' });
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      if (editando) {
        await actualizarCliente(editando.id, form);
        showToast('Clienta actualizada ✓', 'success');
        closeModal();
      } else {
        const nuevo = await agregarCliente(form);
        showToast('Clienta registrada ✓', 'success');
        closeModal();
        navigate(`/clientes/${nuevo.id}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Error al guardar. Verifica tu conexión.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (c) => {
    setMenuAbierto(null);
    if (!window.confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarCliente(c.id);
      showToast('Clienta eliminada', 'info');
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar', 'error');
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'fadeIn .3s var(--ease) both' }}>

      <div style={{ display:'flex', gap:10 }}>
        <div style={{ flex:1, position:'relative', display:'flex', alignItems:'center' }}>
          <span style={{ position:'absolute', left:13, color:'var(--muted)', fontSize:'0.85rem' }}>🔍</span>
          <input
            style={{ width:'100%', height:42, background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'0 14px 0 36px', color:'var(--text)', fontSize:'0.875rem' }}
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={abrirNuevo} style={{ display:'flex', alignItems:'center', gap:6, height:42, padding:'0 16px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.82rem', fontWeight:600, flexShrink:0 }}>
          + Nueva
        </button>
      </div>

      <div style={{ display:'flex', gap:20, padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', fontSize:'0.78rem', color:'var(--text2)' }}>
        <span><strong style={{ color:'var(--text)' }}>{clientes.length}</strong> clientas</span>
        <span><strong style={{ color:'var(--text)' }}>{clientes.filter(c => (c.visitas||0) > 0).length}</strong> con visitas</span>
        <span><strong style={{ color:'var(--text)' }}>{clientes.reduce((s,c) => s+(c.visitas||0), 0)}</strong> visitas totales</span>
      </div>

      {loadingData ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[0,1,2].map(i => <div key={i} style={{ height:76, borderRadius:'var(--r-lg)', background:'var(--surface)', border:'1px solid var(--b-subtle)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:'48px', textAlign:'center', color:'var(--muted)', fontSize:'0.875rem', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:'2rem' }}>👥</span>
          <p>{search ? 'Sin resultados' : 'Sin clientas registradas aún'}</p>
          {!search && (
            <button onClick={abrirNuevo} style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--gold)', padding:'8px 16px', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>
              + Agregar primera clienta
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ position:'relative' }}>
              <button
                onClick={() => { setMenuAbierto(null); navigate(`/clientes/${c.id}`); }}
                style={{ display:'flex', alignItems:'center', gap:14, padding:16, paddingRight:48, background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', textAlign:'left', fontFamily:'var(--font-b)', transition:'all 150ms', width:'100%' }}
                onMouseEnter={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.borderColor='var(--b-soft)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='var(--surface)'; e.currentTarget.style.borderColor='var(--b-subtle)'; }}
              >
                <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'1.2rem', flexShrink:0 }}>
                  {(c.nombre||'?')[0].toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.9rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nombre}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--muted)', marginTop:2 }}>{c.telefono || 'Sin teléfono'}</div>
                  <div style={{ display:'flex', gap:12, marginTop:5 }}>
                    <span style={{ fontSize:'0.68rem', color:'var(--muted)' }}>💅 {c.visitas || 0} visitas</span>
                    {(c.puntos || 0) > 0 && <span style={{ fontSize:'0.68rem', color:'var(--gold)' }}>⭐ {c.puntos} pts</span>}
                  </div>
                </div>
              </button>

              {/* Botón ⋯ */}
              <button
                onClick={e => { e.stopPropagation(); setMenuAbierto(menuAbierto === c.id ? null : c.id); }}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', width:28, height:28, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:'1rem', background:'transparent', transition:'all 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.background='var(--overlay)'; e.currentTarget.style.color='var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--muted)'; }}
              >⋯</button>

              {/* Menú contextual */}
              {menuAbierto === c.id && (
                <MenuContextual
                  clienteId={c.id}
                  onClose={() => setMenuAbierto(null)}
                  onEditar={() => abrirEditar(c)}
                  onEliminar={() => handleEliminar(c)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      {showModal && (
        <div
          onClick={closeModal}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.75)',
            display:'flex',
            alignItems: window.innerWidth >= 768 ? 'center' : 'flex-end',
            justifyContent:'center', zIndex:200, backdropFilter:'blur(4px)',
            padding: window.innerWidth >= 768 ? 24 : 0,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:'var(--elevated)', border:'1px solid var(--b-soft)',
              borderRadius: window.innerWidth >= 768 ? 'var(--r-xl)' : 'var(--r-xl) var(--r-xl) 0 0',
              padding:'28px 24px', width:'100%', maxWidth:440,
              animation:'slideUp .3s var(--spring) both', boxShadow:'var(--sh-lg)',
              maxHeight:'90dvh', overflowY:'auto',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1.3rem' }}>
                {editando ? 'Editar clienta' : 'Nueva clienta'}
              </h3>
              <button onClick={closeModal} style={{ width:30, height:30, borderRadius:'50%', background:'var(--overlay)', color:'var(--text2)', fontSize:'0.85rem', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { key:'nombre',   label:'Nombre completo *', placeholder:'Ej: María García',  type:'text' },
                { key:'telefono', label:'Teléfono',           placeholder:'55 1234 5678',       type:'tel' },
                { key:'email',    label:'Correo',             placeholder:'maria@email.com',     type:'email' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key} style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <label style={{ fontSize:'0.75rem', fontWeight:500, color:'var(--text2)' }}>{label}</label>
                  <input
                    type={type} placeholder={placeholder}
                    style={{ width:'100%', height:42, background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'0 14px', color:'var(--text)', fontSize:'0.875rem' }}
                    value={form[key]}
                    onChange={e => setForm(v => ({...v, [key]: e.target.value}))}
                  />
                </div>
              ))}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:'0.75rem', fontWeight:500, color:'var(--text2)' }}>Notas</label>
                <textarea
                  style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'10px 14px', color:'var(--text)', fontSize:'0.875rem', resize:'vertical', lineHeight:1.45 }}
                  rows={3} placeholder="Preferencias, alergias..."
                  value={form.notas}
                  onChange={e => setForm(v => ({...v, notas: e.target.value}))}
                />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={closeModal} style={{ flex:1, height:42, background:'var(--elevated)', color:'var(--text2)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', fontSize:'0.875rem', fontFamily:'var(--font-b)' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nombre.trim()}
                style={{ flex:1, height:42, background: form.nombre.trim()?'var(--gold)':'var(--elevated)', color: form.nombre.trim()?'#000':'var(--muted)', borderRadius:'var(--r-md)', fontSize:'0.875rem', fontWeight:600, fontFamily:'var(--font-b)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, opacity: form.nombre.trim()?1:0.5 }}
              >
                {saving
                  ? <span style={{ width:16, height:16, border:'2px solid rgba(0,0,0,.3)', borderTopColor:'#000', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
                  : editando ? 'Actualizar' : 'Guardar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}