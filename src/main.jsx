import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LogIn, LogOut, Plus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './styles.css';
import './i18n';
import { supabase, hasSupabaseConfig } from './services/supabaseClient';
import {
  deletePerson,
  fetchFamilyGraph,
  restoreFamilyGraph,
  savePeople,
  savePerson,
  saveRelationship,
  saveRelationships,
} from './services/familyRepository';
import {
  createEmptyPerson,
  addParentPair,
  addSibling,
  getLifeYears,
  getPersonDisplayName,
  removePersonFromGraph,
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
  const [isUndoing, setIsUndoing] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const undoHistory = useRef([]);

  const selectedPerson = useMemo(() => people.find((person) => person.id === selectedId), [people, selectedId]);

  const graphErrors = useMemo(() => validateGraph(people, relationships), [people, relationships]);

  const rememberCurrentGraph = () => {
    undoHistory.current = [...undoHistory.current.slice(-49), { people, relationships, selectedId }];
  };

  const undoLastChange = async () => {
    const previous = undoHistory.current.at(-1);
    if (!previous || isUndoing) return;

    setIsUndoing(true);
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await restoreFamilyGraph(previous, { people, relationships });
      if (error) {
        setStatus(t('status.undoFailed'));
        setIsUndoing(false);
        return;
      }
    }

    undoHistory.current = undoHistory.current.slice(0, -1);
    setPeople(previous.people);
    setRelationships(previous.relationships);
    setSelectedId(previous.selectedId);
    setEditorRevision((current) => current + 1);
    setStatus(t('status.undone'));
    setIsUndoing(false);
  };

  useEffect(() => {
    const handleUndoShortcut = (event) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      const isEditingText = event.target instanceof HTMLElement
        && (event.target.matches('input, textarea') || event.target.isContentEditable);
      if (!isUndo || isEditingText) return;

      event.preventDefault();
      undoLastChange();
    };

    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [people, relationships, selectedId, session, isUndoing, t]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseConfig) {
        const { people: remotePeople, relationships: remoteRelationships, error } = await fetchFamilyGraph();
        if (isMounted && !error && remotePeople.length) {
          undoHistory.current = [];
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
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const result = await savePerson(person);
      const { error } = result;
      setStatus(error ? t('status.saveFailed') : t('status.saved'));
      if (error) return result;
      rememberCurrentGraph();
      setPeople((current) => current.map((item) => (item.id === person.id ? person : item)));
      return result;
    }
    rememberCurrentGraph();
    setPeople((current) => current.map((item) => (item.id === person.id ? person : item)));
    return { error: null };
  };

  const persistRelationship = async (relationship, nextPeople, nextRelationships) => {
    const existingIds = new Set(people.map((person) => person.id));
    const addedPeople = nextPeople.filter((person) => !existingIds.has(person.id));
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const personResults = await Promise.all(addedPeople.map(savePerson));
      const personError = personResults.find((result) => result.error)?.error;
      const { error: relationshipError } = personError ? { error: personError } : await saveRelationship(relationship);
      setStatus(personError || relationshipError ? t('status.saveFailed') : t('status.saved'));
      if (personError || relationshipError) return { error: personError || relationshipError };
    }
    rememberCurrentGraph();
    setPeople(nextPeople);
    setRelationships(nextRelationships);
    return { error: null };
  };

  const addRootPerson = async () => {
    const newPerson = createEmptyPerson({ firstName: t('defaults.newPerson'), gender: 'other' });
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await savePerson(newPerson);
      if (error) {
        setStatus(t('status.saveFailed'));
        return;
      }
    }
    rememberCurrentGraph();
    setPeople((current) => [...current, newPerson]);
    setSelectedId(newPerson.id);
    setStatus(t('status.saved'));
  };

  const persistDeletePerson = async (personId) => {
    const result = removePersonFromGraph(people, relationships, personId);
    if (!result.ok) return result;

    if (session && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await deletePerson(personId);
      if (error) {
        setStatus(t('status.deleteFailed'));
        return { ok: false, errors: [{ code: 'deleteFailed', cause: error }] };
      }
    }

    rememberCurrentGraph();
    setPeople(result.people);
    setRelationships(result.relationships);
    setSelectedId(null);
    setStatus(t('status.deleted'));
    return result;
  };

  const persistParentPair = async (childId) => {
    const result = addParentPair({
      people,
      relationships,
      childId,
      mother: createEmptyPerson({ firstName: t('defaults.newMother'), gender: 'female' }),
      father: createEmptyPerson({ firstName: t('defaults.newFather'), gender: 'male' }),
    });
    if (!result.ok) return result;

    if (session && hasSupabaseConfig && !isEditorPreview) {
      const peopleResult = await savePeople(result.peopleAdded);
      if (peopleResult.error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: peopleResult.error }] };
      }
      const relationshipsResult = await saveRelationships(result.relationshipsAdded);
      if (relationshipsResult.error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: relationshipsResult.error }] };
      }
    }

    rememberCurrentGraph();
    setPeople(result.people);
    setRelationships(result.relationships);
    setSelectedId(result.peopleAdded[0].id);
    setStatus(t('status.parentsAdded'));
    return result;
  };

  const persistSibling = async (personId, sibling) => {
    const result = addSibling({ people, relationships, personId, sibling });
    if (!result.ok) return result;

    if (session && hasSupabaseConfig && !isEditorPreview) {
      const personResult = await savePerson(result.personAdded);
      if (personResult.error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: personResult.error }] };
      }
      const relationshipsResult = await saveRelationships(result.relationshipsAdded);
      if (relationshipsResult.error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: relationshipsResult.error }] };
      }
    }

    rememberCurrentGraph();
    setPeople(result.people);
    setRelationships(result.relationships);
    setSelectedId(result.personAdded.id);
    setStatus(t('status.siblingAdded'));
    return result;
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
                {(selectedPerson
                  ? getPersonDisplayName(selectedPerson, t('person.unnamed'))
                  : t('person.noSelection')
                ).slice(0, 1)}
              </div>
            )}
            <h2>{selectedPerson ? getPersonDisplayName(selectedPerson, t('person.unnamed')) : t('person.noSelection')}</h2>
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
            onDeletePerson={persistDeletePerson}
            onAddParentPair={persistParentPair}
            onAddSibling={persistSibling}
            editorRevision={editorRevision}
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
