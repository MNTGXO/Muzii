import { useState } from 'react';
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

type View = { type: 'page'; page: Page } | { type: 'playlist'; id: string };

function Shell() {
  const [view, setView] = useState<View>({ type: 'page', page: 'home' });
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const navigate = (page: Page) => setView({ type: 'page', page });
  const openPlaylist = (id: string) => setView({ type: 'playlist', id });
  const page: Page = view.type === 'page' ? view.page : 'library';

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} />
      <main className="main">
        {view.type === 'playlist' ? (
          <PlaylistPage playlistId={view.id} onBack={() => navigate('library')} />
        ) : view.page === 'home' ? (
          <HomePage onOpenPlaylist={openPlaylist} />
        ) : view.page === 'search' ? (
          <SearchPage />
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
      {showNowPlaying && <NowPlaying onClose={() => setShowNowPlaying(false)} />}
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
