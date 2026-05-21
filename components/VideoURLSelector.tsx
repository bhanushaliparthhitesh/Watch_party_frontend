"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { convertDropboxLink, isDropboxLink } from "../lib/dropbox";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoURLSelectorProps {
  /** The currently-loaded video URL (empty string = nothing loaded) */
  currentUrl: string;
  /** Called when the user submits a valid new URL */
  onSubmit: (url: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Supported direct-play extensions */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".m3u8", ".mov"];

/** Quick check: is this a syntactically valid URL? */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Friendly label for a video URL.
 * Truncates long URLs and recognises known hosts.
 */
function urlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");

    if (host.includes("dropbox.com") || host.includes("dropboxusercontent.com")) return "Dropbox video";
    if (host.includes("drive.google.com")) return "Google Drive video";
    if (host.includes("r2.cloudflarestorage.com") || host.includes("r2.dev"))
      return "Cloudflare R2 video";
    if (host.includes("s3.amazonaws.com") || host.includes("s3."))
      return "S3 video";

    // Show last path segment if it looks like a filename
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments.at(-1) ?? "";
    if (VIDEO_EXTENSIONS.some((ext) => last.toLowerCase().endsWith(ext))) {
      return last.length > 35 ? last.slice(0, 32) + "…" : last;
    }

    return host + (parsed.pathname.length > 1 ? parsed.pathname.slice(0, 20) + "…" : "");
  } catch {
    return url.length > 40 ? url.slice(0, 37) + "…" : url;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoURLSelector({
  currentUrl,
  onSubmit,
}: VideoURLSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── Focus the input when modal opens ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the modal to render
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setUrlInput("");
      setError("");
    }
  }, [isOpen]);

  // ── Close on Escape ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // ── Close on backdrop click ────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === modalRef.current) setIsOpen(false);
    },
    []
  );

  // ── Validate and submit ────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();

    if (!url) {
      setError("Please enter a video URL.");
      return;
    }

    if (!isValidUrl(url)) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setError("");
    onSubmit(url);
    setIsOpen(false);
  };

  // ── Auto-convert Dropbox links on paste/change ─────────────────────────
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Automatically detect and convert Dropbox links
    if (isDropboxLink(value)) {
      try {
        const converted = convertDropboxLink(value);
        if (converted !== value) {
          value = converted;
          // You could show a success message here if desired
        }
      } catch (err: any) {
        setError(err.message || "Failed to convert Dropbox link");
      }
    }
    
    setUrlInput(value);
    if (error) setError("");
  };

  // ── Paste helper chips ─────────────────────────────────────────────────
  const exampleFormats = [
    { label: ".mp4", hint: "Direct MP4 link" },
    { label: ".webm", hint: "WebM video" },
    { label: "Dropbox", hint: "Dropbox share link (auto-converts)" },
    { label: "R2", hint: "Cloudflare R2 URL" },
    { label: "GDrive", hint: "Google Drive link" },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Inline bar (always visible) ──────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
        {/* Current URL or placeholder */}
        <div className="flex-1 min-w-0">
          {currentUrl ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span
                className="text-sm text-gray-700 font-medium truncate"
                title={currentUrl}
              >
                {urlLabel(currentUrl)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">
              No video selected
            </span>
          )}
        </div>

        {/* Change Video button */}
        <button
          id="change-video-btn"
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 rounded-lg bg-blue-500 hover:opacity-90 active:opacity-80 text-white text-sm font-semibold whitespace-nowrap"
        >
          {currentUrl ? "Change Video" : "Add Video"}
        </button>
      </div>

      {/* ── Modal ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={modalRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 animate-[fadeIn_150ms_ease-out]"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden animate-[slideUp_200ms_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {currentUrl ? "Change Video" : "Load a Video"}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:opacity-80 text-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="px-6 py-5">
              <label
                htmlFor="modal-video-url"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Video URL
              </label>

              <input
                ref={inputRef}
                id="modal-video-url"
                type="text"
                value={urlInput}
                onChange={handleUrlChange}
                placeholder="https://example.com/video.mp4"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-300 outline-none focus:border-blue-500 text-gray-800 placeholder-gray-400 text-sm"
              />

              {/* Error */}
              {error && (
                <p className="text-red-500 text-sm mt-2">{error}</p>
              )}

              {/* Supported formats */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {exampleFormats.map((fmt) => (
                  <span
                    key={fmt.label}
                    title={fmt.hint}
                    className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-xs font-medium border border-gray-200"
                  >
                    {fmt.label}
                  </span>
                ))}
              </div>

              {/* Info text */}
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                Paste a direct link to a video file. Supported sources include
                direct <strong>.mp4</strong> / <strong>.webm</strong> URLs,
                Dropbox share links (auto-converted), Cloudflare R2 signed URLs, and Google Drive shareable links.
                The video will reset to the beginning for all viewers.
              </p>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-gray-200 text-gray-800 hover:opacity-90 active:opacity-80 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  id="submit-video-url-btn"
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-500 hover:opacity-90 active:opacity-80 text-white font-semibold text-sm"
                >
                  Load Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Inline keyframes ─────────────────────────────────────────── */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}
