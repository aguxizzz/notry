import React, { useState } from 'react';
import { Check, Link, ExternalLink } from 'lucide-react';
import { SiWhatsapp, SiTelegram, SiFacebook, SiMessenger, SiGmail, SiInstagram, SiTiktok, SiYoutube, SiGoogle } from 'react-icons/si';
import { Button } from '../../ui/components';
import '../../ui/components/Modal.css';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
const supportsWebShare = Boolean(navigator.share);

const VISOR_ORIGINS = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: SiWhatsapp,
    webUrl: (url) => `https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://send?text=${encodeURIComponent(url)}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(`https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`)};end`,
  },
  {
    value: 'telegram',
    label: 'Telegram',
    icon: SiTelegram,
    webUrl: (url) => `https://t.me/share/url?url=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://msg_url?url=${encodeURIComponent(url)}#Intent;scheme=tg;package=org.telegram.messenger;S.browser_fallback_url=${encodeURIComponent(`https://t.me/share/url?url=${encodeURIComponent(url)}`)};end`,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: SiFacebook,
    webUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://share#Intent;scheme=fb;package=com.facebook.katana;S.android.intent.extra.TEXT=${encodeURIComponent(url)};S.browser_fallback_url=${encodeURIComponent(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)};end`,
  },
  {
    value: 'messenger',
    label: 'Messenger',
    icon: SiMessenger,
    webUrl: null,
    androidIntent: (url) => `intent://send?text=${encodeURIComponent(url)}#Intent;scheme=fb-messenger;package=com.facebook.orca;S.browser_fallback_url=${encodeURIComponent(`https://www.facebook.com/messages/new`)};end`,
  },
  {
    value: 'gmail',
    label: 'Gmail',
    icon: SiGmail,
    webUrl: (url) => `https://mail.google.com/mail/?view=cm&fs=1&body=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://send#Intent;scheme=mailto;package=com.google.android.gm;S.android.intent.extra.TEXT=${encodeURIComponent(url)};end`,
  },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: SiInstagram,
    webUrl: null,
    androidIntent: null,
  },
  {
    value: 'tiktok',
    label: 'TikTok',
    icon: SiTiktok,
    webUrl: null,
    androidIntent: null,
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: SiYoutube,
    webUrl: null,
    androidIntent: null,
  },
  {
    value: 'google',
    label: 'Google',
    icon: SiGoogle,
    webUrl: null,
    androidIntent: null,
  },
  {
    value: '',
    label: 'Link Directo',
    icon: Link,
    webUrl: null,
    androidIntent: null,
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

    // Android path: use intent URLs to open apps directly
    if (isAndroid && origin.androidIntent) {
      const intentUrl = origin.androidIntent(link);
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = intentUrl;
      return;
    }

    // iOS/desktop with Web Share API: delegate to native OS share sheet
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
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
                    alignItems: 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: isCopied ? 'var(--color-success-bg)' : 'var(--bg-dark)',
                    border: isCopied ? '2px solid var(--color-success)' : '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--duration-fast) var(--ease-out)',
                    color: isCopied ? 'var(--color-success)' : 'var(--text-muted)',
                    textAlign: 'left',
                    position: 'relative',
                    justifyContent: 'space-between',
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
                      : origin.webUrl || origin.androidIntent
                      ? `Abrir ${origin.label}`
                      : `Copiar enlace para ${origin.label}`
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flex: 1 }}>
                    {isCopied ? (
                      <Check size={20} />
                    ) : (
                      <Icon size={20} />
                    )}
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)' }}>
                      {isCopied ? 'Copiado' : origin.label}
                    </span>
                  </div>
                  {!isMobile && (origin.webUrl || origin.androidIntent) && (
                    <ExternalLink
                      size={14}
                      style={{ opacity: 0.4, flexShrink: 0 }}
                    />
                  )}
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
