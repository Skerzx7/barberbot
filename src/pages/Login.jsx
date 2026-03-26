import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, loginWithPin } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake]     = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleDigit = async (d) => {
    if (loading) return;
    const nuevo = pin + d;
    setPin(nuevo);
    setError('');

    if (nuevo.length === 4) {
      setLoading(true);
      try {
        await loginWithPin(nuevo);
        navigate('/');
      } catch {
        setError('PIN incorrecto');
        setShake(true);
        setTimeout(() => { setPin(''); setShake(false); setLoading(false); }, 600);
      }
    }
  };

  const handleDelete = () => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setError('');
  };

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', padding:24, position:'relative',
    }}>
      {/* Glow fondo */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(232,82,138,.12) 0%, transparent 70%)',
      }}/>

      <div style={{
        width:'100%', maxWidth:320,
        display:'flex', flexDirection:'column', alignItems:'center', gap:32,
        animation:'scaleIn .4s var(--spring) both',
        position:'relative',
      }}>

        {/* Logo */}
        <div style={{ textAlign:'center' }}>
          <div style={{
            width:60, height:60, background:'var(--gold-bg)', border:'1px solid var(--gold-b)',
            borderRadius:'var(--r-xl)', display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 16px', fontSize:'1.8rem', boxShadow:'var(--sh-gold)',
          }}>✂️</div>
          <h1 style={{ fontFamily:'var(--font-d)', fontSize:'2rem', fontWeight:600, marginBottom:4 }}>BarberBot</h1>
          <p style={{ fontSize:'0.82rem', color:'var(--text2)' }}>Ingresa tu PIN para continuar</p>
        </div>

        {/* Puntos del PIN */}
        <div style={{
          display:'flex', gap:16, alignItems:'center',
          animation: shake ? 'shakePin .4s var(--ease)' : 'none',
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:16, height:16, borderRadius:'50%',
              background: i < pin.length ? 'var(--gold)' : 'var(--bg-overlay)',
              border: `2px solid ${i < pin.length ? 'var(--gold)' : 'var(--b-soft)'}`,
              transition:'all 200ms var(--spring)',
              transform: i < pin.length ? 'scale(1.2)' : 'scale(1)',
              boxShadow: i < pin.length ? 'var(--sh-gold)' : 'none',
            }}/>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontSize:'0.82rem', color:'var(--red)', marginTop:-16, fontWeight:500 }}>
            {error}
          </p>
        )}

        {/* Teclado numérico */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, width:'100%' }}>
          {DIGITS.map((d, idx) => {
            if (d === '') return <div key={idx} />;
            const isDelete = d === '⌫';
            return (
              <button
                key={idx}
                onClick={() => isDelete ? handleDelete() : handleDigit(d)}
                disabled={loading || (!isDelete && pin.length >= 4)}
                style={{
                  height:64, borderRadius:'var(--r-lg)',
                  background: isDelete ? 'transparent' : 'var(--surface)',
                  border: isDelete ? 'none' : '1px solid var(--b-soft)',
                  color: isDelete ? 'var(--text2)' : 'var(--text)',
                  fontFamily: isDelete ? 'inherit' : 'var(--font-d)',
                  fontSize: isDelete ? '1.2rem' : '1.6rem',
                  fontWeight: 500,
                  transition:'all 150ms var(--ease)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!isDelete) e.currentTarget.style.background = 'var(--elevated)'; e.currentTarget.style.borderColor = 'var(--gold-b)'; }}
                onMouseLeave={e => { if (!isDelete) e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--b-soft)'; }}
                onMouseDown={e => { if (!isDelete) e.currentTarget.style.transform = 'scale(0.94)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {loading && d !== '⌫' && pin.length === 4 && idx === 10
                  ? <span style={{ width:16, height:16, border:'2px solid var(--gold)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite', display:'block', margin:'0 auto' }}/>
                  : d
                }
              </button>
            );
          })}
        </div>

        <p style={{ fontSize:'0.68rem', color:'var(--muted)', letterSpacing:'0.04em' }}>
          BARBERÍA ZAIRA © {new Date().getFullYear()}
        </p>
      </div>

      <style>{`
        @keyframes shakePin {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
