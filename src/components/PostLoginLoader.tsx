import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Brush, Scissors, Sparkles } from 'lucide-react';

type LoadingScene = 'floating' | 'wave';

export function PostLoginLoader() {
  const [scene, setScene] = useState<LoadingScene>('floating');

  useEffect(() => {
    const interval = window.setInterval(() => {
      setScene((current) => current === 'floating' ? 'wave' : 'floating');
    }, 1250);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="post-login-loader" role="status" aria-live="polite" aria-label="Loading your account">
      <section className="post-login-loader__panel">
        <img
          className="post-login-loader__logo"
          src="/royal-salon-logo.png"
          alt="Royal Saloon"
        />

        <div className="post-login-loader__animation" aria-hidden="true">
          {scene === 'floating' ? (
            <div className="post-login-loader__icons">
              <span className="post-login-loader__icon post-login-loader__icon--one"><Brush /></span>
              <span className="post-login-loader__icon post-login-loader__icon--two"><Scissors /></span>
              <span className="post-login-loader__icon post-login-loader__icon--three"><Sparkles /></span>
            </div>
          ) : (
            <div className="post-login-loader__dots">
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} style={{ '--dot-index': index } as CSSProperties} />
              ))}
            </div>
          )}
        </div>

        <p className="post-login-loader__title">Loading your account...</p>
        <p className="post-login-loader__caption">
          {scene === 'floating' ? 'Getting your workspace ready' : 'Almost there'}
        </p>
      </section>
    </main>
  );
}
