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

  // US-27: tras editar el perfil se refrescan los datos guardados (por ejemplo, el nombre de la barra superior).
  function actualizarUsuario(cambios) {
    setUsuario((actual) => {
      const actualizado = { ...actual, ...cambios };
      localStorage.setItem(USUARIO_KEY, JSON.stringify(actualizado));
      return actualizado;
    });
  }

  const value = useMemo(
    () => ({
      token,
      usuario,
      estaAutenticado: Boolean(token),
      // US-29: solo sirve para mostrar u ocultar el panel; el backend vuelve a comprobar el rol en cada petición.
      esAdministrador: usuario?.rol === 'administrador',
      cerroSesion,
      login,
      logout,
      actualizarUsuario,
    }),
    [token, usuario, cerroSesion]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
