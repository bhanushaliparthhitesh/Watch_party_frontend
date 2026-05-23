"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SocketProvider, useSocketContext } from "@/lib/socket";
import VideoPlayer, { VideoPlayerHandle } from "@/components/VideoPlayer";
import VideoURLSelector from "@/components/VideoURLSelector";
import ChatSidebar, { Participant } from "@/components/ChatSidebar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function RoomContent() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  // ── Socket ──────────────────────────────────────────────────────────────
  const {
    isConnected,
    reconnectAttempts,
    joinRoom,
    emitVideoSource,
    onEvent,
    socket,
  } = useSocketContext();

  // ── Connection states ───────────────────────────────────────────────────
  const [hasJoined, setHasJoined] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  // ── User ────────────────────────────────────────────────────────────────
  const [username] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("watchparty_username") || "Guest";
    }
    return "Guest";
  });

  // ── Video URL (shared state managed here, player handles playback) ─────
  const [videoUrl, setVideoUrl] = useState("");

  // ── Initial Sync State ──────────────────────────────────────────────────
  const [initialSync, setInitialSync] = useState<{
    time: number;
    playing: boolean;
    updatedAt: number;
  } | null>(null);

  // ── Participants ────────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<Participant[]>([]);

  // ── Player Ref ──────────────────────────────────────────────────────────
  const playerRef = useRef<VideoPlayerHandle>(null);

  // ── Clipboard ───────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  const lastJoinedSocketId = useRef<string | null>(null);

  // ── Join room on connect ────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected && socket?.id && lastJoinedSocketId.current !== socket.id) {
      joinRoom({ roomCode: code, username });
      lastJoinedSocketId.current = socket.id;
      if (!hasJoined) {
        setHasJoined(true);
      }
      setConnectionError(false);
    }
  }, [isConnected, socket?.id, hasJoined, joinRoom, code, username]);

  // ── Detect connection failure ───────────────────────────────────────────
  useEffect(() => {
    if (reconnectAttempts >= 10) {
      setConnectionError(true);
    }
  }, [reconnectAttempts]);

  // ── Socket event listeners (non-video events) ──────────────────────────
  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      // Presence events (with robust error handling and type validation)
      onEvent<any>("room-state", (data) => {
        try {
          console.log("[Socket] room-state received:", data);
          if (data && Array.isArray(data.users)) {
            setParticipants(data.users);
          } else if (Array.isArray(data)) {
            setParticipants(data);
          }
          if (data && data.url) {
            setVideoUrl(data.url);
          }
          if (data && typeof data.time === "number") {
            setInitialSync({
              time: data.time,
              playing: data.playing || false,
              updatedAt: data.updatedAt || Date.now(),
            });
          }
        } catch (error) {
          console.error("[Socket] Error handling room-state:", error);
        }
      }),
      onEvent<any>("room-users", (data) => {
        try {
          console.log("[Socket] room-users received:", data);
          if (data && Array.isArray(data.users)) {
            setParticipants(data.users);
          } else if (Array.isArray(data)) {
            setParticipants(data);
          }
        } catch (error) {
          console.error("[Socket] Error handling room-users:", error);
        }
      }),
      onEvent<any>("user-joined", (data) => {
        try {
          console.log("[Socket] user-joined received:", data);
          // Backend sends { username, users: [...] }, so we need to check data.users
          if (data && Array.isArray(data.users)) {
            setParticipants(data.users);
          } else if (Array.isArray(data)) {
            setParticipants(data);
          } else {
            console.warn("[Socket] Invalid data format for user-joined:", data);
          }
        } catch (error) {
          console.error("[Socket] Error handling user-joined:", error);
        }
      }),
      onEvent<any>("user-left", (data) => {
        try {
          console.log("[Socket] user-left received:", data);
          if (data && Array.isArray(data.users)) {
            setParticipants(data.users);
          } else if (Array.isArray(data)) {
            setParticipants(data);
          } else {
            console.warn("[Socket] Invalid data format for user-left:", data);
          }
        } catch (error) {
          console.error("[Socket] Error handling user-left:", error);
        }
      }),
      
      onEvent<string>("video-url-changed", (url) => {
        setVideoUrl(url);
      }),
      onEvent<{ url: string }>("video-source", (data) => {
        setVideoUrl(data.url);
      }),
      
      onEvent<{ message: string }>("room-error", (err) => {
        router.push(`/?error=${encodeURIComponent(err.message)}`);
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [isConnected, onEvent]);

  // ── Video URL submit (called by VideoURLSelector) ─────────────────────
  const handleVideoUrlSubmit = (url: string) => {
    setVideoUrl(url);
    emitVideoSource({ roomCode: code, url });
  };

  // ── Copy room link ────────────────────────────────────────────────────
  const copyRoomLink = async () => {
    const link = `${window.location.origin}/room/${code}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Loading state (only show if we haven't successfully joined yet)
  // ═══════════════════════════════════════════════════════════════════════
  if (!isConnected && !connectionError && !hasJoined) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-gray-600">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-lg font-medium">Connecting to room…</p>
        {reconnectAttempts > 0 && (
          <p className="text-sm text-gray-400">
            Reconnection attempt {reconnectAttempts} / 10
          </p>
        )}
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Error state
  // ═══════════════════════════════════════════════════════════════════════
  if (connectionError) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-5 text-gray-700 px-4">
        <span className="text-6xl">⚠️</span>
        <h1 className="text-2xl font-bold">Connection Failed</h1>
        <p className="text-gray-500 text-center max-w-sm">
          Unable to connect to the watch party server. Please check your
          internet connection and try again.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-blue-500 hover:opacity-90 active:opacity-80 text-white font-semibold"
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-xl bg-gray-200 hover:opacity-90 active:opacity-80 text-gray-800 font-semibold"
          >
            Back Home
          </button>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Main room view
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900">
      {/* ── Disconnect Banner ── */}
      {!isConnected && hasJoined && !connectionError && (
        <div className="bg-red-500 text-white text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 z-40 shadow-sm relative">
          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Connection lost. Reconnecting... (Attempt {reconnectAttempts}/10)</span>
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-30">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-gray-500 hover:opacity-80 text-sm w-32"
        >
          <span>←</span>
          <span className="text-lg font-bold text-blue-500">WatchParty</span>
        </button>

        {/* ── Center: Presence Tracker ── */}
        <div className="flex-1 flex justify-center items-center px-4 overflow-hidden hidden sm:flex">
          {participants.length <= 1 ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              <span>Waiting for a friend...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm truncate">
              <span className="text-gray-500 mr-1 shrink-0">In room:</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="relative flex h-2 w-2 mr-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="font-medium text-gray-700">You</span>
              </div>
              {participants.filter(p => p.username !== username).map(p => (
                <div key={p.socketId} className="flex items-center gap-1 ml-1.5 truncate">
                  <span className="text-gray-300">,</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                  <span className={`font-medium truncate ${p.isOnline ? "text-gray-700" : "text-gray-400"}`}>{p.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-32 justify-end">
          {/* Connection indicator */}
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </span>

          {/* Room code + copy */}
          <button
            id="copy-room-link-btn"
            onClick={copyRoomLink}
            title="Copy room link"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-200 hover:opacity-90 active:opacity-80 text-sm font-mono font-bold text-gray-800"
          >
            #{code}
            <span className="text-xs">{copied ? "✅" : "📋"}</span>
          </button>
        </div>
      </header>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ════════════════════════════════════════════════════════════ */}
        {/* LEFT — Video Player (70%) */}
        {/* ════════════════════════════════════════════════════════════ */}
        <section className="w-full lg:w-[70%] flex flex-col min-h-0">
          {/* VideoURLSelector — modal-based URL picker */}
          <VideoURLSelector
            currentUrl={videoUrl}
            onSubmit={handleVideoUrlSubmit}
          />

          {/* VideoPlayer — handles video + controls + sync */}
          <VideoPlayer
            ref={playerRef}
            roomCode={code}
            videoUrl={videoUrl}
            initialSync={initialSync}
          />
        </section>

        <ChatSidebar
          roomCode={code}
          username={username}
          participants={participants}
          getCurrentVideoTime={() => playerRef.current?.getCurrentTime() ?? 0}
        />
      </div>
    </div>
  );
}

export default function RoomPage() {
  return (
    <SocketProvider>
      <RoomContent />
    </SocketProvider>
  );
}
