import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

const ADMIN_EMAIL    = import.meta.env.VITE_ADMIN_EMAIL;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
const CORRECT_PIN    = import.meta.env.VITE_PIN;

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  const profile = {
    nombre:        'Zaira',
    nombreNegocio: 'Estetica Zaira',
  };

  useEffect(() => {
    // Sesión solo dura mientras el tab está abierto
    setPersistence(auth, browserSessionPersistence).catch(console.error);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const loginWithPin = async (pin) => {
    if (pin !== CORRECT_PIN) {
      throw new Error('PIN incorrecto');
    }
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);