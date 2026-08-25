import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { getToken, setToken as storeToken, clearToken, authApi, userApi, setUnauthorizedHandler, notificationApi } from './api';
import * as SecureStore from 'expo-secure-store';

// Stage M6b-fix -- previously this context only tracked isAuthenticated/
// isLoading, and every screen that needed to know the signed-in user's role
// (index.tsx, explore.tsx, handovers.tsx, handover/[id].tsx) independently
// called `userApi.me()` and recomputed `role === 'manager'` itself. That's
// the mobile equivalent of the web app's AuthContext.jsx NOT existing --
// web computes `user` + `isManager` once, centrally, and every page reads
// it from `useAuth()`. Duplicating that fetch per-screen meant: (a) N
// redundant network round-trips on every screen mount instead of one, and
// (b) role-gating logic that could silently drift out of sync between
// screens since each one had its own copy. `user` and `isManager` now live
// here, loaded once when a token is found (mirrors web's `loadUser`), and
// every screen should read them from `useAuth()` instead of calling
// `userApi.me()` itself. `refreshUser` is exposed for the one legitimate
// case where a screen changes something about the user's own record (e.g.
// a future Profile tab editing name/photo) and needs the shared copy to
// reflect it immediately.

type Role = 'manager' | 'care_worker' | string;
type MeResponse = {
    id: number | string;
    name?: string;
    email?: string;
    role?: Role;
    [key: string]: unknown;
} | null;

type AuthContextType = {
    isAuthenticated: boolean;
    isLoading: boolean; // true while checking SecureStore on app launch
    user: MeResponse;
    isManager: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<MeResponse>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<MeResponse>(null);

    const logout = useCallback(async () => {
        try {
            const pushToken = await SecureStore.getItemAsync('device_push_token');
            if (pushToken) {
                await notificationApi.unregisterDevice(pushToken).catch(() => {});
            }
        } catch (err) {
            console.warn('Failed to unregister push token on logout', err);
        }
        await clearToken();
        setIsAuthenticated(false);
        setUser(null);
    }, []);

    const loadUser = useCallback(async () => {
        try {
            const me = await userApi.me();
            setUser(me);
            return me;
        } catch (err) {
            // A failed /users/me on an existing token means the token is no
            // longer valid -- same treatment as a 401 from any other call,
            // drop back to signed-out rather than leaving `user` stale.
            await logout();
            throw err;
        }
    }, [logout]);

    useEffect(() => {
        (async () => {
            const token = await getToken();
            if (token) {
                setIsAuthenticated(true);
                await loadUser().catch(() => { });
            } else {
                setIsAuthenticated(false);
            }
            setIsLoading(false);
        })();

        // Mirrors the web app's onUnauthorized pattern in api.js: if any API
        // call gets a 401 mid-session (expired/invalid token), clear it and
        // drop the user back to the login screen automatically.
        setUnauthorizedHandler(() => {
            clearToken();
            setIsAuthenticated(false);
            setUser(null);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function login(email: string, password: string) {
        // Turnstile verification is deferred on the backend right now (see
        // project memory notes), so any placeholder string works here.
        const data = await authApi.login(email, password, 'mobile-app');
        // NOTE: assumes the backend's login response has an `access_token`
        // field, matching the OAuth2-style response the web app expects.
        // Confirmed correct against the real backend during Stage M2 testing.
        await storeToken(data.access_token);
        setIsAuthenticated(true);
        await loadUser();
    }

    const isManager = user?.role === 'manager';

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, user, isManager, login, logout, refreshUser: loadUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}