import React, { useState, useEffect } from 'react';
import './UploadProgressCard.css';

const PHASE_LABELS = {
  converting: 'Convirtiendo a WebP...',
  uploading: 'Subiendo...',
};

function UploadCard({ job }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (job.done) {
      const t = setTimeout(() => setExiting(true), 2000);
      return () => clearTimeout(t);
    }
  }, [job.done]);

  return (
    <div className={`upload-card${exiting ? ' upload-card--exiting' : ''}`}>
      <div className="upload-card__header">
        <span className="upload-card__label">{job.label}</span>
        {job.done ? (
          <span className="upload-card__phase upload-card__phase--done">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                className="checkmark-path"
                d="M2 6l3 3 5-5"
                stroke="var(--color-success)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Listo
          </span>
        ) : (
          <span className="upload-card__phase">
            {PHASE_LABELS[job.phase] ?? ''}
          </span>
        )}
      </div>
      <div className="upload-card__track">
        <div
          className={`upload-card__bar${job.done ? ' upload-card__bar--done' : ''}`}
          style={{ width: `${job.percent}%` }}
        />
      </div>
    </div>
  );
}

export default function UploadProgressCard({ jobs }) {
  if (!jobs.length) return null;

  return (
    <div className="upload-progress-container">
      {jobs.map((job) => (
        <UploadCard key={job.id} job={job} />
      ))}
    </div>
  );
}
