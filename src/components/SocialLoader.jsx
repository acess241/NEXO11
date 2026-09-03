import logoNexo from '/logo-novo.png'

function FeedSkeleton() {
  return (
    <>
      <div className="social-loader-topbar">
        <div className="social-loader-brand"><img src={logoNexo} alt=""/><strong>NEXO</strong><span>conectando...</span></div>
        <div className="social-loader-topbar-actions">
          <div className="skeleton shimmer skeleton-circle small" />
          <div className="skeleton shimmer skeleton-pill small" />
        </div>
      </div>

      <div className="page social-loader-page">
        <div className="social-loader-stories">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="social-loader-story">
              <div className="skeleton shimmer skeleton-circle story" />
              <div className="skeleton shimmer skeleton-line story-name" />
            </div>
          ))}
        </div>

        <div className="social-loader-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="social-loader-card">
              <div className="social-loader-row">
                <div className="skeleton shimmer skeleton-circle avatar" />
                <div className="social-loader-column">
                  <div className="skeleton shimmer skeleton-line medium" />
                  <div className="skeleton shimmer skeleton-line short" />
                </div>
              </div>

              <div className="social-loader-copy">
                <div className="skeleton shimmer skeleton-line long" />
                <div className="skeleton shimmer skeleton-line long" />
                <div className="skeleton shimmer skeleton-line medium" />
              </div>

              <div className="social-loader-actions">
                <div className="skeleton shimmer skeleton-pill" />
                <div className="skeleton shimmer skeleton-pill" />
                <div className="skeleton shimmer skeleton-pill" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ProfileSkeleton() {
  return (
    <div className="page social-loader-page">
      <div className="social-loader-profile-card">
        <div className="social-loader-row profile">
          <div className="skeleton shimmer skeleton-circle profile-avatar" />
          <div className="social-loader-column grow">
            <div className="skeleton shimmer skeleton-line medium" />
            <div className="skeleton shimmer skeleton-line short" />
            <div className="social-loader-stats">
              <div className="skeleton shimmer skeleton-pill stat" />
              <div className="skeleton shimmer skeleton-pill stat" />
            </div>
          </div>
        </div>

        <div className="social-loader-copy compact">
          <div className="skeleton shimmer skeleton-line long" />
          <div className="skeleton shimmer skeleton-line medium" />
        </div>

        <div className="social-loader-actions">
          <div className="skeleton shimmer skeleton-pill action-wide" />
          <div className="skeleton shimmer skeleton-pill action-wide" />
        </div>
      </div>

      <div className="social-loader-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton shimmer social-loader-grid-item" />
        ))}
      </div>
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="page social-loader-page">
      <div className="social-loader-topbar editor">
        <div className="skeleton shimmer skeleton-line short" />
        <div className="skeleton shimmer skeleton-line medium" />
        <div className="skeleton shimmer skeleton-line short" />
      </div>

      <div className="social-loader-editor-card">
        <div className="social-loader-editor-hero">
          <div className="skeleton shimmer skeleton-circle profile-avatar" />
          <div className="skeleton shimmer skeleton-line short" />
        </div>

        <div className="social-loader-form">
          <div className="skeleton shimmer skeleton-input" />
          <div className="skeleton shimmer skeleton-input" />
          <div className="skeleton shimmer skeleton-textarea" />
          <div className="skeleton shimmer skeleton-button" />
        </div>
      </div>
    </div>
  )
}

export default function SocialLoader({ variant = 'feed', showBottomNav = false }) {
  return (
    <div className="container social-loader-shell">
      {variant === 'profile' ? <ProfileSkeleton /> : null}
      {variant === 'editor' ? <EditorSkeleton /> : null}
      {variant === 'feed' ? <FeedSkeleton /> : null}

      {showBottomNav ? (
        <div className="social-loader-bottom-nav">
          <div className="skeleton shimmer skeleton-circle nav" />
          <div className="skeleton shimmer skeleton-circle nav" />
          <div className="skeleton shimmer skeleton-circle nav" />
          <div className="skeleton shimmer skeleton-circle nav" />
          <div className="skeleton shimmer skeleton-circle nav" />
        </div>
      ) : null}
    </div>
  )
}
