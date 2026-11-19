import { Home, Library, Music2, Search, Shield } from 'lucide-react';

export type Page = 'home' | 'search' | 'library';

export function Sidebar({
  page,
  onNavigate,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Music2 size={22} />
        </span>
        Muzii
      </div>
      <nav>
        <button className={page === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}>
          <Home size={20} /> Home
        </button>
        <button className={page === 'search' ? 'active' : ''} onClick={() => onNavigate('search')}>
          <Search size={20} /> Search
        </button>
        <button className={page === 'library' ? 'active' : ''} onClick={() => onNavigate('library')}>
          <Library size={20} /> Library
        </button>
      </nav>
      <div className="sidebar-foot">
        <p className="adblock-badge">
          <Shield size={14} /> Ad-blocker on
        </p>
        <p className="hint">Background play works with the screen off.</p>
      </div>
    </aside>
  );
}
