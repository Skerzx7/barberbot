import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import Toast from './components/ui/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import NuevaCita from './pages/NuevaCita';
import Clientes from './pages/Clientes';
import ClienteDetalle from './pages/ClienteDetalle';
import Mensajes from './pages/Mensajes';
import Configuracion from './pages/Configuracion';
import Reportes from './pages/Reportes';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <Guard>
            <AppShell>
              <Routes>
                <Route path="/"                element={<Dashboard />} />
                <Route path="agenda"           element={<Agenda />} />
                <Route path="agenda/nueva"     element={<NuevaCita />} />
                <Route path="clientes"         element={<Clientes />} />
                <Route path="clientes/:id"     element={<ClienteDetalle />} />
                <Route path="mensajes"         element={<Mensajes />} />
                <Route path="mensajes/:id"     element={<Mensajes />} />
                <Route path="reportes"         element={<Reportes />} />
                <Route path="config"           element={<Configuracion />} />
                <Route path="*"                element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </Guard>
        } />
      </Routes>
      <Toast />
    </>
  );
}