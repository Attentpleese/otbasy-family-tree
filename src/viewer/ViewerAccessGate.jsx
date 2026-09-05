import { LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { viewerSupabase } from '../services/supabaseClient';
import { isViewerSession } from '../services/authRoles';
import {
  clearViewerSessionAccess,
  hasViewerSessionAccess,
  rememberViewerSessionAccess,
  signInViewer,
} from './viewerAccess';

export default function ViewerAccessGate({ onAccessGranted, onChangeLanguage }) {
  const { t, i18n } = useTranslation();
  const [password, setPassword] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function restoreViewerSession() {
      if (!hasViewerSessionAccess(window.sessionStorage)) return;
      const { data } = await viewerSupabase.auth.getSession();
      if (!isMounted) return;
      if (isViewerSession(data.session)) {
        onAccessGranted();
      } else {
        clearViewerSessionAccess(window.sessionStorage);
      }
    }

    restoreViewerSession();
    return () => { isMounted = false; };
  }, [onAccessGranted]);

  const submit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    const { session, error } = await signInViewer(password, viewerSupabase);
    if (error || !isViewerSession(session)) {
      setHasError(true);
      setIsSubmitting(false);
      return;
    }

    rememberViewerSessionAccess(window.sessionStorage);
    onAccessGranted();
    setIsSubmitting(false);
  };

  return (
    <main className="viewerAccessShell">
      <section className="viewerAccessPanel" aria-labelledby="viewer-access-title">
        <div className="viewerAccessLanguage languageSwitch" aria-label={t('language.label')}>
          {['ru', 'kz'].map((language) => (
            <button
              key={language}
              type="button"
              className={i18n.language === language ? 'active' : ''}
              onClick={() => onChangeLanguage(language)}
            >
              {language.toUpperCase()}
            </button>
          ))}
        </div>

        <span className="viewerAccessIcon" aria-hidden="true"><LockKeyhole size={24} /></span>
        <p className="eyebrow">{t('viewerAccess.kicker')}</p>
        <h1 id="viewer-access-title">{t('viewerAccess.title')}</h1>
        <p className="viewerAccessDescription">{t('viewerAccess.description')}</p>

        <form className="viewerAccessForm" onSubmit={submit} noValidate>
          <label htmlFor="viewer-password">{t('viewerAccess.passwordLabel')}</label>
          <input
            id="viewer-password"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={password}
            placeholder={t('viewerAccess.passwordPlaceholder')}
            onChange={(event) => {
              setPassword(event.target.value);
              if (hasError) setHasError(false);
            }}
            autoFocus
          />
          {hasError ? <p className="viewerAccessError" role="alert">{t('viewerAccess.error')}</p> : null}
          <button type="submit" className="primaryButton" disabled={isSubmitting}>
            {t('viewerAccess.submit')}
          </button>
        </form>
      </section>
    </main>
  );
}
