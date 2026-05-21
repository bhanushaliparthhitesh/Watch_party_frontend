"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/lib/socket";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Participant {
  socketId: string;
  username: string;
  isHost?: boolean;
  isOnline: boolean;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
  /** Video playback time (in seconds) when the message was sent */
  videoTime?: number;
}

export interface ChatSidebarProps {
  /** Room code for socket events */
  roomCode: string;
  /** Current user's display name */
  username: string;
  /** Participants list (managed by parent, kept in sync via socket) */
  participants: Participant[];
  /** Returns the current video playback time in seconds */
  getCurrentVideoTime?: () => number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🔥"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date timestamp as HH:MM:SS */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Format video seconds as MM:SS */
function formatVideoTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatSidebar({
  roomCode,
  username,
  participants,
  getCurrentVideoTime,
}: ChatSidebarProps) {
  // ── Socket ──────────────────────────────────────────────────────────────
  const { isConnected, emitChat, emitReaction, onEvent } = useSocket();

  // ── Messages ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Floating reactions ──────────────────────────────────────────────────
  const [floatingReactions, setFloatingReactions] = useState<
    { id: string; emoji: string; x: number; y: number }[]
  >([]);

  // ── Listen for incoming chat messages ───────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;

    const unsubs = [
      onEvent<ChatMessage>("chat-message", (msg) => {
        setMessages((prev) => [...prev, msg]);
      }),
      onEvent<{ emoji: string; user: string }>("reaction", (data) => {
        spawnFloatingReaction(data.emoji);
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [isConnected, onEvent]);

  // ── Auto-scroll to latest message ──────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;

    const videoTime = getCurrentVideoTime?.() ?? 0;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      user: username,
      text,
      timestamp: Date.now(),
      videoTime,
    };

    emitChat({ roomCode, message: msg });
    setMessages((prev) => [...prev, msg]);
    setChatInput("");
  }, [chatInput, roomCode, username, emitChat, getCurrentVideoTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Floating reactions ─────────────────────────────────────────────────
  const spawnFloatingReaction = useCallback((emoji: string) => {
    const id = crypto.randomUUID();
    const x = 10 + Math.random() * 80;
    const y = Math.random() * 40;
    setFloatingReactions((prev) => [...prev, { id, emoji, x, y }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  }, []);

  const handleReaction = useCallback(
    (emoji: string) => {
      emitReaction({ roomCode, emoji, user: username });
      spawnFloatingReaction(emoji);
    },
    [roomCode, username, emitReaction, spawnFloatingReaction]
  );

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <aside className="w-full lg:w-[30%] border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col bg-gray-50 min-h-0 relative">
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — Presence Header */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          In room ({participants.length || 1})
        </h2>
        <ul className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
          {/* Always show "You" first */}
          <li className="flex items-center gap-2 text-sm text-gray-700">
            <span className="relative shrink-0">
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                {username.charAt(0).toUpperCase()}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
            </span>
            <span className="truncate font-medium">{username}</span>
            <span className="ml-auto text-xs text-gray-400">you</span>
          </li>

          {/* Other participants */}
          {participants
            .filter((p) => p.username !== username)
            .map((p) => (
              <li
                key={p.socketId}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <span className="relative shrink-0">
                  <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold">
                    {p.username.charAt(0).toUpperCase()}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      p.isOnline ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                </span>
                <span className="truncate">{p.username}</span>
                {p.isHost && (
                  <span className="ml-auto text-xs text-blue-500 shrink-0">
                    Host
                  </span>
                )}
              </li>
            ))}

          {/* Fallback if no other participants */}
          {participants.filter((p) => p.username !== username).length === 0 && (
            <li className="text-xs text-gray-400 pl-9">
              Share the room code to invite friends
            </li>
          )}
        </ul>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — Chat Messages */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1 sticky top-0 bg-gray-50 pb-1 z-10">
          Chat
        </h2>

        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            No messages yet. Say hi! 👋
          </p>
        )}

        {messages.map((msg) => {
          const isMe = msg.user === username;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              {/* Meta line: username + timestamp + video time */}
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                {!isMe && (
                  <span className="text-xs font-medium text-gray-500">
                    {msg.user}
                  </span>
                )}
                <span className="text-[10px] text-gray-300" title="Message sent at">
                  {formatTimestamp(msg.timestamp)}
                </span>
                {msg.videoTime !== undefined && msg.videoTime > 0 && (
                  <span
                    className="text-[10px] text-blue-400 font-mono"
                    title="Video time when sent"
                  >
                    @{formatVideoTime(msg.videoTime)}
                  </span>
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug break-words border border-gray-200 bg-white hover:bg-gray-100 text-gray-800 ${
                  isMe ? "rounded-tr-sm" : "rounded-tl-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3 — Chat Input + Reactions */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-200">
        {/* Reaction bar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
          <span className="text-[10px] text-gray-400 mr-1 uppercase tracking-wider font-semibold">
            React
          </span>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className="text-lg p-2 rounded-md hover:bg-gray-200 hover:scale-125 active:scale-90"
              title={`Send ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Chat input */}
        <form onSubmit={handleSubmit} className="p-3 flex gap-2">
          <input
            id="chat-input"
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            maxLength={500}
            className="flex-1 px-4 py-3 rounded-lg bg-white border border-gray-300 outline-none focus:border-blue-500 text-gray-800 placeholder-gray-400 text-sm"
          />
          <button
            id="send-chat-btn"
            type="submit"
            disabled={!chatInput.trim()}
            className="px-6 py-3 rounded-lg bg-blue-500 hover:opacity-90 active:opacity-80 disabled:bg-gray-300 disabled:opacity-100 text-white text-sm font-bold"
          >
            Send
          </button>
        </form>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Floating reactions overlay */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {floatingReactions.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {floatingReactions.map((r) => (
            <span
              key={r.id}
              className="absolute text-4xl"
              style={{
                left: `${r.x}%`,
                bottom: `${10 + r.y}%`,
                animation: "floatUp 2s ease-out forwards",
              }}
            >
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Keyframes */}
      <style jsx global>{`
        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-80px) scale(1.3);
          }
          100% {
            opacity: 0;
            transform: translateY(-160px) scale(1.5);
          }
        }
      `}</style>
    </aside>
  );
}
