import { Music2 } from 'lucide-react';
import type { Track } from '../api/types';

/** Apple-Music-style gradient artwork generated from the track seed. */
export function Artwork({
  track,
  size = 56,
  radius = 12,
}: {
  track: Track;
  size?: number;
  radius?: number;
}) {
  const hue = track.gradientSeed % 360;
  return (
    <div
      className="artwork"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, hsl(${hue} 85% 60%), hsl(${(hue + 60) % 360} 85% 45%))`,
      }}
      aria-hidden
    >
      <Music2 size={Math.round(size * 0.45)} />
    </div>
  );
}
