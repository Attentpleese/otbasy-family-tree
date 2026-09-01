import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LogIn, LogOut, Plus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './styles.css';
import './i18n';
import { supabase, hasSupabaseConfig } from './services/supabaseClient';
import { fetchFamilyGraph, savePerson, saveRelationship } from './services/familyRepository';
import {
  createEmptyPerson,
  getLifeYears,
  getPersonName,
  samplePeople,
  sampleRelationships,
  validateGraph,
} from './domain/familyGraph';

const FamilyChartView = lazy(() => import('./tree/FamilyChartView'));
const EditorShell = lazy(() => import('./editor/EditorShell'));
const LoginModal = lazy(() => import('./editor/LoginModal'));
const isEditorPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('editorPreview');

function App() {
  const { t, i18n } = useTranslation();
  const [people, setPeople] = useState(samplePeople);
  const [relationships, setRelationships] = useState(sampleRelationships);
  const [selectedId, setSelectedId] = useState(samplePeople[2].id);
  const [session, setSession] = useState(isEditorPreview ? { user: { id: 'local-preview' } } : null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedId) || people[0],
    [people, selectedId],
  );

  const graphErrors = useMemo(() => validateGraph(people, relationships), [people, relationships]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseConfig) {
        const { people: remotePeople, relationships: remoteRelationships, error } = await fetchFamilyGraph();
        if (isMounted && !error && remotePeople.length) {
          setPeople(remotePeople);
          setRelationships(remoteRelationships);
          setSelectedId(remotePeople[0].id);
        }
        if (isMounted && error) setStatus(t('status.demoMode'));
      } else if (isMounted) {
        setStatus(t('status.demoMode'));
      }

      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        if (!isEditorPreview) setSession(data.session);
        setIsLoading(false);
      }
    }

    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isEditorPreview) setSession(nextSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [t]);

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
    localStorage.setItem('familyTreeLanguage', language);
  };

  const persistPerson = async (person) => {
    setPeople((current) => current.map((item) => (item.id === person.id ? person : item)));
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const result = await savePerson(person);
      const { error } = result;
      setStatus(error ? t('status.saveFailed') : t('status.saved'));
      return result;
    }
    return { error: null };
  };

  const persistRelationship = async (relationship, nextPeople, nextRelationships) => {
    const existingIds = new Set(people.map((person) => person.id));
    const addedPeople = nextPeople.filter((person) => !existingIds.has(person.id));
    setPeople(nextPeople);
    setRelationships(nextRelationships);
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const personResults = await Promise.all(addedPeople.map(savePerson));
      const personError = personResults.find((result) => result.error)?.error;
      const { error: relationshipError } = personError ? { error: personError } : await saveRelationship(relationship);
      setStatus(personError || relationshipError ? t('status.saveFailed') : t('status.saved'));
    }
  };

  const addRootPerson = () => {
    const newPerson = createEmptyPerson({ firstName: t('defaults.newPerson'), gender: 'other' });
    setPeople((current) => [...current, newPerson]);
    setSelectedId(newPerson.id);
    persistPerson(newPerson);
  };

  const signOut = async () => {
    if (!isEditorPreview) await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">
            <UserRound size={18} />
          </span>
          <div>
            <p>{t('app.kicker')}</p>
            <h1>{t('app.title')}</h1>
          </div>
        </div>

        <div className="topActions">
          <div className="languageSwitch" aria-label={t('language.label')}>
            {['ru', 'kz'].map((language) => (
              <button
                key={language}
                type="button"
                className={i18n.language === language ? 'active' : ''}
                onClick={() => changeLanguage(language)}
              >
                {language.toUpperCase()}
              </button>
            ))}
          </div>
          {session ? (
            <button type="button" className="ghostButton" onClick={signOut}>
              <LogOut size={17} />
              {t('auth.signOut')}
            </button>
          ) : (
            <button type="button" className="primaryButton" onClick={() => setIsLoginOpen(true)}>
              <LogIn size={17} />
              {t('auth.editorLogin')}
            </button>
          )}
        </div>
      </header>

      <section className="workSurface">
        <aside className="sidePanel">
          <p className="eyebrow">{t('person.selected')}</p>
          <div className="selectedPerson">
            {selectedPerson?.photoUrl ? (
              <img src={selectedPerson.photoUrl} alt="" loading="lazy" />
            ) : (
              <div className="avatarPlaceholder">
                {(getPersonName(selectedPerson || {}) || t('person.noSelection')).slice(0, 1)}
              </div>
            )}
            <h2>{selectedPerson ? getPersonName(selectedPerson) || t('person.noSelection') : t('person.noSelection')}</h2>
            <p>{selectedPerson ? getLifeYears(selectedPerson) || t('person.yearsUnknown') : ''}</p>
          </div>
          <button type="button" className="secondaryButton" onClick={addRootPerson} disabled={!session}>
            <Plus size={17} />
            {t('actions.addPerson')}
          </button>
          <p className="helperText">{session ? t('helper.editorReady') : t('helper.publicMode')}</p>
          {status ? <p className="statusLine">{status}</p> : null}
          {graphErrors.length ? <p className="errorLine">{t('errors.graphHasIssues')}</p> : null}
        </aside>

        <section className="treeStage" aria-label={t('tree.ariaLabel')}>
          <Suspense fallback={<div className="loadingState">{t('loading.tree')}</div>}>
            <FamilyChartView
              people={people}
              relationships={relationships}
              selectedId={selectedId}
              onSelectPerson={setSelectedId}
            />
          </Suspense>
        </section>
      </section>

      {session ? (
        <Suspense fallback={null}>
          <EditorShell
            people={people}
            relationships={relationships}
            selectedId={selectedId}
            onSelectPerson={setSelectedId}
            onSavePerson={persistPerson}
            onSaveRelationship={persistRelationship}
          />
        </Suspense>
      ) : null}

      {isLoginOpen ? (
        <Suspense fallback={null}>
          <LoginModal isLoading={isLoading} onClose={() => setIsLoginOpen(false)} onSuccess={() => setIsLoginOpen(false)} />
        </Suspense>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
