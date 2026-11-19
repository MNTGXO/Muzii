import { Home, Library, Radio, Search } from 'lucide-react';
import type { Page } from './Sidebar';

export function MobileNav({
  page,
  onNavigate,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
}) {
  return (
    <nav className="mobile-nav">
      <button className={page === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}>
        <Home size={22} />
        <span>Home</span>
      </button>
      <button className={page === 'search' ? 'active' : ''} onClick={() => onNavigate('search')}>
        <Search size={22} />
        <span>Search</span>
      </button>
      <button className={page === 'library' ? 'active' : ''} onClick={() => onNavigate('library')}>
        <Library size={22} />
        <span>Library</span>
      </button>
      <button className={page === 'jam' ? 'active' : ''} onClick={() => onNavigate('jam')}>
        <Radio size={22} />
        <span>Jam</span>
      </button>
    </nav>
  );
}
