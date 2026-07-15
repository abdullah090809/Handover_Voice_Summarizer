import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { WS_BASE_URL, notificationApi } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { user, status } = useAuth();
  const showToast = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());
  const reconnectTimer = useRef(null);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (user?.role !== 'manager') return;
    try {
      const data = await notificationApi.list(200);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch (e) {
      /* silent */
    }
  }, [user]);

  useEffect(() => {
    if (status !== 'authed' || !user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    if (user.role === 'manager') refreshUnreadCount();

    function connect() {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/handovers`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return;
        }

        listenersRef.current.forEach((fn) => fn(data));

        if (data.type === 'handover_updated') {
          showToast(
            `Handover note #${data.id} is now ${data.status}.`,
            data.status === 'complete' ? 'success' : data.status === 'failed' ? 'error' : 'info'
          );
        } else if (data.type === 'notification' && user.role === 'manager') {
          const urgent = data.urgency_flag === 'urgent' || data.urgency_flag === 'high';
          showToast(data.message, urgent ? 'warning' : 'info', { duration: 7000 });
          refreshUnreadCount();
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.id]);

  return (
    <WebSocketContext.Provider value={{ subscribe, unreadCount, refreshUnreadCount, setUnreadCount }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useLiveUpdates() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useLiveUpdates must be used within WebSocketProvider');
  return ctx;
}
