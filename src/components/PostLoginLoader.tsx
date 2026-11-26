import type { CSSProperties } from 'react';

const DOT_COLORS = [
  '#FFC94A', '#FFAD32', '#FFE38A', '#FFD15B',
  '#F5A623', '#FFF0B5', '#FFC13D', '#FFE7A1',
];

export function PostLoginLoader() {
  return (
    <main className="post-login-loader" role="status" aria-live="polite" aria-label="Loading your account">
      <section className="post-login-loader__panel">
        <img
          className="post-login-loader__logo"
          src="/royal-salon-logo.png"
          alt="Royal Saloon"
        />

        <div className="post-login-loader__animation" aria-hidden="true">
          <div className="post-login-loader__dots">
            {DOT_COLORS.map((color, index) => (
              <span
                key={color}
                style={{ '--dot-index': index, '--dot-color': color } as CSSProperties}
              />
            ))}
          </div>
        </div>

        <p className="post-login-loader__title">Loading your account...</p>
        <p className="post-login-loader__caption">Preparing your workspace</p>
      </section>
    </main>
  );
}
