"use client";

import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from "@3d-budget/shared";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  updateUser: (nextUser: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Only the (non-secret) user profile is cached client-side, purely so the
// UI can paint instantly before the silent refresh below resolves. The
// actual session lives in an httpOnly refresh-token cookie set by the
// backend (never readable from JS) plus a short-lived access token kept
// only in memory (this React state — lost on reload by design).
const USER_KEY = "auth_user";

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const AUTH_ENDPOINT_NO_RETRY = /\/auth\/(refresh|login|register|logout(-all)?)$/;

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
  const refreshPromiseRef = useRef<Promise<AuthUser | null> | null>(null);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(USER_KEY);
    setApiAuthorization(null);
    setToken(null);
    setUser(null);
  }, []);

  const persistUser = useCallback((nextUser: AuthUser) => {
    window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const persistSession = useCallback(
    (data: AuthResponse) => {
      setApiAuthorization(data.token);
      setToken(data.token);
      persistUser(data.user);
    },
    [persistUser],
  );

  // Silently exchanges the httpOnly refresh cookie for a new access token
  // (sent automatically by the browser via withCredentials — see lib/api.ts).
  // Concurrent callers (bootstrap on mount, the 401 retry below, manual
  // calls from admin pages) share the same in-flight request instead of
  // firing multiple refreshes at once.
  const refreshUser = useCallback((): Promise<AuthUser | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const promise = (async () => {
      try {
        const { data } = await api.post<AuthResponse>("/auth/refresh");
        persistSession(data);
        return data.user;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [clearSession, persistSession]);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      const storedUser = window.localStorage.getItem(USER_KEY);

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

      await refreshUser();

      if (isMounted) {
        setIsLoading(false);
      }
    };

    void bootstrapSession();

    return () => {
      isMounted = false;
    };
    // Intentionally runs once on mount only — refreshUser is stable across
    // renders in practice (its own deps are the stable clearSession/
    // persistSession callbacks), and re-running this on every identity
    // change would silently re-trigger the bootstrap refresh.
  }, []);

  // A protected call can hit its access token expiring mid-session (tokens
  // are short-lived on purpose — see Contextos/Decisoes.md). On a 401 that
  // isn't from an auth endpoint itself, try one silent refresh and replay
  // the original request; if the refresh also fails, give up and let the
  // 401 propagate (the caller ends up logged out via refreshUser->clearSession).
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as RetryableRequestConfig | undefined;
        const url = config?.url ?? "";

        if (
          error.response?.status !== 401 ||
          !config ||
          config._retry ||
          AUTH_ENDPOINT_NO_RETRY.test(url)
        ) {
          throw error;
        }

        config._retry = true;
        const refreshedUser = await refreshUser();

        if (!refreshedUser) {
          throw error;
        }

        config.headers.Authorization = api.defaults.headers.common
          .Authorization as string;
        return api.request(config);
      },
    );

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [refreshUser]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const { data } = await api.post<AuthResponse>("/auth/login", credentials);
      persistSession(data);
    },
    [persistSession],
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      const { data } = await api.post<AuthResponse>("/auth/register", payload);
      persistSession(data);
    },
    [persistSession],
  );

  const logout = useCallback((): void => {
    // Best-effort: revoke the refresh token server-side, but don't block
    // clearing the local session on the network call succeeding.
    void api.post("/auth/logout").catch(() => undefined);
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
      updateUser: persistUser,
    }),
    [isLoading, login, logout, persistUser, refreshUser, register, token, user],
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
