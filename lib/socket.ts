"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Payload sent when the user joins a room */
export interface JoinRoomPayload {
  roomCode: string;
  username: string;
}

/** Payload for play / pause events */
export interface PlaybackPayload {
  roomCode: string;
  time: number;
}

/** Payload for seek events */
export interface SeekPayload {
  roomCode: string;
  time: number;
}

/** Payload for chat messages */
export interface ChatPayload {
  roomCode: string;
  message: {
    id: string;
    user: string;
    text: string;
    timestamp: number;
  };
}

/** Payload for reactions (emoji bursts, etc.) */
export interface ReactionPayload {
  roomCode: string;
  emoji: string;
  user: string;
}

/** Payload for changing the video source */
export interface VideoSourcePayload {
  roomCode: string;
  url: string;
}

/** Everything the hook exposes to consumers */
export interface UseSocketReturn {
  /** The raw socket instance (null until connected) */
  socket: Socket | null;
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Number of reconnection attempts so far */
  reconnectAttempts: number;

  // ── Emit helpers ──────────────────────────────────────────────────────
  /** Join a room */
  joinRoom: (payload: JoinRoomPayload) => void;
  /** Emit a "play" event */
  emitPlay: (payload: PlaybackPayload) => void;
  /** Emit a "pause" event */
  emitPause: (payload: PlaybackPayload) => void;
  /** Emit a "seek" event */
  emitSeek: (payload: SeekPayload) => void;
  /** Send a chat message */
  emitChat: (payload: ChatPayload) => void;
  /** Send a reaction */
  emitReaction: (payload: ReactionPayload) => void;
  /** Change the video source for the room */
  emitVideoSource: (payload: VideoSourcePayload) => void;

  // ── Listener helper ───────────────────────────────────────────────────
  /** Subscribe to a server event. Returns an unsubscribe function. */
  onEvent: <T = unknown>(event: string, handler: (data: T) => void) => () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Custom React hook that manages a Socket.IO connection to the watch-party
 * backend.
 *
 * • Auto-connects when the component mounts.
 * • Auto-disconnects when the component unmounts.
 * • Handles reconnection automatically (up to 10 retries with exponential
 *   back-off, max 5 s between attempts).
 *
 * @example
 * ```tsx
 * const { isConnected, joinRoom, emitPlay, onEvent } = useSocket();
 *
 * useEffect(() => {
 *   const unsub = onEvent("play", (time: number) => {
 *     videoRef.current.currentTime = time;
 *     videoRef.current.play();
 *   });
 *   return unsub;
 * }, [onEvent]);
 * ```
 */
export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // ── Initialise socket on mount ──────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ["websocket", "polling"],   // prefer ws, fall back to polling
      autoConnect: true,
      reconnection: true,                     // auto-reconnect on drop
      reconnectionAttempts: 10,               // try up to 10 times
      reconnectionDelay: 1000,                // start at 1 s
      reconnectionDelayMax: 5000,             // cap at 5 s
    });

    socketRef.current = socket;

    // ── Connection lifecycle events ─────────────────────────────────────
    socket.on("connect", () => {
      console.log("[socket] connected:", socket.id);
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socket.on("disconnect", (reason) => {
      console.warn("[socket] disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[socket] connection error:", err.message);
    });

    // Track reconnection attempts so the UI can show a banner if needed
    socket.io.on("reconnect_attempt", (attempt) => {
      console.log(`[socket] reconnection attempt #${attempt}`);
      setReconnectAttempts(attempt);
    });

    socket.io.on("reconnect", (attempt) => {
      console.log(`[socket] reconnected after ${attempt} attempt(s)`);
      setReconnectAttempts(0);
    });

    socket.io.on("reconnect_failed", () => {
      console.error("[socket] reconnection failed after all attempts");
    });

    // ── Cleanup on unmount ──────────────────────────────────────────────
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── Emit helpers (stable refs via useCallback) ──────────────────────────

  const joinRoom = useCallback((payload: JoinRoomPayload) => {
    socketRef.current?.emit("join-room", payload);
  }, []);

  const emitPlay = useCallback((payload: PlaybackPayload) => {
    socketRef.current?.emit("play", payload);
  }, []);

  const emitPause = useCallback((payload: PlaybackPayload) => {
    socketRef.current?.emit("pause", payload);
  }, []);

  const emitSeek = useCallback((payload: SeekPayload) => {
    socketRef.current?.emit("seek", payload);
  }, []);

  const emitChat = useCallback((payload: ChatPayload) => {
    socketRef.current?.emit("chat-message", payload);
  }, []);

  const emitReaction = useCallback((payload: ReactionPayload) => {
    socketRef.current?.emit("reaction", payload);
  }, []);

  const emitVideoSource = useCallback((payload: VideoSourcePayload) => {
    socketRef.current?.emit("video-source", payload);
  }, []);

  // ── Generic listener helper ─────────────────────────────────────────────
  const onEvent = useCallback(
    <T = unknown>(event: string, handler: (data: T) => void): (() => void) => {
      const socket = socketRef.current;
      if (!socket) {
        // Return a no-op unsubscribe if the socket isn't ready yet
        return () => {};
      }
      socket.on(event, handler as (...args: unknown[]) => void);
      // Return an unsubscribe function for easy cleanup in useEffect
      return () => {
        socket.off(event, handler as (...args: unknown[]) => void);
      };
    },
    []
  );

  return {
    socket: socketRef.current,
    isConnected,
    reconnectAttempts,
    joinRoom,
    emitPlay,
    emitPause,
    emitSeek,
    emitChat,
    emitReaction,
    emitVideoSource,
    onEvent,
  };
}
