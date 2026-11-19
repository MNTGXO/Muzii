import { useState } from 'react';
import { Music2 } from 'lucide-react';
import type { Track } from '../api/types';

/**
 * Apple-Music-style artwork: real cover art when available, with a
 * generated gradient (from the track seed) as fallback while loading
 * and if the image fails.
 */
export function Artwork({
  track,
  size = 56,
  radius = 12,
  className = '',
}: {
  track: Track;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const hue = track.gradientSeed % 360;
  const showImage = Boolean(track.artworkUrl) && !failed;

  return (
    <div
      className={`artwork ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, hsl(${hue} 85% 60%), hsl(${(hue + 60) % 360} 85% 45%))`,
      }}
      aria-hidden
    >
      {showImage ? (
        <img
          src={track.artworkUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Music2 size={Math.round(size * 0.45)} />
      )}
    </div>
  );
}
