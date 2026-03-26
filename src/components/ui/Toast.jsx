import { useApp } from '../../context/AppContext';

const COLORS = { success:'#52b788', error:'#e05c5c', warning:'#e09f3e', info:'#5b9bd5' };

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div style={{
      position:'fixed', bottom:'calc(64px + 12px)', left:'50%', transform:'translateX(-50%)',
      display:'flex', alignItems:'center', gap:10, padding:'11px 16px',
      background:'var(--elevated)', border:'1px solid var(--b-soft)',
      borderLeft:`3px solid ${COLORS[toast.type]||COLORS.info}`,
      borderRadius:'var(--r-lg)', boxShadow:'var(--sh-lg)', zIndex:9999,
      maxWidth:360, width:'calc(100vw - 32px)',
      animation:'slideUp .3s var(--spring) both',
      fontSize:'0.85rem', fontWeight:500, color:'var(--text)',
    }}>
      {toast.message}
    </div>
  );
}