import { useState } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { useTaste } from '../taste/TasteContext';
import { LANGUAGES } from '../taste/store';

/**
 * First-run language picker.
 *
 * The home feed and every song radio are restricted to the languages chosen
 * here, so the app stops recommending Telugu songs to someone listening to
 * Malayalam. Search always stays global - if you look for something, you get
 * it regardless of these settings.
 */
export function OnboardingPage() {
  const { chooseLanguages, finishOnboarding } = useTaste();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="onboarding">
      <div className="onboarding-inner">
        <div className="onboarding-badge">
          <Sparkles size={15} />
          Welcome to Muzii
        </div>
        <h1>What do you listen to?</h1>
        <p className="onboarding-sub">
          Pick your languages and Muzii builds a feed around them. Every song
          radio stays in that lane — same language, same mood.
        </p>

        <div className="lang-grid">
          {LANGUAGES.map((lang) => {
            const active = selected.includes(lang.id);
            return (
              <button
                key={lang.id}
                className={`lang-chip${active ? ' active' : ''}`}
                onClick={() => toggle(lang.id)}
                aria-pressed={active}
              >
                <span className="lang-emoji" aria-hidden>
                  {lang.emoji}
                </span>
                <span className="lang-text">
                  <span className="lang-native">{lang.native}</span>
                  <span className="lang-label">{lang.label}</span>
                </span>
                {active && (
                  <span className="lang-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="onboarding-actions">
          <button
            className="btn-primary"
            disabled={selected.length === 0}
            onClick={() => chooseLanguages(selected)}
          >
            Continue
            <ChevronRight size={17} />
          </button>
          <button className="btn-ghost" onClick={finishOnboarding}>
            Skip for now — I'll just search
          </button>
        </div>
        <p className="onboarding-note">
          You can change this any time in Library → Taste.
        </p>
      </div>
    </div>
  );
}
