import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

const NAV = [
  { to:'/',         label:'Dashboard', emoji:'📊', end:true },
  { to:'/agenda',   label:'Agenda',    emoji:'📅' },
  { to:'/clientes', label:'Clientes',  emoji:'👥' },
  { to:'/mensajes', label:'Mensajes',  emoji:'💬' },
  { to:'/reportes', label:'Reportes',  emoji:'📋' },
  { to:'/config',   label:'Config',    emoji:'⚙️' },
];

const NAV_MOBILE = [
  { to:'/',         label:'Inicio',   emoji:'📊', end:true },
  { to:'/agenda',   label:'Agenda',   emoji:'📅' },
  { to:'/clientes', label:'Clientes', emoji:'👥' },
  { to:'/mensajes', label:'Chat',     emoji:'💬' },
  { to:'/reportes', label:'Reportes', emoji:'📋' },
];

function Sidebar() {
  const { logout, profile } = useAuth();
  const { showToast } = useApp();
  const navigate = useNavigate();

  return (
    <aside style={{
      width:'var(--sidebar)', height:'100dvh',
      background:'var(--surface)', borderRight:'1px solid var(--b-subtle)',
      display:'flex', flexDirection:'column',
      position:'fixed', top:0, left:0, zIndex:100, padding:'18px 10px',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px 20px', borderBottom:'1px solid var(--b-subtle)', marginBottom:14 }}>
        <div style={{ width:34, height:34, background:'var(--gold-bg)', border:'1px solid var(--gold-b)', borderRadius:'var(--r-md)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>✂️</div>
        <div>
          <span style={{ display:'block', fontFamily:'var(--font-d)', fontSize:'1rem', fontWeight:600 }}>BarberBot</span>
          <span style={{ display:'block', fontSize:'0.6rem', color:'var(--muted)', letterSpacing:'0.06em', textTransform:'uppercase' }}>Panel de gestión</span>
        </div>
      </div>

      <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
        <span style={{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.12em', color:'var(--muted)', padding:'0 10px', marginBottom:4 }}>MENÚ</span>
        {NAV.map(({ to, label, emoji, end }) => (
          <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:9, padding:'9px 10px',
            borderRadius:'var(--r-md)', fontSize:'0.82rem', fontWeight:400,
            color: isActive ? 'var(--gold)' : 'var(--text2)',
            background: isActive ? 'var(--gold-bg)' : 'transparent',
            border: isActive ? '1px solid var(--gold-b)' : '1px solid transparent',
            transition:'all 150ms',
          })}>
            <span>{emoji}</span><span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop:'1px solid var(--b-subtle)', paddingTop:14, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--gold-bg)', border:'1px solid var(--gold-b)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:'0.9rem', flexShrink:0 }}>
          {(profile?.nombreNegocio || 'B')[0]}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <span style={{ display:'block', fontSize:'0.75rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {profile?.nombreNegocio || 'Mi Barbería'}
          </span>
          <span style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)' }}>Administrador</span>
        </div>
        <button
          onClick={async () => { await logout(); showToast('Sesión cerrada', 'info'); navigate('/login'); }}
          style={{ fontSize:'0.75rem', color:'var(--muted)', padding:'4px 8px', borderRadius:'var(--r-sm)', transition:'all 150ms' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
        >
          Salir
        </button>
      </div>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav style={{
      display:'flex', position:'fixed', bottom:0, left:0, right:0,
      height:'var(--botnav)', background:'var(--surface)',
      borderTop:'1px solid var(--b-subtle)', zIndex:100,
    }}>
      {NAV_MOBILE.map(({ to, label, emoji, end }) => (
        <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
          flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', gap:3,
          color: isActive ? 'var(--gold)' : 'var(--muted)',
          fontSize:'0.55rem', fontWeight:500, transition:'color 150ms',
        })}>
          <span style={{ fontSize:'1.1rem', lineHeight:1 }}>{emoji}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function TopBar() {
  const location = useLocation();
  const navigate  = useNavigate();
  const isNested  = location.pathname.split('/').filter(Boolean).length > 1;
  const titles    = {
    '/':'Dashboard', '/agenda':'Agenda', '/clientes':'Clientes',
    '/mensajes':'Mensajes', '/reportes':'Reportes', '/config':'Configuración',
  };
  const base  = '/' + location.pathname.split('/')[1];
  const title = titles[base] || 'BarberBot';

  return (
    <header style={{
      height:'var(--topbar)', display:'flex', alignItems:'center',
      justifyContent:'space-between', padding:'0 20px',
      borderBottom:'1px solid var(--b-subtle)', background:'var(--bg)',
      position:'sticky', top:0, zIndex:50, gap:12,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {isNested && (
          <button onClick={() => navigate(-1)} style={{ width:32, height:32, borderRadius:'var(--r-md)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text2)', background:'var(--elevated)', border:'1px solid var(--b-subtle)', fontSize:'1rem' }}>←</button>
        )}
        <h1 style={{ fontFamily:'var(--font-d)', fontSize:'1.2rem', fontWeight:500 }}>{title}</h1>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {base === '/agenda' && (
          <button onClick={() => navigate('/agenda/nueva')} style={{ height:34, padding:'0 14px', background:'var(--gold)', color:'#000', borderRadius:'var(--r-md)', fontSize:'0.8rem', fontWeight:600 }}>
            + Nueva cita
          </button>
        )}
        
      </div>
    </header>
  );
}

export default function AppShell({ children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <div style={{ display:'flex', minHeight:'100dvh' }}>
      {!isMobile && <Sidebar />}
      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft: isMobile ? 0 : 'var(--sidebar)' }}>
        <TopBar />
        <main style={{
          flex:1,
          padding: isMobile ? '20px 16px' : '28px 32px',
          paddingBottom: isMobile ? 'calc(var(--botnav) + 20px)' : 28,
          overflowY:'auto',
        }}>
          {children}
        </main>
      </div>
      {isMobile && <BottomNav />}
    </div>
  );
}