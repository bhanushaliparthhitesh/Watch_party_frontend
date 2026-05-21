"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code);
}

interface RecentRoom {
  code: string;
  label: string; // The username they joined with
  lastUsed: number;
}

// ─── Component ────────────────────────────────────────────────────────────────
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  // Create room
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Join room
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [joinError, setJoinError] = useState("");

  // Hydrate username from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("watchparty_username");
    if (saved) setUsername(saved);
  }, []);

  // Recent rooms
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);

  // ── Load recent rooms from localStorage ─────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("recentRooms");
      if (stored) {
        const parsed: RecentRoom[] = JSON.parse(stored);
        
        // Filter out rooms older than 30 days
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const validRooms = parsed.filter(r => now - r.lastUsed < thirtyDaysMs);
        
        if (validRooms.length !== parsed.length) {
          localStorage.setItem("recentRooms", JSON.stringify(validRooms));
        }

        // Show most recent first, limit to 5 visually
        setRecentRooms(
          validRooms.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 5)
        );
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // ── Save room to localStorage ───────────────────────────────────────────
  const saveRoom = useCallback((code: string, label: string) => {
    try {
      const stored = localStorage.getItem("recentRooms");
      const rooms: RecentRoom[] = stored ? JSON.parse(stored) : [];
      // Remove duplicate if exists
      const filtered = rooms.filter((r) => r.code !== code);
      filtered.unshift({ code, label, lastUsed: Date.now() });
      // Keep only 10
      const trimmed = filtered.slice(0, 10);
      localStorage.setItem("recentRooms", JSON.stringify(trimmed));
      localStorage.setItem("lastRoomCode", code);
      localStorage.setItem("watchparty_username", label);
    } catch {
      // ignore
    }
  }, []);

  // ── Remove room from localStorage ───────────────────────────────────────
  const removeRoom = (e: React.MouseEvent, codeToRemove: string) => {
    e.stopPropagation(); // prevent clicking the rejoin button
    const updated = recentRooms.filter(r => r.code !== codeToRemove);
    setRecentRooms(updated);
    try {
      localStorage.setItem("recentRooms", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // ── Create room ─────────────────────────────────────────────────────────
  const handleCreate = () => {
    const code = generateRoomCode();
    setGeneratedCode(code);
    setCopied(false);
  };

  const handleCopyLink = async () => {
    if (!generatedCode) return;
    const link = `${window.location.origin}/room/${generatedCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoToCreatedRoom = () => {
    if (!generatedCode) return;
    saveRoom(generatedCode, username || "Host");
    router.push(`/room/${generatedCode}`);
  };

  // ── Join room ───────────────────────────────────────────────────────────
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();

    if (!code) {
      setJoinError("Please enter a room code.");
      return;
    }
    if (!isValidCode(code)) {
      setJoinError("Invalid code. Use 4-8 uppercase letters/numbers.");
      return;
    }
    if (!username.trim()) {
      setJoinError("Please enter a username.");
      return;
    }

    setJoinError("");
    saveRoom(code, username.trim());
    router.push(`/room/${code}`);
  };

  // ── Rejoin recent room ──────────────────────────────────────────────────
  const handleRejoin = (room: RecentRoom) => {
    saveRoom(room.code, room.label);
    router.push(`/room/${room.code}`);
  };

  // ── Time-ago helper ─────────────────────────────────────────────────────
  const timeAgo = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-4 py-12 font-sans text-gray-900">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 mb-3">
          🎬 Watch Party
        </h1>
        <p className="text-lg text-gray-500 max-w-md mx-auto leading-relaxed">
          Create or join a room to watch videos together with friends in
          real&nbsp;time.
        </p>
      </header>

      {/* URL Error Banner */}
      {urlError && (
        <div className="w-full max-w-[600px] bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-center font-medium mb-8">
          ⚠️ {urlError}
        </div>
      )}

      {/* ── Cards container ─────────────────────────────────────────────── */}
      <div className="w-full max-w-[600px] flex flex-col gap-8">
        {/* ── Create Room ───────────────────────────────────────────────── */}
        <section className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
            Create a Room
          </h2>

          {!generatedCode ? (
            <button
              id="create-room-btn"
              onClick={handleCreate}
              className="w-full py-3 rounded-xl bg-blue-500 hover:opacity-90 active:opacity-80 text-white font-semibold text-base"
            >
              Generate Room Code
            </button>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Generated code display */}
              <div className="flex items-center justify-center gap-3 py-4 px-4 bg-white border border-gray-200 rounded-xl">
                <span className="text-3xl font-mono font-bold tracking-[0.25em] text-gray-800 select-all">
                  {generatedCode}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  id="copy-link-btn"
                  onClick={handleCopyLink}
                  className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-800 hover:opacity-90 active:opacity-80 font-semibold text-sm"
                >
                  {copied ? "✓ Copied!" : "Copy Link"}
                </button>
                <button
                  id="go-to-room-btn"
                  onClick={handleGoToCreatedRoom}
                  className="flex-1 py-3 rounded-xl bg-blue-500 hover:opacity-90 active:opacity-80 text-white font-semibold text-sm"
                >
                  Go to Room →
                </button>
              </div>

              {/* Generate another */}
              <button
                onClick={handleCreate}
                className="text-sm text-gray-400 hover:text-blue-500 self-center"
              >
                Generate a different code
              </button>
            </div>
          )}
        </section>

        {/* ── Join Room ─────────────────────────────────────────────────── */}
        <section className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
            Join a Room
          </h2>

          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <input
              id="join-code-input"
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError("");
              }}
              placeholder="Room code (e.g. ABC123)"
              maxLength={8}
              className="w-full px-4 py-4 rounded-xl bg-white border border-gray-300 text-gray-800 placeholder-gray-400 text-center text-lg font-mono tracking-widest uppercase outline-none focus:border-blue-500"
            />

            <input
              id="username-input"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setJoinError("");
              }}
              placeholder="Your name"
              maxLength={24}
              className="w-full px-4 py-4 rounded-xl bg-white border border-gray-300 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-500"
            />

            {joinError && (
              <p className="text-red-500 text-sm text-center">{joinError}</p>
            )}

            <button
              id="join-room-btn"
              type="submit"
              className="w-full py-4 rounded-xl bg-green-500 hover:opacity-90 active:opacity-80 text-white font-semibold text-base mt-2"
            >
              Join Room
            </button>
          </form>
        </section>

        {/* ── Recent Rooms (from localStorage) ──────────────────────────── */}
        {recentRooms.length > 0 && (
          <section className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Recent Rooms
            </h2>

            <ul className="flex flex-col gap-2">
              {recentRooms.map((room) => (
                <li key={room.code + room.lastUsed} className="flex items-center gap-2">
                  <button
                    onClick={() => handleRejoin(room)}
                    className="flex-1 flex items-center justify-between px-4 py-4 rounded-xl bg-white border border-gray-200 hover:opacity-80 group text-left"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-gray-800 tracking-wider text-sm">
                        #{room.code}
                      </span>
                      <span className="text-xs text-gray-400">
                        as {room.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {timeAgo(room.lastUsed)}
                      </span>
                      <span className="text-gray-300 group-hover:text-blue-500 transition-colors">
                        →
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => removeRoom(e, room.code)}
                    className="p-3 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
                    title="Remove from history"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-16 text-center text-gray-400 text-sm">
        Built with Next.js, Socket.IO &amp; Tailwind CSS
      </footer>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div></div>}>
      <HomeContent />
    </Suspense>
  );
}
