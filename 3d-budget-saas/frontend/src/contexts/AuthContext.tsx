"use client";

import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from "@3d-budget/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshUser: () => Promise<AuthUser | null>;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const writeAuthCookie = (token: string): void => {
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secureFlag}`;
};

const clearAuthCookie = (): void => {
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
};

const setApiAuthorization = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    clearAuthCookie();
    setApiAuthorization(null);
    setToken(null);
    setUser(null);
  }, []);

  const persistUser = useCallback((nextUser: AuthUser) => {
    window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const activeToken = token ?? window.localStorage.getItem(TOKEN_KEY);

    if (!activeToken) {
      return null;
    }

    setApiAuthorization(activeToken);

    try {
      const { data } = await api.get<AuthUser>("/auth/me");
      persistUser(data);
      return data;
    } catch {
      clearSession();
      return null;
    }
  }, [clearSession, persistUser, token]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      const storedToken = window.localStorage.getItem(TOKEN_KEY);
      const storedUser = window.localStorage.getItem(USER_KEY);

      if (!storedToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      setApiAuthorization(storedToken);
      writeAuthCookie(storedToken);

      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser) as AuthUser;

          if (isMounted) {
            setUser(parsedUser);
          }
        } catch {
          window.localStorage.removeItem(USER_KEY);
        }
      }

      if (isMounted) {
        setToken(storedToken);
      }

      try {
        const { data } = await api.get<AuthUser>("/auth/me");

        if (isMounted) {
          persistUser(data);
        }
      } catch {
        if (isMounted) {
          clearSession();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [clearSession, persistUser]);

  const persistSession = useCallback((data: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, data.token);
    writeAuthCookie(data.token);
    setApiAuthorization(data.token);
    setToken(data.token);
    persistUser(data.user);
  }, [persistUser]);

  const login = useCallback(async (credentials: LoginRequest) => {
    const { data } = await api.post<AuthResponse>("/auth/login", credentials);
    persistSession(data);
  }, [persistSession]);

  const register = useCallback(async (payload: RegisterRequest) => {
    const { data } = await api.post<AuthResponse>("/auth/register", payload);
    persistSession(data);
  }, [persistSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      refreshUser,
      login,
      register,
      logout,
    }),
    [isLoading, login, logout, refreshUser, register, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};
