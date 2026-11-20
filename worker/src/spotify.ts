/** Read track metadata from a public Spotify playlist embed, without credentials. */
export interface SpotifyEntry { title: string; artist: string }
export interface SpotifyPlaylist {
  title: string;
  entries: SpotifyEntry[];
  unreadable: string[];
  notice: string;
}

export function spotifyPlaylistId(input: string): string | null {
  const text = input.trim();
  const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return uri[1];
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'open.spotify.com' || url.port || url.username || url.password) return null;
  const match = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/|embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname);
  return match?.[1] ?? null;
}

/** Parse the public embed’s Next.js hydration data without executing HTML. */
export function parseSpotifyEmbed(html: string): SpotifyPlaylist {
  // Isolate the script using string offsets to avoid backtracking on large pages.
  const marker = 'id="__NEXT_DATA__"';
  const index = html.indexOf(marker);
  if (index < 0) throw new Error('missing embed data');
  const open = html.lastIndexOf('<script', index);
  const content = html.indexOf('>', index);
  const end = html.indexOf('</script>', content);
  if (open < 0 || content < 0 || end < 0) throw new Error('invalid embed data');
  const data: any = JSON.parse(html.slice(content + 1, end));
  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) throw new Error('unreadable playlist');
  const entries: SpotifyEntry[] = [], unreadable: string[] = [];
  const limit = 1000;
  for (const [index, item] of entity.trackList.slice(0, limit).entries()) {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const artist = typeof item?.subtitle === 'string' ? item.subtitle.trim() : '';
    if (!title || !artist || title.length > 300 || artist.length > 500) {
      unreadable.push(title ? `${title.slice(0, 300)} (missing artist or invalid metadata)` : `Unavailable Spotify entry ${index + 1}`);
    } else entries.push({ title, artist });
  }
  const count = entity.trackList.length;
  const total = typeof entity.trackCount === 'number' && Number.isSafeInteger(entity.trackCount) && entity.trackCount >= count ? entity.trackCount : null;
  let notice = 'Spotify may provide only part of a playlist in its public embed. Check the source playlist for missing songs.';
  if (count > limit) notice = `Only the first ${limit} Spotify entries were read. Remaining entries were not imported.`;
  else if (total !== null && total > count) notice = `Spotify returned ${count} of ${total} playlist entries. Remaining entries were not imported.`;
  return { title: typeof entity.name === 'string' && entity.name.trim() ? entity.name.trim().slice(0, 200) : 'Imported Spotify playlist', entries, unreadable, notice };
}

async function limitedText(response: Response): Promise<string> {
  if (!response.body) throw new Error('missing response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error('embed too large'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function readSpotifyPlaylist(id: string): Promise<SpotifyPlaylist> {
  if (!/^[A-Za-z0-9]{22}$/.test(id)) throw new Error('invalid playlist id');
  // Fixed hostname and manual redirects prevent user-supplied URLs from being fetched.
  const response = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; Muzii/1.0)' },
    redirect: 'manual', signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error('Spotify playlist unavailable');
  return parseSpotifyEmbed(await limitedText(response));
}
