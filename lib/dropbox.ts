/**
 * Converts a Dropbox share link to a direct download URL suitable for HTML5 <video> tags.
 * 
 * @param shareLink The original Dropbox URL (e.g. https://www.dropbox.com/s/xyz/video.mp4?dl=0)
 * @returns The converted URL with ?dl=1
 * @throws Error if the URL is not valid or not a Dropbox URL
 */
export function convertDropboxLink(shareLink: string): string {
  try {
    const url = new URL(shareLink);
    
    // Check if it's a Dropbox URL
    if (!url.hostname.includes("dropbox.com") && !url.hostname.includes("dropboxusercontent.com")) {
      throw new Error("The provided link is not a valid Dropbox URL.");
    }
    
    // Check if it looks like a folder link (often contains /sh/ or /scl/fo/)
    if (url.pathname.includes("/sh/") || url.pathname.includes("/scl/fo/")) {
      throw new Error("This looks like a link to a Dropbox folder. Please provide a link to a specific video file.");
    }
    
    // Force download mode which allows direct video playback
    url.searchParams.set("dl", "1");
    // Optionally remove 'rlkey' if needed, but it's usually fine to keep
    
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message !== "Invalid URL") {
      throw error;
    }
    throw new Error("Invalid URL format. Please ensure you copied the full link.");
  }
}

/**
 * Checks if a given string is a valid Dropbox link.
 */
export function isDropboxLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("dropbox.com") || parsed.hostname.includes("dropboxusercontent.com");
  } catch {
    return false;
  }
}
