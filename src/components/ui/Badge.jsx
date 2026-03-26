const V = {
  success:{ bg:'var(--green-bg)', color:'var(--green)', border:'var(--green-b)' },
  warning:{ bg:'var(--warn-bg)',  color:'var(--warn)',  border:'transparent' },
  danger: { bg:'var(--red-bg)',   color:'var(--red)',   border:'var(--red-b)' },
  muted:  { bg:'var(--elevated)', color:'var(--muted)', border:'transparent' },
  gold:   { bg:'var(--gold-bg)',  color:'var(--gold)',  border:'var(--gold-b)' },
  default:{ bg:'var(--overlay)',  color:'var(--text2)', border:'transparent' },
};
const STATUS = {
  confirmed:{ label:'Confirmada', v:'success' },
  pending:  { label:'Pendiente',  v:'warning' },
  completed:{ label:'Completada', v:'muted' },
  cancelled:{ label:'Cancelada',  v:'danger' },
};

export function Badge({ children, variant='default', dot=false }) {
  const s = V[variant]||V.default;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 8px', borderRadius:'var(--r-full)',
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      fontSize:'0.7rem', fontWeight:600, whiteSpace:'nowrap',
    }}>
      {dot && <span style={{width:5,height:5,borderRadius:'50%',background:'currentColor',flexShrink:0}}/>}
      {children}
    </span>
  );
}

export function Avatar({ nombre='', size='md' }) {
  const sizes = { sm:32, md:40, lg:52, xl:68 };
  const px = sizes[size]||40;
  const initials = nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  return (
    <div style={{
      width:px, height:px, borderRadius:'50%',
      background:'var(--overlay)', border:'1px solid var(--b-soft)',
      display:'flex', alignItems:'center', justifyContent:'center',
      flexShrink:0, color:'var(--gold)', fontFamily:'var(--font-d)', fontSize:px*0.35,
    }}>
      {initials||'?'}
    </div>
  );
}

export function StatusBadge({ estado }) {
  const s = STATUS[estado]||{ label:estado, v:'default' };
  return <Badge variant={s.v} dot>{s.label}</Badge>;
}