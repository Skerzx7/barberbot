import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { to12h } from '../mock/data';

function StatCard({ emoji, label, value, sub, accent, extra }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--b-subtle)',
      borderLeft:`3px solid ${accent}`,
      borderRadius:'var(--r-lg)', padding:'14px 16px',
      display:'flex', alignItems:'flex-start', gap:12,
      transition:'border-color 150ms',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = accent}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b-subtle)'}
    >
      <div style={{ width:34, height:34, borderRadius:'var(--r-md)', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--elevated)', flexShrink:0 }}>{emoji}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--font-d)', fontSize:'1.6rem', fontWeight:500, lineHeight:1, marginBottom:3 }}>{value}</div>
        <div style={{ fontSize:'0.75rem', color:'var(--text2)', fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>{sub}</div>}
        {extra && <div style={{ fontSize:'0.65rem', color: accent, marginTop:3, fontWeight:500 }}>{extra}</div>}
      </div>
    </div>
  );
}

function ProximaCitaBanner({ cita }) {
  if (!cita) return null;
  const mins = Math.round((cita.dt - new Date()) / 60000);
  const tiempoStr = mins < 60
    ? `En ${mins} min`
    : mins < 1440
      ? `Hoy a las ${to12h(cita.hora)}`
      : `${cita.fechaStr === new Date(new Date().setDate(new Date().getDate()+1)).toISOString().slice(0,10) ? 'Mañana' : cita.fechaStr} · ${to12h(cita.hora)}`;

  return (
    <div style={{
      background:'linear-gradient(135deg, var(--gold-bg) 0%, var(--elevated) 100%)',
      border:'1px solid var(--gold-b)', borderRadius:'var(--r-lg)',
      padding:'14px 16px', display:'flex', alignItems:'center', gap:12,
    }}>
      <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0, color:'#000' }}>
        ⏰
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.65rem', fontWeight:600, color:'var(--gold)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:2 }}>Próxima cita</div>
        <div style={{ fontSize:'0.9rem', fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {cita.clienteNombre} · {cita.servicio}
        </div>
        <div style={{ fontSize:'0.75rem', color:'var(--gold)', marginTop:2, fontWeight:500 }}>{tiempoStr}</div>
      </div>
      <div style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--gold)', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'4px 10px', flexShrink:0 }}>
        ${cita.precio}
      </div>
    </div>
  );
}

// Mini gráfica de barras para la semana
function MiniChart({ data, label }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const dias = ['L','M','X','J','V','S','D'];
  
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', padding:'12px 14px' }}>
      <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginBottom:10, fontWeight:500 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:50 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{
              width:'100%',
              height: `${Math.max((d.value / max) * 40, 4)}px`,
              background: d.isToday ? 'var(--gold)' : d.value > 0 ? 'var(--green)' : 'var(--b-subtle)',
              borderRadius:2,
              transition:'height 300ms ease',
            }} />
            <span style={{ fontSize:'0.55rem', color: d.isToday ? 'var(--gold)' : 'var(--muted)', fontWeight: d.isToday ? 600 : 400 }}>{dias[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    citas, clientes,
    citasHoy, citasPendientesHoy, citasCompletadasHoy,
    citasMañana, proximaCitaGlobal,
    ingresosMes, ingresosSemana, citasCompletadasMes, tasaCompletadasMes,
    completarCita, cancelarCita, showToast, nowMX,
  } = useApp();

  const hoy = nowMX();
  const citasActivasHoy = citasHoy.filter(a => a.estado !== 'cancelled');

  const greeting = (() => {
    const h = hoy.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const days   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  // Calcular datos para la mini gráfica de la semana
  const weekChartData = (() => {
    const data = [];
    const hoyDia = hoy.getDay();
    // Empezar desde lunes
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - ((hoyDia + 6) % 7)); // Lunes
    
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(inicioSemana);
      fecha.setDate(inicioSemana.getDate() + i);
      const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;
      
      const citasDelDia = citas.filter(c => c.fechaStr === fechaStr && c.estado === 'completed');
      const ingresos = citasDelDia.reduce((sum, c) => sum + (Number(c.precio) || 0), 0);
      
      data.push({
        value: ingresos,
        isToday: fecha.toDateString() === hoy.toDateString(),
      });
    }
    return data;
  })();

  const handleComplete = async (id, nombre) => {
    await completarCita(id);
    showToast(`Cita de ${nombre?.split(' ')[0]} completada ✓ +10 pts`, 'success');
  };

  const handleCancel = async (id) => {
    await cancelarCita(id);
    showToast('Cita cancelada', 'warning');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, animation:'fadeIn .3s var(--ease) both' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
        <div>
          <h2 style={{ fontFamily:'var(--font-d)', fontSize:'clamp(1.3rem,4vw,1.8rem)', fontWeight:400, marginBottom:3 }}>
            {greeting} <span style={{ color:'var(--gold)' }}>✦</span>
          </h2>
          <p style={{ fontSize:'0.8rem', color:'var(--text2)', textTransform:'capitalize' }}>
            {days[hoy.getDay()]}, {hoy.getDate()} de {months[hoy.getMonth()]}
          </p>
        </div>
        <button
          onClick={() => navigate('/agenda/nueva')}
          style={{ display:'flex', alignItems:'center', gap:6, height:38, padding:'0 14px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600, flexShrink:0 }}
        >
          + Nueva cita
        </button>
      </div>

      {/* Próxima cita banner */}
      <ProximaCitaBanner cita={proximaCitaGlobal} />

      {/* Stats 2x2 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
        <StatCard
          emoji="💅" label="Citas hoy"
          value={citasActivasHoy.length}
          sub={`${citasCompletadasHoy.length} completadas`}
          extra={citasPendientesHoy.length > 0 ? `${citasPendientesHoy.length} pendientes` : undefined}
          accent="var(--gold)"
        />
        <StatCard
          emoji="📈" label="Este mes"
          value={citasCompletadasMes}
          sub="citas completadas"
          extra={tasaCompletadasMes > 0 ? `${tasaCompletadasMes}% tasa éxito` : undefined}
          accent="var(--green)"
        />
        <StatCard
          emoji="💰" label="Ingresos mes"
          value={`$${ingresosMes.toLocaleString()}`}
          sub="MXN completados"
          extra={ingresosSemana > 0 ? `$${ingresosSemana.toLocaleString()} esta semana` : undefined}
          accent="var(--blue)"
        />
        <StatCard
          emoji="👥" label="Clientas"
          value={clientes.length}
          sub="registradas"
          extra={clientes.filter(c => (c.visitas||0) > 0).length + ' con visitas'}
          accent="#a064ff"
        />
      </div>

      {/* Mini gráfica de ingresos de la semana */}
      <MiniChart data={weekChartData} label="Ingresos esta semana" />

      {/* Citas de hoy */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500 }}>
            Hoy
            {citasActivasHoy.length > 0 && (
              <span style={{ marginLeft:8, fontSize:'0.68rem', fontWeight:600, background:'var(--gold-bg)', color:'var(--gold)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)', padding:'2px 7px' }}>
                {citasActivasHoy.length}
              </span>
            )}
          </h3>
          <button onClick={() => navigate('/agenda')} style={{ fontSize:'0.75rem', color:'var(--gold)', fontWeight:500 }}>
            Ver agenda →
          </button>
        </div>

        {citasActivasHoy.length === 0 ? (
          <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--muted)', fontSize:'0.875rem', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:'2rem' }}>📅</span>
            <p>Sin citas para hoy</p>
            <button onClick={() => navigate('/agenda/nueva')} style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--gold)', padding:'6px 14px', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>
              + Agendar ahora
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {citasActivasHoy
              .sort((a, b) => (a.hora||'').localeCompare(b.hora||''))
              .map(a => (
                <div key={a.id}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', transition:'all 150ms', cursor:'pointer',
                    opacity: a.estado === 'completed' ? 0.6 : 1,
                  }}
                  onClick={() => a.clientId && navigate(`/clientes/${a.clientId}`)}
                  onMouseEnter={e => e.currentTarget.style.borderColor='var(--b-soft)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='var(--b-subtle)'}
                >
                  {/* Avatar letra */}
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--overlay)', border:'1px solid var(--b-soft)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'1rem', flexShrink:0 }}>
                    {(a.clienteNombre||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'0.875rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.clienteNombre}</div>
                    <div style={{ fontSize:'0.7rem', color:'var(--text2)', marginTop:1 }}>
                      <span style={{ color:'var(--gold)', fontFamily:'var(--font-m)' }}>{to12h(a.hora)}</span>
                      {' · '}{a.servicio}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <StatusBadge estado={a.estado} />
                    {a.estado === 'confirmed' && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); handleComplete(a.id, a.clienteNombre); }}
                          title="Completar"
                          style={{ width:28, height:28, fontSize:'0.7rem', fontWeight:700, color:'var(--green)', background:'var(--green-bg)', border:'1px solid var(--green-b)', borderRadius:'var(--r-sm)', flexShrink:0 }}
                        >✓</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleCancel(a.id); }}
                          title="Cancelar"
                          style={{ width:28, height:28, fontSize:'0.75rem', color:'var(--muted)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-sm)', flexShrink:0 }}
                          onMouseEnter={e => { e.currentTarget.style.background='var(--red-bg)'; e.currentTarget.style.color='var(--red)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background='var(--elevated)'; e.currentTarget.style.color='var(--muted)'; }}
                        >✕</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Preview mañana */}
      {citasMañana.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, color:'var(--text2)' }}>
              Mañana
              <span style={{ marginLeft:8, fontSize:'0.68rem', fontWeight:600, background:'var(--elevated)', color:'var(--text2)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-full)', padding:'2px 7px' }}>
                {citasMañana.length}
              </span>
            </h3>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {citasMañana
              .sort((a,b) => (a.hora||'').localeCompare(b.hora||''))
              .slice(0, 3)
              .map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', opacity:0.8 }}>
                  <span style={{ fontSize:'0.72rem', color:'var(--muted)', fontFamily:'var(--font-m)', minWidth:40 }}>{to12h(a.hora)}</span>
                  <span style={{ fontSize:'0.82rem', flex:1, color:'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.clienteNombre}</span>
                  <span style={{ fontSize:'0.7rem', color:'var(--muted)' }}>{a.servicio?.split(' ')[0]}</span>
                </div>
              ))}
            {citasMañana.length > 3 && (
              <button onClick={() => navigate('/agenda')} style={{ fontSize:'0.75rem', color:'var(--muted)', padding:'8px', textAlign:'center', background:'transparent' }}>
                +{citasMañana.length - 3} más →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Acciones rápidas */}
      <div>
        <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:500, marginBottom:10 }}>Acciones rápidas</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {[
            { label:'Nueva cita',    emoji:'📅', to:'/agenda/nueva' },
            { label:'Nueva clienta', emoji:'👤', to:'/clientes?nuevo=1' },
            { label:'Mensajes',      emoji:'💬', to:'/mensajes' },
          ].map(({ label, emoji, to }) => (
            <button key={to} onClick={() => navigate(to)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'16px 10px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', color:'var(--text2)', fontSize:'0.72rem', fontWeight:500, fontFamily:'var(--font-b)', transition:'all 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.borderColor='var(--gold-b)'; e.currentTarget.style.color='var(--gold)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='var(--surface)'; e.currentTarget.style.borderColor='var(--b-subtle)'; e.currentTarget.style.color='var(--text2)'; }}
            >
              <span style={{ fontSize:'1.3rem' }}>{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
