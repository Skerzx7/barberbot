import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listenMensajes, enviarMensaje } from '../services/firestoreService';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { to12h } from '../mock/data';

// Timestamp relativo
function tsRelativo(date) {
  if (!(date instanceof Date)) return '';
  const diff = (new Date() - date) / 1000;
  if (diff < 60)   return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff/60)}m`;
  if (diff < 86400)return `hace ${Math.floor(diff/3600)}h`;
  const dias = Math.floor(diff/86400);
  if (dias === 1)  return 'ayer';
  if (dias < 7)    return `hace ${dias}d`;
  return date.toLocaleDateString('es-MX', { day:'numeric', month:'short' });
}

function Bubble({ msg, onDeleteBotMsg }) {
  const isRight = msg.de === 'owner' || msg.de === 'bot';
  const ts      = msg.timestamp instanceof Date ? tsRelativo(msg.timestamp) : '';
  const canal   = msg.canal === 'whatsapp' ? '📱' : '';

  return (
    <div style={{ display:'flex', flexDirection:'column', maxWidth:'78%', gap:2, alignSelf: isRight?'flex-end':'flex-start', alignItems: isRight?'flex-end':'flex-start' }}>
      {msg.de === 'bot'   && <span style={{ fontSize:'0.58rem', fontWeight:600, color:'var(--green)', letterSpacing:'0.05em', padding:'0 4px' }}>🤖 bot {canal}</span>}
      {msg.de === 'owner' && <span style={{ fontSize:'0.58rem', fontWeight:600, color:'var(--gold)', letterSpacing:'0.05em', padding:'0 4px' }}>✏️ tú {canal}</span>}
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, flexDirection: isRight ? 'row-reverse' : 'row' }}>
        <div style={{
          padding:'9px 13px', borderRadius:'var(--r-lg)',
          borderBottomRightRadius: isRight ? 4 : 'var(--r-lg)',
          borderBottomLeftRadius:  isRight ? 'var(--r-lg)' : 4,
          background: msg.de==='owner' ? 'var(--gold-bg)' : msg.de==='bot' ? 'rgba(82,183,136,.08)' : 'var(--elevated)',
          border:     msg.de==='owner' ? '1px solid var(--gold-b)' : msg.de==='bot' ? '1px solid rgba(82,183,136,.2)' : '1px solid var(--b-subtle)',
        }}>
          <p style={{ fontSize:'0.875rem', lineHeight:1.5, color:'var(--text)', whiteSpace:'pre-wrap', margin:0 }}>{msg.texto}</p>
          <span style={{ fontSize:'0.58rem', color:'var(--muted)', marginTop:3, display:'block' }}>{ts}</span>
        </div>
        {msg.de === 'bot' && onDeleteBotMsg && (
          <button
            onClick={() => onDeleteBotMsg(msg.id)}
            title="Borrar"
            style={{ width:16, height:16, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-subtle)', color:'var(--muted)', fontSize:'0.5rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity:0.35, transition:'all 150ms', marginBottom:4 }}
            onMouseEnter={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; e.currentTarget.style.borderColor='var(--red-b)'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity='0.35'; e.currentTarget.style.background='var(--overlay)'; e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.borderColor='var(--b-subtle)'; }}
          >✕</button>
        )}
      </div>
    </div>
  );
}

export default function Mensajes() {
  const { id: paramId } = useParams();
  const navigate        = useNavigate();
  const { clientes, citas, servicios, showToast } = useApp();

  const [selectedId,  setSelectedId]  = useState(paramId || null);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [botTyping,   setBotTyping]   = useState(false);
  const [botEnabled,  setBotEnabled]  = useState(true);
  const [loadingBot,  setLoadingBot]  = useState(false);
  const [loadingIA,   setLoadingIA]   = useState(false);

  // Mapa de estado bot por cliente (para mostrar en lista)
  const [botStates, setBotStates]   = useState({});

  const endRef   = useRef(null);
  const inputRef = useRef(null);

  const isMobile = window.innerWidth < 768;
  const cliente  = clientes.find(c => c.id === selectedId);

  const proximaCita = citas
    .filter(a => a.clientId === selectedId && a.estado === 'confirmed')
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];

  const citaStr = proximaCita
    ? `el ${new Date(proximaCita.fecha).toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' })} a las ${to12h(proximaCita.hora)}`
    : null;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, botTyping]);
  useEffect(() => { if (paramId) setSelectedId(paramId); }, [paramId]);

  useEffect(() => {
    if (!selectedId) return;
    const unsub = listenMensajes(selectedId, setMessages);
    return unsub;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingBot(true);
    getDoc(doc(db, 'config_bot', selectedId)).then(snap => {
      const activo = snap.exists() ? snap.data().activo !== false : true;
      setBotEnabled(activo);
      setLoadingBot(false);
    }).catch(() => setLoadingBot(false));
  }, [selectedId]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const handleDeleteBotMsg = async (msgId) => {
    try {
      await deleteDoc(doc(db, 'clientes', selectedId, 'mensajes', msgId));
    } catch { showToast('Error al borrar mensaje', 'error'); }
  };

  const toggleBot = async () => {
    if (!selectedId) return;
    const nuevoEstado = !botEnabled;
    setBotEnabled(nuevoEstado);
    await setDoc(doc(db, 'config_bot', selectedId), { activo: nuevoEstado }, { merge: true });
    showToast(`Bot ${nuevoEstado ? 'activado' : 'desactivado'}`, nuevoEstado ? 'success' : 'warning');
  };

  const handleSend = async () => {
    const texto = input.trim();
    if (!texto || !selectedId) return;
    setInput('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    inputRef.current?.focus();
    await enviarMensaje(selectedId, { de:'owner', texto, canal: botEnabled ? 'app' : 'whatsapp' });
    if (!botEnabled && cliente?.telefono) {
      try {
        await fetch('/.netlify/functions/send-whatsapp', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ telefono: cliente.telefono, mensaje: texto }),
        });
      } catch(err) { console.error(err); }
    }
  };

  const handleBotReply = async () => {
    if (!selectedId || !cliente || loadingIA) return;
    const lastClientMsg = [...messages].reverse().find(m => m.de === 'client');
    if (!lastClientMsg) { showToast('No hay mensajes del cliente para responder', 'warning'); return; }
    setLoadingIA(true);
    setBotTyping(true);
    try {
      const res = await fetch('/.netlify/functions/ia-reply', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          clienteNombre: cliente.nombre,
          mensaje:       lastClientMsg.texto,
          historial:     messages.slice(-10).map(m => ({ de: m.de, texto: m.texto })),
          servicios:     servicios.map(s => ({ nombre: s.nombre, precio: s.precio, emoji: s.emoji })),
        }),
      });
      const data = await res.json();
      if (data.respuesta) {
        await enviarMensaje(selectedId, { de:'bot', texto: data.respuesta, canal:'app' });
        if (!botEnabled && cliente?.telefono) {
          await fetch('/.netlify/functions/send-whatsapp', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ telefono: cliente.telefono, mensaje: data.respuesta }),
          });
        }
      }
    } catch(err) {
      console.error(err);
      showToast('Error al generar respuesta', 'error');
    } finally { setBotTyping(false); setLoadingIA(false); }
  };

  const handleBorrarConversacion = async () => {
    if (!window.confirm('¿Borrar toda la conversación? Esta acción no se puede deshacer.')) return;
    try {
      const snap = await getDocs(collection(db, 'clientes', selectedId, 'mensajes'));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'clientes', selectedId, 'mensajes', d.id))));
      setMessages([]);
      showToast('Conversación borrada', 'info');
    } catch { showToast('Error al borrar', 'error'); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const selectClient = (id) => { setSelectedId(id); navigate(`/mensajes/${id}`); };

  // Último mensaje de cada cliente para el preview en lista
  const lastMsgs = {};
  // (no hacemos listener por todos, es costoso — dejamos solo el conteo visual)

  return (
    <div style={{ display:'flex', height:`calc(100dvh - var(--topbar) - ${isMobile ? 'var(--botnav)' : '0px'})`, margin: isMobile ? '-20px -16px' : '-28px -32px', overflow:'hidden' }}>

      {/* Lista clientes */}
      {(!isMobile || !selectedId) && (
        <aside style={{ width: isMobile ? '100%' : 272, borderRight:'1px solid var(--b-subtle)', display:'flex', flexDirection:'column', background:'var(--surface)', flexShrink:0 }}>
          <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid var(--b-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'var(--font-d)', fontSize:'0.95rem', fontWeight:500 }}>Conversaciones</span>
            <span style={{ fontSize:'0.68rem', fontWeight:600, background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'2px 8px' }}>{clientes.length}</span>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:6 }}>
            {clientes.length === 0 && <p style={{ fontSize:'0.8rem', color:'var(--muted)', textAlign:'center', padding:20 }}>Sin clientas aún</p>}
            {clientes.map(c => (
              <button key={c.id} onClick={() => selectClient(c.id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 10px', borderRadius:'var(--r-md)', width:'100%', textAlign:'left', fontFamily:'var(--font-b)', background: c.id===selectedId ? 'var(--gold-bg)' : 'transparent', border: c.id===selectedId ? '1px solid var(--gold-b)' : '1px solid transparent', transition:'background 150ms' }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', flexShrink:0, fontSize:'1rem' }}>
                  {(c.nombre||'?')[0]}
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:'0.82rem', fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nombre}</div>
                  <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginTop:1 }}>{c.telefono || 'Sin teléfono'}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* Chat */}
      {(!isMobile || selectedId) && (
        <section style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:'var(--bg)' }}>
          {!selectedId ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'var(--muted)' }}>
              <span style={{ fontSize:'3rem' }}>💬</span>
              <p style={{ fontSize:'0.875rem' }}>Selecciona una clienta para chatear</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderBottom:'1px solid var(--b-subtle)', background:'var(--surface)' }}>
                {isMobile && (
                  <button onClick={() => { setSelectedId(null); navigate('/mensajes'); }} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem', flexShrink:0 }}>←</button>
                )}
                <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', flexShrink:0 }}>
                  {(cliente?.nombre||'?')[0]}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:500 }}>{cliente?.nombre?.split(' ')[0]}</div>
                  {citaStr && <div style={{ fontSize:'0.68rem', color:'var(--gold)', marginTop:1 }}>📅 {citaStr}</div>}
                </div>

                <button onClick={() => navigate(`/clientes/${selectedId}`)} title="Perfil"
                  style={{ width:30, height:30, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-soft)', color:'var(--muted)', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.color='var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; }}
                >👤</button>

                <button onClick={handleBorrarConversacion} title="Borrar conversación"
                  style={{ width:30, height:30, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-soft)', color:'var(--muted)', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; }}
                >🗑</button>

                <button onClick={toggleBot} disabled={loadingBot}
                  style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:'var(--r-full)', fontSize:'0.68rem', fontWeight:600, fontFamily:'var(--font-b)', background: botEnabled ? 'var(--green-bg)' : 'var(--elevated)', color: botEnabled ? 'var(--green)' : 'var(--muted)', border: botEnabled ? '1px solid var(--green-b)' : '1px solid var(--b-soft)', opacity: loadingBot ? 0.5 : 1, transition:'all 200ms', flexShrink:0 }}
                >
                  🤖 {botEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Banner modo manual */}
              {!botEnabled && (
                <div style={{ padding:'7px 14px', background:'var(--gold-bg)', borderBottom:'1px solid var(--gold-b)', fontSize:'0.72rem', color:'var(--gold)', display:'flex', alignItems:'center', gap:5 }}>
                  ✏️ Modo manual — respondiendo como Zaira
                </div>
              )}

              {/* Mensajes */}
              <div style={{ flex:1, overflowY:'auto', padding:'18px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                {messages.length === 0 && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:20, color:'var(--muted)', fontSize:'0.78rem', textAlign:'center' }}>
                    <p>Sin mensajes con <strong style={{ color:'var(--text2)' }}>{cliente?.nombre?.split(' ')[0]}</strong></p>
                    {cliente?.telefono && <p style={{ fontSize:'0.7rem' }}>Cuando escriba al WhatsApp aparecerán aquí.</p>}
                  </div>
                )}
                {messages.map(msg => <Bubble key={msg.id} msg={msg} onDeleteBotMsg={handleDeleteBotMsg} />)}
                {botTyping && (
                  <div style={{ alignSelf:'flex-end', maxWidth:'75%' }}>
                    <div style={{ padding:'10px 14px', borderRadius:'var(--r-lg)', borderBottomRightRadius:4, background:'rgba(82,183,136,.08)', border:'1px solid rgba(82,183,136,.2)', display:'flex', gap:4 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', animation:`dotPulse 1.4s ease-in-out ${i*0.2}s infinite both`, display:'block' }}/>)}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{ padding:'10px 14px', borderTop:'1px solid var(--b-subtle)', background:'var(--surface)', display:'flex', flexDirection:'column', gap:7 }}>
                <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                  <button onClick={handleBotReply} disabled={botTyping || loadingIA}
                    style={{ display:'flex', alignItems:'center', gap:4, height:26, padding:'0 10px', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green-b)', borderRadius:'var(--r-full)', fontSize:'0.7rem', fontWeight:600, fontFamily:'var(--font-b)', opacity:(botTyping||loadingIA)?0.4:1, transition:'opacity 200ms' }}
                  >
                    {loadingIA ? '⏳ Generando...' : '⚡ Respuesta IA'}
                  </button>
                  <span style={{ fontSize:'0.62rem', color:'var(--muted)', marginLeft:'auto' }}>
                    {botEnabled ? '🟢 Bot automático' : '✏️ Manual'}
                  </span>
                </div>
                <div style={{ display:'flex', gap:7, alignItems:'flex-end' }}>
                  <textarea
                    ref={inputRef}
                    style={{ flex:1, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'9px 12px', color:'var(--text)', fontSize:'0.875rem', resize:'none', lineHeight:1.45, fontFamily:'var(--font-b)', overflow:'hidden', minHeight:38 }}
                    placeholder={botEnabled ? 'Mensaje interno...' : 'Escribe como Zaira...'}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={onKey}
                    rows={1}
                  />
                  <button onClick={handleSend} disabled={!input.trim()}
                    style={{ width:38, height:38, background: input.trim() ? 'var(--gold)' : 'var(--elevated)', color: input.trim() ? '#000' : 'var(--muted)', borderRadius:'var(--r-md)', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 150ms', opacity: input.trim() ? 1 : 0.35 }}
                  >➤</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}