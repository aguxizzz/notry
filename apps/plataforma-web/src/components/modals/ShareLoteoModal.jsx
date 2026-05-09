import React, { useState } from 'react';
import { Check, MessageCircle, Search, Music, Facebook, Youtube, Link, ExternalLink } from 'lucide-react';
import { Button } from '../../ui/components';
import '../../ui/components/Modal.css';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const supportsWebShare = Boolean(navigator.share);

const VISOR_ORIGINS = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    webUrl: (url) => `https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`,
  },
  {
    value: 'google',
    label: 'Google',
    icon: Search,
    webUrl: null,
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    icon: Music,
    webUrl: null,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: Facebook,
    webUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: Youtube,
    webUrl: null,
  },
  {
    value: '',
    label: 'Link Directo',
    icon: Link,
    webUrl: null,
  },
];

export default function ShareLoteoModal({
  isOpen,
  onClose,
  visorBaseUrl,
  apiBaseUrl,
  loteoId,
}) {
  const [copiedOrigin, setCopiedOrigin] = useState(null);

  const generateLink = (origin) => {
    const dataUrl = `${apiBaseUrl}/loteos/${loteoId}/visor_data`;
    const baseUrl = `${visorBaseUrl}/?data=${dataUrl}`;
    if (origin) {
      return `${baseUrl}&ref=${origin}`;
    }
    return baseUrl;
  };

  const handleShare = async (origin) => {
    const link = generateLink(origin.value);

    // Mobile path: delegate to native OS share sheet
    if (isMobile && supportsWebShare) {
      try {
        await navigator.share({ url: link, title: 'Visor de Loteo' });
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled
        // unexpected error → fall through to clipboard
        try {
          await navigator.clipboard.writeText(link);
          setCopiedOrigin(origin.value);
          setTimeout(() => setCopiedOrigin(null), 2000);
        } catch (err) {
          console.error('Error copying to clipboard:', err);
        }
      }
      return;
    }

    // Desktop path: open platform's web share URL
    if (origin.webUrl) {
      window.open(origin.webUrl(link), '_blank', 'noopener,noreferrer');
      return;
    }

    // Fallback (TikTok, Google, YouTube, direct link): clipboard
    try {
      await navigator.clipboard.writeText(link);
      setCopiedOrigin(origin.value);
      setTimeout(() => setCopiedOrigin(null), 2000);
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <h3 className="modal-title">Compartir Visor</h3>

        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: 'var(--space-lg)' }}>
            ¿En qué plataforma vas a compartir el visor?
          </p>

          {isMobile && supportsWebShare && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
              Se abrirá el menú de compartir de tu teléfono.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
            {VISOR_ORIGINS.map(origin => {
              const Icon = origin.icon;
              const isCopied = copiedOrigin === origin.value;
              return (
                <button
                  key={origin.value}
                  type="button"
                  onClick={() => handleShare(origin)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md)',
                    background: isCopied ? 'var(--color-success-bg)' : 'var(--bg-dark)',
                    border: isCopied ? '2px solid var(--color-success)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--duration-fast) var(--ease-out)',
                    color: isCopied ? 'var(--color-success)' : 'var(--text-muted)',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCopied) {
                      e.currentTarget.style.borderColor = 'var(--accent-color)';
                      e.currentTarget.style.background = 'var(--bg-light)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCopied) {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'var(--bg-dark)';
                    }
                  }}
                  title={
                    isCopied
                      ? 'Copiado'
                      : isMobile && supportsWebShare
                      ? `Compartir con ?ref=${origin.value || 'directo'}`
                      : origin.webUrl
                      ? `Abrir ${origin.label}`
                      : `Copiar enlace para ${origin.label}`
                  }
                >
                  {!isMobile && origin.webUrl && (
                    <ExternalLink
                      size={10}
                      style={{ position: 'absolute', top: 6, right: 6, opacity: 0.4 }}
                    />
                  )}
                  {isCopied ? (
                    <Check size={24} />
                  ) : (
                    <Icon size={24} />
                  )}
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)' }}>
                    {isCopied ? 'Copiado' : origin.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
