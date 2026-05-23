"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useSocketContext } from "@/lib/socket";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoPlayerProps {
  /** The room code this player belongs to */
  roomCode: string;
  /** The direct URL of the video to play */
  videoUrl: string;
  /** Initial sync snapshot applied immediately upon load */
  initialSync?: { time: number; playing: boolean; updatedAt: number } | null;
}

export interface VideoPlayerHandle {
  /** Programmatically seek to a specific time */
  seekTo: (time: number) => void;
  /** Get the current playback time */
  getCurrentTime: () => number;
}

type VideoError = {
  type: "network" | "decode" | "src" | "unknown";
  message: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function errorCodeToType(code: number | undefined): VideoError["type"] {
  switch (code) {
    case 1:
      return "unknown"; // MEDIA_ERR_ABORTED
    case 2:
      return "network"; // MEDIA_ERR_NETWORK
    case 3:
      return "decode"; // MEDIA_ERR_DECODE
    case 4:
      return "src"; // MEDIA_ERR_SRC_NOT_SUPPORTED
    default:
      return "unknown";
  }
}

function friendlyErrorMessage(err: VideoError): string {
  switch (err.type) {
    case "network":
      return "Network error — check your connection or the video URL.";
    case "decode":
      return "This video format can't be decoded by your browser.";
    case "src":
      return "Video not found or format not supported.";
    default:
      return "An unexpected error occurred while loading the video.";
  }
}

// ─── Sync constants ───────────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 5_000; // check every 5 s
const DRIFT_THRESHOLD_S = 0.5; // correct if > 0.5 s off

// ─── Component ────────────────────────────────────────────────────────────────

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ roomCode, videoUrl, initialSync }, ref) {
    // ── Refs ────────────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null);
    const isSyncingRef = useRef(false); // true while applying a backend event
    const isCorrectingRef = useRef(false); // true while applying playbackRate smoothing
    const expectedTimeRef = useRef(0); // last known "correct" time from server
    const expectedTimeUpdatedAtRef = useRef(Date.now()); // when expectedTimeRef was set

    // ── Socket ──────────────────────────────────────────────────────────
    const { isConnected, emitPlay, emitPause, emitSeek, onEvent, socket } =
      useSocketContext();

    // ── State ───────────────────────────────────────────────────────────
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [videoError, setVideoError] = useState<VideoError | null>(null);
    const [showControls, setShowControls] = useState(true);
    const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Imperative handle ───────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      seekTo(time: number) {
        if (videoRef.current) videoRef.current.currentTime = time;
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? 0;
      },
    }));

    // ── Clear error when URL changes ────────────────────────────────────
    useEffect(() => {
      setVideoError(null);
    }, [videoUrl]);

    // ── Initial Sync Application ────────────────────────────────────────
    const appliedSyncRef = useRef(false);
    const lastVersionRef = useRef(0);

    useEffect(() => {
      appliedSyncRef.current = false;
    }, [initialSync]);

    const applyInitialSync = useCallback(() => {
      const v = videoRef.current;
      if (!initialSync || appliedSyncRef.current || !v) return;
      if (v.readyState < 1) return; // Wait for metadata

      appliedSyncRef.current = true;
      isSyncingRef.current = true;

      if ((initialSync as any).version !== undefined) {
        lastVersionRef.current = (initialSync as any).version;
      }

      const elapsed = (Date.now() - initialSync.updatedAt) / 1000;
      const expectedTime = initialSync.playing ? initialSync.time + Math.max(0, elapsed) : initialSync.time;

      v.currentTime = expectedTime;
      expectedTimeRef.current = expectedTime;
      expectedTimeUpdatedAtRef.current = Date.now();

      if (initialSync.playing) {
        v.play().catch((err) => console.error("Initial play error:", err));
        setPlaying(true);
      } else {
        v.pause();
        setPlaying(false);
      }

      setTimeout(() => {
        isSyncingRef.current = false;
      }, 500);
    }, [initialSync]);

    useEffect(() => {
      applyInitialSync();
    }, [applyInitialSync]);

    // ════════════════════════════════════════════════════════════════════
    // Socket event listeners
    // ════════════════════════════════════════════════════════════════════

    useEffect(() => {
      if (!isConnected) return;

      const checkFreshness = (data: any) => {
        if (!data) return true;
        const version = data.version;
        if (version !== undefined) {
          if (version < lastVersionRef.current) {
            console.log("Ignoring stale sync event", version, "vs current", lastVersionRef.current);
            return false;
          }
          lastVersionRef.current = version;
        }
        if (data.senderId && socket?.id && data.senderId === socket.id) {
          return false; // Ignore own echoes locally
        }
        return true;
      };

      const unsubs = [
        // ── play from backend ───────────────────────────────────────────
        onEvent<any>("play", (data) => {
          if (!checkFreshness(data)) return;
          const time = typeof data === 'number' ? data : data?.time;
          if (time === undefined) return;
          isSyncingRef.current = true;
          const v = videoRef.current;
          if (v) {
            v.currentTime = time;
            v.play().catch((err) => console.error("Play error:", err));
          }
          expectedTimeRef.current = time;
          expectedTimeUpdatedAtRef.current = Date.now();
          setPlaying(true);
          setTimeout(() => (isSyncingRef.current = false), 500);
        }),

        // ── pause from backend ──────────────────────────────────────────
        onEvent<any>("pause", (data) => {
          if (!checkFreshness(data)) return;
          const time = typeof data === 'number' ? data : data?.time;
          if (time === undefined) return;
          isSyncingRef.current = true;
          const v = videoRef.current;
          if (v) {
            v.pause();
            v.currentTime = time;
          }
          expectedTimeRef.current = time;
          expectedTimeUpdatedAtRef.current = Date.now();
          setPlaying(false);
          setTimeout(() => (isSyncingRef.current = false), 500);
        }),

        // ── seek from backend ───────────────────────────────────────────
        onEvent<any>("seek", (data) => {
          if (!checkFreshness(data)) return;
          const time = typeof data === 'number' ? data : data?.time;
          if (time === undefined) return;
          isSyncingRef.current = true;
          const v = videoRef.current;
          if (v) v.currentTime = time;
          expectedTimeRef.current = time;
          expectedTimeUpdatedAtRef.current = Date.now();
          setTimeout(() => (isSyncingRef.current = false), 500);
        }),

        // ── sync-correction from backend ────────────────────────────────
        onEvent<any>(
          "sync-correction",
          (data) => {
            if (!checkFreshness(data)) return;
            isSyncingRef.current = true;
            const v = videoRef.current;
            
            if (v) {
              if (!data.playing || v.paused) {
                // If paused, hard-jump
                v.currentTime = data.time;
                if (data.playing) v.play().catch(() => {});
                else v.pause();
              } else {
                // If playing, calculate drift and speed up/slow down slightly
                const local = v.currentTime;
                const drift = local - data.time;
                
                if (Math.abs(drift) > 2) {
                  // Too far apart, hard jump
                  v.currentTime = data.time;
                } else if (Math.abs(drift) > 0.05) {
                  // Apply correction by speeding up or slowing down
                  isCorrectingRef.current = true;
                  const rate = drift > 0 ? 0.9 : 1.1;
                  v.playbackRate = rate;
                  
                  // Calculate time needed to catch up/fall back
                  const timeToSync = (Math.abs(drift) / 0.1) * 1000;
                  
                  setTimeout(() => {
                    if (videoRef.current) videoRef.current.playbackRate = 1;
                    isCorrectingRef.current = false;
                  }, timeToSync);
                }
              }
            }
            
            expectedTimeRef.current = data.time;
            expectedTimeUpdatedAtRef.current = Date.now();
            setPlaying(data.playing);
            setTimeout(() => (isSyncingRef.current = false), 500);
          }
        ),
      ];

      return () => unsubs.forEach((fn) => fn());
    }, [isConnected, onEvent]);

    // ════════════════════════════════════════════════════════════════════
    // Periodic sync check (every 5 s)
    // ════════════════════════════════════════════════════════════════════

    useEffect(() => {
      if (!isConnected || !videoUrl) return;

      const interval = setInterval(() => {
        const v = videoRef.current;
        if (!v || v.paused || isSyncingRef.current || isCorrectingRef.current) return;

        const local = v.currentTime;
        const elapsed = (Date.now() - expectedTimeUpdatedAtRef.current) / 1000;
        const expected = expectedTimeRef.current + elapsed;

        const drift = Math.abs(local - expected);

        if (drift > DRIFT_THRESHOLD_S) {
          console.log(
            `[sync] drift detected: ${drift.toFixed(2)}s — emitting sync-check`
          );
          socket?.emit("sync-check", {
            roomCode,
            time: local,
          });
        }
      }, SYNC_INTERVAL_MS);

      return () => clearInterval(interval);
    }, [isConnected, videoUrl, roomCode, socket]);

    // ════════════════════════════════════════════════════════════════════
    // Local playback handlers (emit to backend unless syncing)
    // ════════════════════════════════════════════════════════════════════

    const handlePlay = useCallback(() => {
      if (isSyncingRef.current) return;
      const t = videoRef.current?.currentTime ?? 0;
      emitPlay({ roomCode, time: t });
      expectedTimeRef.current = t;
      expectedTimeUpdatedAtRef.current = Date.now();
      setPlaying(true);
    }, [roomCode, emitPlay]);

    const handlePause = useCallback(() => {
      if (isSyncingRef.current) return;
      const t = videoRef.current?.currentTime ?? 0;
      emitPause({ roomCode, time: t });
      expectedTimeRef.current = t;
      expectedTimeUpdatedAtRef.current = Date.now();
      setPlaying(false);
    }, [roomCode, emitPause]);

    const handleSeeked = useCallback(() => {
      if (isSyncingRef.current) return;
      const t = videoRef.current?.currentTime ?? 0;
      emitSeek({ roomCode, time: t });
      expectedTimeRef.current = t;
      expectedTimeUpdatedAtRef.current = Date.now();
    }, [roomCode, emitSeek]);

    const handleTimeUpdate = useCallback(() => {
      setCurrentTime(videoRef.current?.currentTime ?? 0);
    }, []);

    const handleLoadedMetadata = useCallback(() => {
      setDuration(videoRef.current?.duration ?? 0);
      setVideoError(null);
      applyInitialSync();
    }, [applyInitialSync]);

    const handleVideoError = useCallback(() => {
      const v = videoRef.current;
      const code = v?.error?.code;
      const type = errorCodeToType(code);
      setVideoError({ type, message: v?.error?.message ?? "" });
    }, []);

    // ── Toggle play / pause ─────────────────────────────────────────────
    const togglePlayPause = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      v.paused ? v.play().catch(() => {}) : v.pause();
    }, []);

    // ── Seek bar ────────────────────────────────────────────────────────
    const handleSeekBar = (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
    };

    // ── Volume ──────────────────────────────────────────────────────────
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (videoRef.current) videoRef.current.volume = v;
      setIsMuted(v === 0);
    };

    const toggleMute = () => {
      if (!videoRef.current) return;
      const muted = !isMuted;
      setIsMuted(muted);
      videoRef.current.muted = muted;
    };

    // ── Fullscreen ──────────────────────────────────────────────────────
    const toggleFullscreen = () => {
      const container = videoRef.current?.parentElement;
      if (!container) return;
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    };

    useEffect(() => {
      const handler = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // ── Auto-hide controls ──────────────────────────────────────────────
    const resetControlsTimer = useCallback(() => {
      setShowControls(true);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    // ── Progress % for visual bar ───────────────────────────────────────
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // ════════════════════════════════════════════════════════════════════
    // Render
    // ════════════════════════════════════════════════════════════════════

    return (
      <div className="flex flex-col w-full">
        {/* ── Player container ─────────────────────────────────────────── */}
        <div
          className="relative bg-gray-900 flex items-center justify-center flex-1 min-h-[300px] group select-none"
          onMouseMove={resetControlsTimer}
          onClick={togglePlayPause}
        >
          {/* ── Error overlay ──────────────────────────────────────────── */}
          {videoError && (
            <div className="absolute inset-0 z-20 bg-gray-900/95 flex flex-col items-center justify-center gap-3 text-center p-6">
              <span className="text-5xl">⚠️</span>
              <p className="text-white font-semibold text-lg">Video Error</p>
              <p className="text-gray-400 text-sm max-w-sm">
                {friendlyErrorMessage(videoError)}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoError(null);
                  videoRef.current?.load();
                }}
                className="mt-2 px-5 py-2 rounded-lg bg-blue-500 hover:opacity-90 active:opacity-80 text-white text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Video element ──────────────────────────────────────────── */}
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              className="w-full h-full max-h-[calc(100vh-220px)] object-contain"
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeeked}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
              playsInline
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-500 select-none p-8 text-center">
              <span className="text-7xl">🎬</span>
              <p className="text-lg font-medium text-gray-400">
                No video loaded
              </p>
              <p className="text-sm text-gray-500">
                Paste a direct video URL above to start watching together
              </p>
            </div>
          )}

          {/* ── Controls overlay ───────────────────────────────────────── */}
          {videoUrl && (
            <div
              className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
                showControls || !playing ? "opacity-100" : "opacity-0"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Custom progress bar ────────────────────────────────── */}
              <div className="relative w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer group/bar">
                {/* Filled portion */}
                <div
                  className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
                {/* Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 7px)` }}
                />
                {/* Hidden range input for interaction */}
                <input
                  id="seek-bar"
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeekBar}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-3">
                {/* Play / Pause */}
                <button
                  id="play-pause-btn"
                  onClick={togglePlayPause}
                  className="text-white hover:text-blue-400 transition-colors text-lg w-8 flex items-center justify-center"
                  title={playing ? "Pause" : "Play"}
                >
                  {playing ? "⏸" : "▶️"}
                </button>

                {/* Time display — MM:SS / MM:SS */}
                <span
                  id="time-display"
                  className="text-gray-300 text-xs font-mono min-w-[90px]"
                >
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Mute */}
                <button
                  id="mute-btn"
                  onClick={toggleMute}
                  className="text-white hover:text-blue-400 transition-colors text-sm"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                </button>

                {/* Volume slider */}
                <input
                  id="volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 accent-blue-500 cursor-pointer"
                />

                {/* Fullscreen */}
                <button
                  id="fullscreen-btn"
                  onClick={toggleFullscreen}
                  className="text-white hover:text-blue-400 transition-colors text-sm ml-1"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? "⊡" : "⛶"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default VideoPlayer;
