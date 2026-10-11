import { createContext, useMemo, useState } from 'react';

const TOKEN_KEY = 'canchaya_token';
const USUARIO_KEY = 'canchaya_usuario';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [usuario, setUsuario] = useState(() => {
    const guardado = localStorage.getItem(USUARIO_KEY);
    return guardado ? JSON.parse(guardado) : null;
  });
  // true cuando el usuario cerró la sesión a propósito (no cuando venció): no hay que volver a la ruta anterior al iniciar sesión.
  const [cerroSesion, setCerroSesion] = useState(false);

  function login(nuevoToken, nuevoUsuario) {
    localStorage.setItem(TOKEN_KEY, nuevoToken);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(nuevoUsuario));
    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
    setCerroSesion(false);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    setToken(null);
    setUsuario(null);
    setCerroSesion(true);
  }

  const value = useMemo(
    () => ({
      token,
      usuario,
      estaAutenticado: Boolean(token),
      cerroSesion,
      login,
      logout,
    }),
    [token, usuario, cerroSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
