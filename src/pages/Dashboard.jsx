import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { to12h } from '../mock/data';

function StatCard({ emoji, label, value, sub, accent }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--b-subtle)',
      borderLeft:`3px solid ${accent}`,
      borderRadius:'var(--r-lg)', padding:'16px 18px',
      display:'flex', alignItems:'flex-start', gap:14,
    }}>
      <div style={{ width:36, height:36, borderRadius:'var(--r-md)', fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--elevated)', flexShrink:0 }}>{emoji}</div>
      <div>
        <div style={{ fontFamily:'var(--font-d)', fontSize:'1.7rem', fontWeight:500, lineHeight:1, marginBottom:4 }}>{value}</div>
        <div style={{ fontSize:'0.78rem', color:'var(--text2)', fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:'0.68rem', color:'var(--muted)', marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { citas, clientes, citasHoy, ingresosMes, citasCompletadasMes, completarCita, showToast, nowMX } = useApp();

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

  const handleComplete = async (id, nombre) => {
    await completarCita(id);
    showToast(`Cita de ${nombre?.split(' ')[0]} completada ✓ +10 pts`, 'success');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28, animation:'fadeIn .3s var(--ease) both' }}>

      <div>
        <h2 style={{ fontFamily:'var(--font-d)', fontSize:'clamp(1.4rem,4vw,2rem)', fontWeight:400, marginBottom:4 }}>
          {greeting} <span style={{ color:'var(--gold)' }}>✦</span>
        </h2>
        <p style={{ fontSize:'0.82rem', color:'var(--text2)', textTransform:'capitalize' }}>
          {days[hoy.getDay()]}, {hoy.getDate()} de {months[hoy.getMonth()]} de {hoy.getFullYear()}
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        <StatCard emoji="💅" label="Citas hoy"    value={citasActivasHoy.length}            sub="agendadas"         accent="var(--gold)"  />
        <StatCard emoji="📈" label="Este mes"      value={citasCompletadasMes}                sub="completadas"       accent="var(--green)" />
        <StatCard emoji="💰" label="Ingresos mes"  value={`$${ingresosMes.toLocaleString()}`} sub="MXN"               accent="var(--blue)"  />
        <StatCard emoji="👥" label="Clientas"      value={clientes.length}                    sub="registradas"       accent="#a064ff"      />
      </div>

      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500 }}>Citas de hoy</h3>
          <button onClick={() => navigate('/agenda')} style={{ fontSize:'0.78rem', color:'var(--gold)', fontWeight:500 }}>
            Ver agenda →
          </button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {citasActivasHoy.length === 0 ? (
            <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--muted)', fontSize:'0.875rem', background:'var(--surface)', border:'1px dashed var(--b-soft)', borderRadius:'var(--r-lg)', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:'2rem' }}>📅</span>
              <p>Sin citas para hoy</p>
              <button onClick={() => navigate('/agenda/nueva')} style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--gold)', padding:'6px 14px', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-full)' }}>
                + Agendar ahora
              </button>
            </div>
          ) : citasActivasHoy
              .sort((a, b) => (a.hora||'').localeCompare(b.hora||''))
              .map(a => (
            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-md)', transition:'all 150ms', cursor:'pointer' }}
              onClick={() => navigate(`/clientes/${a.clientId}`)}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--b-soft)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--b-subtle)'}
            >
              <span style={{ fontFamily:'var(--font-m)', fontSize:'0.75rem', color:'var(--gold)', minWidth:48, flexShrink:0 }}>{to12h(a.hora)}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.875rem', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.clienteNombre}</div>
                <div style={{ fontSize:'0.72rem', color:'var(--text2)', marginTop:1 }}>{a.servicio}</div>
              </div>
              <StatusBadge estado={a.estado} />
              {a.estado === 'confirmed' && (
                <button
                  onClick={e => { e.stopPropagation(); handleComplete(a.id, a.clienteNombre); }}
                  style={{ fontSize:'0.68rem', fontWeight:600, color:'var(--green)', padding:'4px 10px', background:'var(--green-bg)', border:'1px solid var(--green-b)', borderRadius:'var(--r-full)', flexShrink:0 }}
                >✓</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 style={{ fontFamily:'var(--font-d)', fontSize:'1.1rem', fontWeight:500, marginBottom:14 }}>Acciones rápidas</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { label:'Nueva cita',    emoji:'📅', to:'/agenda/nueva' },
            { label:'Nueva clienta', emoji:'👤', to:'/clientes' },
            { label:'Mensajes',      emoji:'💬', to:'/mensajes' },
          ].map(({ label, emoji, to }) => (
            <button key={to} onClick={() => navigate(to)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'18px 12px', background:'var(--surface)', border:'1px solid var(--b-subtle)', borderRadius:'var(--r-lg)', color:'var(--text2)', fontSize:'0.75rem', fontWeight:500, fontFamily:'var(--font-b)', transition:'all 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--gold-bg)'; e.currentTarget.style.borderColor='var(--gold-b)'; e.currentTarget.style.color='var(--gold)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='var(--surface)'; e.currentTarget.style.borderColor='var(--b-subtle)'; e.currentTarget.style.color='var(--text2)'; }}
            >
              <span style={{ fontSize:'1.4rem' }}>{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}