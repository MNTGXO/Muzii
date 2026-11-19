import type { Playlist, Track } from '../api/types';

/**
 * Bundled fallback catalog (mirrors worker/src/providers/demo.ts).
 * Used when the Cloudflare Worker is unreachable — e.g. local preview
 * without `wrangler dev` — so the app always works.
 */
const base = 'https://www.soundhelix.com/examples/js/electronic';

const t = (
  n: number,
  title: string,
  artist: string,
  album: string,
  durationSec: number,
): Track => ({
  id: `sh-${n}`,
  title,
  artist,
  album,
  durationSec,
  streamUrl: `${base}/SoundHelix-Song-${n}.mp3`,
  artworkUrl: `https://picsum.photos/seed/muzii${n}/600/600`,
  gradientSeed: (n * 37) % 360,
});

export const DEMO_TRACKS: Track[] = [
  t(1, 'Neon Skyline', 'SoundHelix', 'Midnight Drive', 372),
  t(2, 'Golden Hour', 'SoundHelix', 'Summer Static', 345),
  t(3, 'Electric Dreams', 'SoundHelix', 'Voltage', 401),
  t(4, 'Ocean Breeze', 'SoundHelix', 'Coastal', 318),
  t(5, 'City Lights', 'SoundHelix', 'Urban Pulse', 356),
  t(6, 'Midnight Run', 'SoundHelix', 'After Dark', 389),
  t(7, 'Solar Flare', 'SoundHelix', 'Orbit', 334),
  t(8, 'Velvet Moon', 'SoundHelix', 'Lunar', 412),
  t(9, 'Thunder Road', 'SoundHelix', 'Storm Chaser', 367),
  t(10, 'Fire Starter', 'SoundHelix', 'Ignition', 298),
  t(11, 'Crystal Waves', 'SoundHelix', 'Tidepool', 351),
  t(12, 'Neon Rain', 'SoundHelix', 'Cyberpunk', 383),
  t(13, 'Starlight Express', 'SoundHelix', 'Cosmos', 429),
  t(14, 'Deep Focus', 'SoundHelix', 'Flow State', 402),
  t(15, 'Echo Chamber', 'SoundHelix', 'Reverb', 336),
  t(16, 'Final Countdown', 'SoundHelix', 'Last Lap', 364),
];

export const DEMO_PLAYLISTS: Playlist[] = [
  {
    id: 'top-hits',
    title: 'Top Hits',
    description: 'The biggest tracks right now.',
    trackIds: ['sh-1', 'sh-3', 'sh-5', 'sh-7', 'sh-9'],
    gradient: 'linear-gradient(135deg,#FA2D48,#FC3C44)',
  },
  {
    id: 'chill-vibes',
    title: 'Chill Vibes',
    description: 'Mellow tunes for slow evenings.',
    trackIds: ['sh-2', 'sh-4', 'sh-6', 'sh-8'],
    gradient: 'linear-gradient(135deg,#5E5CE6,#BF5AF2)',
  },
  {
    id: 'workout-energy',
    title: 'Workout Energy',
    description: 'High-octane fuel for your session.',
    trackIds: ['sh-10', 'sh-11', 'sh-12', 'sh-13'],
    gradient: 'linear-gradient(135deg,#FF9F0A,#FF375F)',
  },
  {
    id: 'focus-flow',
    title: 'Focus Flow',
    description: 'Deep concentration, zero distractions.',
    trackIds: ['sh-14', 'sh-15', 'sh-16'],
    gradient: 'linear-gradient(135deg,#64D2FF,#30D158)',
  },
];
