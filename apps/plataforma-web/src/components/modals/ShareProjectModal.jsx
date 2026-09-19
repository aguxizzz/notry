import React, { useState } from 'react';
import { Check, Link, ExternalLink } from 'lucide-react';
import { SiWhatsapp, SiFacebook, SiTiktok, SiYoutube, SiGoogle } from 'react-icons/si';
import { Button } from '../../ui/components';
import '../../ui/components/Modal.css';
import './ShareProjectModal.css';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
const supportsWebShare = Boolean(navigator.share);

// Solo canales que el visor sabe distinguir en `detectOrigin()` (apps/visor/src/analytics.js).
// Otro `?ref=` se registra como visor_direct y ensucia el embudo por canal.
const SHARE_CHANNELS = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: SiWhatsapp,
    webUrl: (url) => `https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://send?text=${encodeURIComponent(url)}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(`https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`)};end`,
  },
  {
    value: 'facebook',
    label: 'Facebook',
    icon: SiFacebook,
    webUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    androidIntent: (url) => `intent://share#Intent;scheme=fb;package=com.facebook.katana;S.android.intent.extra.TEXT=${encodeURIComponent(url)};S.browser_fallback_url=${encodeURIComponent(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)};end`,
  },
  { value: 'tiktok', label: 'TikTok', icon: SiTiktok },
  { value: 'youtube', label: 'YouTube', icon: SiYoutube },
  { value: 'google', label: 'Google', icon: SiGoogle },
  { value: '', label: 'Link Directo', icon: Link },
];

export default function ShareProjectModal({ isOpen, onClose, visorBaseUrl, projectSlug, addToast }) {
  const [copiedChannel, setCopiedChannel] = useState(null);

  // El link de proyecto abre el "loteo del visor 360" configurado en Finanzas.
  const generateLink = (channel) => {
    const baseUrl = `${visorBaseUrl}/${projectSlug}`;
    return channel ? `${baseUrl}?ref=${channel}` : baseUrl;
  };

  const copyLink = async (channel, link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedChannel(channel.value);
      setTimeout(() => setCopiedChannel(null), 2000);
    } catch {
      addToast?.('No se pudo copiar el enlace. Copialo manualmente.', 'error');
    }
  };

  const handleShare = async (channel) => {
    const link = generateLink(channel.value);

    // Android: intent URLs para abrir la app directo
    if (isAndroid && channel.androidIntent) {
      window.location.assign(channel.androidIntent(link));
      return;
    }

    // iOS/Android sin intent: menú nativo del sistema
    if (isMobile && supportsWebShare) {
      try {
        await navigator.share({ url: link, title: 'Visor 360' });
      } catch (e) {
        if (e.name === 'AbortError') return; // el usuario canceló
        await copyLink(channel, link);
      }
      return;
    }

    // Desktop: share URL web de la plataforma
    if (channel.webUrl) {
      window.open(channel.webUrl(link), '_blank', 'noopener,noreferrer');
      return;
    }

    // TikTok, Google, YouTube, link directo: portapapeles
    await copyLink(channel, link);
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

        <div className="share-modal-body">
          <p className="share-modal-hint">¿En qué plataforma vas a compartir el visor?</p>

          {isMobile && supportsWebShare && (
            <p className="share-modal-note">Se abrirá el menú de compartir de tu teléfono.</p>
          )}

          <div className="share-channel-list">
            {SHARE_CHANNELS.map(channel => {
              const Icon = channel.icon;
              const isCopied = copiedChannel === channel.value;
              return (
                <button
                  key={channel.value}
                  type="button"
                  className={`share-channel${isCopied ? ' share-channel--copied' : ''}`}
                  onClick={() => handleShare(channel)}
                  title={
                    isCopied
                      ? 'Copiado'
                      : isMobile && supportsWebShare
                      ? `Compartir con ?ref=${channel.value || 'directo'}`
                      : channel.webUrl || channel.androidIntent
                      ? `Abrir ${channel.label}`
                      : `Copiar enlace para ${channel.label}`
                  }
                >
                  <span className="share-channel-label">
                    {isCopied ? <Check size={20} /> : <Icon size={20} />}
                    <span>{isCopied ? 'Copiado' : channel.label}</span>
                  </span>
                  {!isMobile && (channel.webUrl || channel.androidIntent) && (
                    <ExternalLink size={14} className="share-channel-external" />
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
