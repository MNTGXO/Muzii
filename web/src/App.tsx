import { useCallback, useEffect, useState } from 'react';
import { PlayerProvider } from './player/PlayerContext';
import { Sidebar, type Page } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { PlayerBar } from './components/PlayerBar';
import { NowPlaying } from './components/NowPlaying';
import { QueuePanel } from './components/QueuePanel';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { JamPage } from './pages/JamPage';
import { usePlayer } from './player/PlayerContext';
import { getCatalog } from './api/client';
import type { Track } from './api/types';

type View =
  | { type: 'page'; page: Page }
  | { type: 'playlist'; id: string }
  | { type: 'jam'; code: string | null };

/**
 * Tiny hash router. Hash routing (not history) is deliberate: the app is a
 * static Pages deploy, and `#/jam/AB3K9` links can be shared/opened without
 * any server-side rewrite rules.
 */
function readHash(): View | null {
  const hash = location.hash.replace(/^#\/?/, '');
  const jam = hash.match(/^jam\/?([A-Za-z0-9]{4,8})?$/);
  if (jam) return { type: 'jam', code: jam[1]?.toUpperCase() ?? null };
  if (hash === 'search') return { type: 'page', page: 'search' };
  if (hash === 'library') return { type: 'page', page: 'library' };
  if (hash === 'home' || hash === '') return null;
  return null;
}

function Shell() {
  const [view, setView] = useState<View>(() => readHash() ?? { type: 'page', page: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [catalog, setCatalog] = useState<Track[]>([]);
  const player = usePlayer();

  // Share the catalog with the player so local radio has something to pick
  // from when the network endpoint is unavailable.
  useEffect(() => {
    let cancelled = false;
    void getCatalog().then((tracks) => {
      if (cancelled) return;
      setCatalog(tracks);
      player.setCatalog(tracks);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL and the view in sync (back/forward + share links work).
  useEffect(() => {
    const onHashChange = () => setView(readHash() ?? { type: 'page', page: 'home' });
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((page: Page) => {
    location.hash = page === 'home' ? '#/home' : `#/${page}`;
    setView({ type: 'page', page });
  }, []);

  const openPlaylist = useCallback((id: string) => {
    location.hash = '#/playlist';
    setView({ type: 'playlist', id });
  }, []);

  const openJam = useCallback((code: string | null) => {
    location.hash = code ? `#/jam/${code}` : '#/jam';
    setView({ type: 'jam', code });
  }, []);

  const openJamCode = useCallback((code: string) => {
    location.hash = `#/jam/${code}`;
    setView({ type: 'jam', code });
  }, []);

  const page: Page =
    view.type === 'page' ? view.page : view.type === 'jam' ? 'jam' : 'library';

  // Browsers block autoplay until a gesture; any first click in the app
  // counts, so make sure the pending track actually starts.
  useEffect(() => {
    const resume = () => {
      if (!player.isPlaying && player.buffering) void player.toggle();
    };
    window.addEventListener('pointerdown', resume, { once: true });
    return () => window.removeEventListener('pointerdown', resume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.buffering]);

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} />
      <main className="main">
        {view.type === 'jam' ? (
          <JamPage
            code={view.code}
            onBack={() => navigate('home')}
            onOpenCode={openJamCode}
            catalog={catalog}
          />
        ) : view.type === 'playlist' ? (
          <PlaylistPage playlistId={view.id} onBack={() => navigate('library')} />
        ) : view.page === 'home' ? (
          <HomePage onOpenPlaylist={openPlaylist} onOpenJam={() => openJam(null)} />
        ) : view.page === 'search' ? (
          <SearchPage />
        ) : view.page === 'jam' ? (
          <JamPage
            code={null}
            onBack={() => navigate('home')}
            onOpenCode={openJamCode}
            catalog={catalog}
          />
        ) : (
          <LibraryPage onOpenPlaylist={openPlaylist} />
        )}
      </main>

      {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
      <PlayerBar
        onExpand={() => setShowNowPlaying(true)}
        onToggleQueue={() => setShowQueue((s) => !s)}
      />
      <MobileNav page={page} onNavigate={navigate} />
      {showNowPlaying && (
        <NowPlaying
          onClose={() => setShowNowPlaying(false)}
          onOpenQueue={() => setShowQueue(true)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <Shell />
    </PlayerProvider>
  );
}
