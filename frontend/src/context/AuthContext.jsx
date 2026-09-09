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

  function login(nuevoToken, nuevoUsuario) {
    localStorage.setItem(TOKEN_KEY, nuevoToken);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(nuevoUsuario));
    setToken(nuevoToken);
    setUsuario(nuevoUsuario);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    setToken(null);
    setUsuario(null);
  }

  const value = useMemo(
    () => ({
      token,
      usuario,
      estaAutenticado: Boolean(token),
      login,
      logout,
    }),
    [token, usuario]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
