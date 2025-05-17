// iptv-frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    console.log("AuthContext: Verificando sesión almacenada...");
    try {
      const storedUserString = localStorage.getItem("user");
      const token = localStorage.getItem("token");

      if (storedUserString && token) {
        const storedUser = JSON.parse(storedUserString);
        setUser({
          username: storedUser.username,
          role: storedUser.role,
          plan: storedUser.plan, // Cargar plan desde localStorage
          token
        });
        console.log("AuthContext: Sesión restaurada desde localStorage.", {
          username: storedUser.username,
          role: storedUser.role,
          plan: storedUser.plan,
          tokenLoaded: !!token
        });
      } else {
        console.log("AuthContext: No se encontró sesión almacenada.");
        setUser(null);
      }
    } catch (error) {
      console.error("AuthContext: Error al parsear datos de localStorage", error);
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
      console.log("AuthContext: Verificación inicial de auth completada. isLoadingAuth:", false);
    }
  }, []);

  // userDataFromBackend se espera que sea { token: "...", user: { username: "...", role: "...", plan: "..." } }
  const login = (userDataFromBackend) => {
    console.log("AuthContext: login() llamado con:", userDataFromBackend); // Para depurar qué llega
    if (
      !userDataFromBackend ||
      !userDataFromBackend.token ||
      !userDataFromBackend.user ||
      !userDataFromBackend.user.username ||
      typeof userDataFromBackend.user.role === 'undefined' ||
      typeof userDataFromBackend.user.plan === 'undefined' // Asegurar que el plan también venga
    ) {
      console.error("AuthContext: Intento de login con datos incompletos desde el backend. Se esperaba {token, user:{username,role,plan}}", userDataFromBackend);
      return; 
    }

    const userToStoreInStateAndLocalStorage = {
      username: userDataFromBackend.user.username,
      role: userDataFromBackend.user.role,
      plan: userDataFromBackend.user.plan // Almacenar el plan
    };

    localStorage.setItem("user", JSON.stringify(userToStoreInStateAndLocalStorage));
    localStorage.setItem("token", userDataFromBackend.token);

    const userForState = {
      ...userToStoreInStateAndLocalStorage,
      token: userDataFromBackend.token
    };
    setUser(userForState);
    console.log("AuthContext: Usuario logueado y estado establecido:", userForState);
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
    console.log("AuthContext: Usuario deslogueado.");
  };

  const contextValue = {
    user,
    login,
    logout,
    isLoadingAuth,
    token: user?.token
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth debe ser usado dentro de un AuthProvider");
  }
  return context;
}