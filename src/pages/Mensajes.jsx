import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { listenMensajes, enviarMensaje } from '../services/firestoreService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { to12h } from '../mock/data';

function generarRespuestaLocal(texto, servicios) {
  const t = texto.toLowerCase();
  if (t.includes('hora') || t.includes('horario')) return `De lunes a sábado de 9am a 8pm 💅`;
  if (t.includes('precio') || t.includes('cuánto') || t.includes('cuesta')) {
    const lista = servicios.slice(0,4).map(s => `${s.emoji} ${s.nombre}: $${s.precio}`).join('\n');
    return `Estos son algunos precios:\n${lista}`;
  }
  if (t.includes('donde') || t.includes('dónde') || t.includes('ubicacion')) return `Por el momento solo atendemos con cita previa 😊`;
  if (t.includes('cancelar') || t.includes('no puedo')) return `Ay no, qué lástima 😢 ¿La cambiamos para otro día?`;
  if (t.includes('gracias') || t.includes('ok')) return `¡Con gusto! Cualquier cosa aquí estamos 😊`;
  return `¿En qué te puedo ayudar? 😊`;
}

function Bubble({ msg }) {
  const isRight = msg.de === 'owner' || msg.de === 'bot';
  const ts = msg.timestamp instanceof Date
    ? msg.timestamp.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })
    : '';
  const canal = msg.canal === 'whatsapp' ? '📱' : '';
  return (
    <div style={{ display:'flex', flexDirection:'column', maxWidth:'78%', gap:3, alignSelf: isRight?'flex-end':'flex-start', alignItems: isRight?'flex-end':'flex-start' }}>
      {msg.de === 'bot' && <span style={{ fontSize:'0.6rem', fontWeight:600, color:'var(--green)', letterSpacing:'0.05em', padding:'0 4px' }}>🤖 bot {canal}</span>}
      {msg.de === 'owner' && <span style={{ fontSize:'0.6rem', fontWeight:600, color:'var(--gold)', letterSpacing:'0.05em', padding:'0 4px' }}>✏️ tú {canal}</span>}
      <div style={{
        padding:'10px 14px', borderRadius:'var(--r-lg)',
        borderBottomRightRadius: isRight ? 4 : 'var(--r-lg)',
        borderBottomLeftRadius:  isRight ? 'var(--r-lg)' : 4,
        background: msg.de==='owner' ? 'var(--gold-bg)' : msg.de==='bot' ? 'rgba(82,183,136,.08)' : 'var(--elevated)',
        border: msg.de==='owner' ? '1px solid var(--gold-b)' : msg.de==='bot' ? '1px solid rgba(82,183,136,.2)' : '1px solid var(--b-subtle)',
      }}>
        <p style={{ fontSize:'0.875rem', lineHeight:1.5, color:'var(--text)', whiteSpace:'pre-wrap', margin:0 }}>{msg.texto}</p>
        <span style={{ fontSize:'0.6rem', color:'var(--muted)', marginTop:4, display:'block' }}>{ts}</span>
      </div>
    </div>
  );
}

export default function Mensajes() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { clientes, citas, servicios } = useApp();

  const [selectedId, setSelectedId]   = useState(paramId || null);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [botTyping, setBotTyping]     = useState(false);
  const [botEnabled, setBotEnabled]   = useState(true);
  const [loadingBot, setLoadingBot]   = useState(false);
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

  // Escuchar mensajes en tiempo real
  useEffect(() => {
    if (!selectedId) return;
    const unsub = listenMensajes(selectedId, setMessages);
    return unsub;
  }, [selectedId]);

  // Cargar estado del bot cuando cambia el cliente
  useEffect(() => {
    if (!selectedId) return;
    setLoadingBot(true);
    getDoc(doc(db, 'config_bot', selectedId)).then(snap => {
      if (snap.exists()) {
        setBotEnabled(snap.data().activo !== false);
      } else {
        setBotEnabled(true);
      }
      setLoadingBot(false);
    }).catch(() => setLoadingBot(false));
  }, [selectedId]);

  const toggleBot = async () => {
    if (!selectedId) return;
    const nuevoEstado = !botEnabled;
    setBotEnabled(nuevoEstado);
    await setDoc(doc(db, 'config_bot', selectedId), { activo: nuevoEstado }, { merge: true });
  };

    const handleSend = async () => {
    const texto = input.trim();
    if (!texto || !selectedId) return;
    setInput('');
    inputRef.current?.focus();

    // Guardar en Firestore
    await enviarMensaje(selectedId, { de:'owner', texto, canal: botEnabled ? 'app' : 'whatsapp' });

    // Si bot está OFF y cliente tiene teléfono, mandar por WhatsApp
    if (!botEnabled && cliente?.telefono) {
      try {
        await fetch('/.netlify/functions/send-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefono: cliente.telefono, mensaje: texto }),
        });
      } catch (err) {
        console.error('Error enviando WhatsApp:', err);
      }
    }
  };

  const handleBotReply = async () => {
    if (!selectedId || !cliente) return;
    setBotTyping(true);
    const last = [...messages].reverse().find(m => m.de === 'client');
    const respuesta = generarRespuestaLocal(last?.texto || 'hola', servicios);
    setTimeout(async () => {
      await enviarMensaje(selectedId, { de:'bot', texto: respuesta, canal:'app' });
      setBotTyping(false);
    }, 800);
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const selectClient = (id) => { setSelectedId(id); navigate(`/mensajes/${id}`); };

  return (
    <div style={{ display:'flex', height:`calc(100dvh - var(--topbar) - ${isMobile ? 'var(--botnav)' : '0px'})`, margin: isMobile ? '-20px -16px' : '-28px -32px', overflow:'hidden' }}>

      {(!isMobile || !selectedId) && (
        <aside style={{ width: isMobile ? '100%' : 280, borderRight:'1px solid var(--b-subtle)', display:'flex', flexDirection:'column', background:'var(--surface)', flexShrink:0 }}>
          <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--b-subtle)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500 }}>Conversaciones</span>
            <span style={{ fontSize:'0.7rem', fontWeight:600, background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'2px 8px' }}>{clientes.length}</span>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:8 }}>
            {clientes.length === 0 && <p style={{ fontSize:'0.8rem', color:'var(--muted)', textAlign:'center', padding:20 }}>Sin clientas aún</p>}
            {clientes.map(c => (
              <button key={c.id} onClick={() => selectClient(c.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:12, borderRadius:'var(--r-md)', width:'100%', textAlign:'left', fontFamily:'var(--font-b)', background: c.id===selectedId ? 'var(--gold-bg)' : 'transparent', border: c.id===selectedId ? '1px solid var(--gold-b)' : '1px solid transparent', transition:'background 150ms' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', flexShrink:0 }}>
                  {(c.nombre||'?')[0]}
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nombre}</div>
                  <div style={{ fontSize:'0.7rem', color:'var(--muted)', marginTop:1 }}>{c.telefono || 'Sin teléfono'}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

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
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--b-subtle)', background:'var(--surface)' }}>
                {isMobile && (
                  <button onClick={() => { setSelectedId(null); navigate('/mensajes'); }} style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', color:'var(--text2)', fontSize:'0.9rem' }}>←</button>
                )}
                <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', flexShrink:0 }}>
                  {(cliente?.nombre||'?')[0]}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.875rem', fontWeight:500 }}>{cliente?.nombre?.split(' ')[0]}</div>
                  {citaStr && <div style={{ fontSize:'0.7rem', color:'var(--gold)', marginTop:1 }}>📅 {citaStr}</div>}
                  {cliente?.telefono && <div style={{ fontSize:'0.7rem', color:'var(--muted)' }}>📱 {cliente.telefono}</div>}
                </div>

                {/* Toggle Bot */}
                {/* Editar cliente */}
                <button
                  onClick={() => navigate(`/clientes/${selectedId}`)}
                  style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-soft)', color:'var(--muted)', fontSize:'0.85rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.color='var(--gold)'; e.currentTarget.style.borderColor='var(--gold-b)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.borderColor='var(--b-soft)'; }}
                >✏️</button>

                {/* Borrar conversación */}
                <button
                  onClick={async () => {
                    if (!window.confirm('¿Borrar toda la conversación?')) return;
                    try {
                      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
                      const { db } = await import('../firebase');
                      const snap = await getDocs(collection(db, 'clientes', selectedId, 'mensajes'));
                      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'clientes', selectedId, 'mensajes', d.id))));
                      showToast('Conversación borrada', 'info');
                    } catch(e) { showToast('Error al borrar', 'error'); }
                  }}
                  style={{ width:32, height:32, borderRadius:'var(--r-md)', background:'var(--elevated)', border:'1px solid var(--b-soft)', color:'var(--muted)', fontSize:'0.85rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; e.currentTarget.style.borderColor='var(--red-b)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.borderColor='var(--b-soft)'; }}
                >🗑</button>

                {/* Toggle Bot */}
                <button onClick={toggleBot} disabled={loadingBot} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:'var(--r-full)', fontSize:'0.7rem', fontWeight:600, fontFamily:'var(--font-b)', background: botEnabled ? 'var(--green-bg)' : 'var(--elevated)', color: botEnabled ? 'var(--green)' : 'var(--muted)', border: botEnabled ? '1px solid var(--green-b)' : '1px solid var(--b-soft)', opacity: loadingBot ? 0.5 : 1, transition:'all 200ms' }}>
                  🤖 {botEnabled ? 'Bot ON' : 'Bot OFF'}
                </button>
              </div>

              {/* Info bot desactivado */}
              {!botEnabled && (
                <div style={{ padding:'8px 16px', background:'var(--gold-bg)', borderBottom:'1px solid var(--gold-b)', fontSize:'0.75rem', color:'var(--gold)', display:'flex', alignItems:'center', gap:6 }}>
                  ✏️ Modo manual — estás respondiendo como Zaira
                </div>
              )}

              {/* Mensajes */}
              <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                {messages.length === 0 && (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:20, color:'var(--muted)', fontSize:'0.8rem', textAlign:'center' }}>
                    <p>Sin mensajes aún con <strong style={{ color:'var(--text2)' }}>{cliente?.nombre?.split(' ')[0]}</strong></p>
                    {cliente?.telefono && (
                      <p style={{ fontSize:'0.72rem' }}>Cuando esta clienta escriba al WhatsApp, los mensajes aparecerán aquí.</p>
                    )}
                  </div>
                )}
                {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
                {botTyping && (
                  <div style={{ alignSelf:'flex-end', maxWidth:'75%' }}>
                    <div style={{ padding:'12px 16px', borderRadius:'var(--r-lg)', borderBottomRightRadius:4, background:'rgba(82,183,136,.08)', border:'1px solid rgba(82,183,136,.2)', display:'flex', gap:4 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', animation:`dotPulse 1.4s ease-in-out ${i*0.2}s infinite both`, display:'block' }}/>)}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--b-subtle)', background:'var(--surface)', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {botEnabled && (
                    <button
                      onClick={handleBotReply}
                      disabled={botTyping}
                      style={{ display:'flex', alignItems:'center', gap:5, height:28, padding:'0 12px', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green-b)', borderRadius:'var(--r-full)', fontSize:'0.72rem', fontWeight:600, fontFamily:'var(--font-b)', opacity: botTyping ? 0.4 : 1 }}
                    >⚡ Respuesta IA</button>
                  )}
                  <span style={{ fontSize:'0.65rem', color:'var(--muted)', marginLeft:'auto' }}>
                    {botEnabled ? '🟢 Bot responde automático' : '✏️ Tú estás respondiendo'}
                  </span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  <textarea
                    ref={inputRef}
                    style={{ flex:1, background:'var(--elevated)', border:'1px solid var(--b-soft)', borderRadius:'var(--r-md)', padding:'10px 14px', color:'var(--text)', fontSize:'0.875rem', resize:'none', maxHeight:120, lineHeight:1.45, fontFamily:'var(--font-b)' }}
                    placeholder={botEnabled ? 'Escribe un mensaje interno...' : 'Escribe como Zaira...'}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKey}
                    rows={1}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{ width:40, height:40, background: input.trim() ? 'var(--gold)' : 'var(--elevated)', color: input.trim() ? '#000' : 'var(--muted)', borderRadius:'var(--r-md)', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 150ms', opacity: input.trim() ? 1 : 0.3 }}
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