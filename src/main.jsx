import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, LoaderCircle, LogIn, LogOut, Plus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './styles.css';
import './i18n';
import { moveSibling } from './tree/familyUnits';
import { getFamilyScenario } from './tree/familyScenarios';
import { supabase, hasSupabaseConfig } from './services/supabaseClient';
import {
  deletePerson,
  fetchFamilyGraph,
  restoreFamilyGraph,
  saveFamilyGraphAdditions,
  savePeople,
  savePerson,
  saveRelationship,
  saveRelationships,
} from './services/familyRepository';
import {
  createEmptyPerson,
  addPersonWithRelationship,
  addChildToExistingCouple,
  addChildWithNewPartner,
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
const previewParams = new URLSearchParams(window.location.search);
const previewScenario = import.meta.env.DEV ? getFamilyScenario(previewParams.get('scenario')) : null;
const isEditorPreview = import.meta.env.DEV && (previewParams.has('editorPreview') || Boolean(previewScenario));
const isPublicPreview = import.meta.env.DEV && previewParams.has('publicPreview');
const isLoadingPreview = import.meta.env.DEV && previewParams.has('loadingPreview');
const isFallbackPreview = import.meta.env.DEV && previewParams.has('fallbackPreview');

const LOAD_STATE = {
  loading: 'loading',
  ready: 'ready',
  fallback: 'fallback',
};

function App() {
  const { t, i18n } = useTranslation();
  const [people, setPeople] = useState(previewScenario?.people || []);
  const [relationships, setRelationships] = useState(previewScenario?.relationships || []);
  const [selectedId, setSelectedId] = useState(previewScenario?.selectedId || null);
  const [session, setSession] = useState(isEditorPreview ? { user: { id: 'local-preview' } } : null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [loadState, setLoadState] = useState(previewScenario ? LOAD_STATE.ready : LOAD_STATE.loading);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [isMovingSibling, setIsMovingSibling] = useState(false);
  const orderSaving = useRef(false);
  const undoHistory = useRef([]);

  const selectedPerson = useMemo(() => people.find((person) => person.id === selectedId), [people, selectedId]);

  const graphErrors = useMemo(() => validateGraph(people, relationships), [people, relationships]);

  const rememberCurrentGraph = () => {
    undoHistory.current = [...undoHistory.current.slice(-19), { people, relationships, selectedId }];
    setUndoCount(undoHistory.current.length);
  };

  const undoLastChange = async () => {
    const previous = undoHistory.current.at(-1);
    if (!previous || isUndoing || orderSaving.current) return;

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
    setUndoCount(undoHistory.current.length);
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
      if (previewScenario) {
        return;
      }

      if (isLoadingPreview) return;

      let nextLoadState = LOAD_STATE.ready;
      let nextPeople = [];
      let nextRelationships = [];

      try {
        if (isFallbackPreview) throw new Error('Fallback preview');
        if (!hasSupabaseConfig) throw new Error('Supabase is not configured');

        const graph = await fetchFamilyGraph();
        if (graph.error) throw graph.error;
        nextPeople = graph.people;
        nextRelationships = graph.relationships;
      } catch {
        nextLoadState = LOAD_STATE.fallback;
        nextPeople = samplePeople;
        nextRelationships = sampleRelationships;
      }

      if (isMounted) {
        if (nextLoadState === LOAD_STATE.ready) {
          undoHistory.current = [];
          setUndoCount(0);
        }
        setPeople(nextPeople);
        setRelationships(nextRelationships);
        setSelectedId(null);
      }

      let authSession = null;
      try {
        const { data } = await supabase.auth.getSession();
        authSession = data.session;
      } catch {
        authSession = null;
      }

      if (isMounted) {
        if (!isEditorPreview && !isPublicPreview) setSession(authSession);
        if (isPublicPreview) setSession(null);
        setLoadState(nextLoadState);
      }
    }

    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isEditorPreview && !isPublicPreview) setSession(nextSession);
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

  const persistAtomicAdditions = async (result, successStatus) => {
    if (!result.ok) return result;
    if (session && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await saveFamilyGraphAdditions(result.peopleAdded, result.relationshipsAdded);
      setStatus(error ? t('status.saveFailed') : successStatus);
      if (error) return { ok: false, errors: [{ code: 'saveFailed', cause: error }] };
    }

    rememberCurrentGraph();
    setPeople(result.people);
    setRelationships(result.relationships);
    setSelectedId(result.childAdded.id);
    setStatus(successStatus);
    return result;
  };

  const persistChildToExistingCouple = async (selectedId, partnerId, child) =>
    persistAtomicAdditions(
      addChildToExistingCouple({ people, relationships, selectedId, partnerId, person: child }),
      t('status.childAdded'),
    );

  const persistSingleParentChild = async (selectedId, child) => {
    const result = addPersonWithRelationship({
      people,
      relationships,
      selectedId,
      relationType: 'child',
      person: child,
    });
    const atomicResult = result.ok
      ? {
          ...result,
          childAdded: child,
          peopleAdded: [child],
          relationshipsAdded: [result.relationship],
        }
      : result;
    return persistAtomicAdditions(atomicResult, t('status.childAdded'));
  };

  const persistChildWithNewPartner = async (selectedId, newPartner, child) =>
    persistAtomicAdditions(
      addChildWithNewPartner({ people, relationships, selectedId, newPartner, child }),
      t('status.childAndPartnerAdded'),
    );

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

  const persistSiblingOrder = async (personId, direction) => {
    if (!session || orderSaving.current || isUndoing) return { ok: false };
    const result = moveSibling(people, relationships, personId, direction);
    if (!result) return { ok: false };
    orderSaving.current = true;
    setIsMovingSibling(true);
    try {
      if (hasSupabaseConfig && !isEditorPreview) {
        const { error } = await savePeople(result.changedPeople);
        if (error) throw error;
      }
      rememberCurrentGraph();
      setPeople(result.people);
      setStatus(t('status.saved'));
      return { ok: true };
    } catch {
      setStatus(t('status.saveFailed'));
      return { ok: false };
    } finally {
      orderSaving.current = false;
      setIsMovingSibling(false);
    }
  };

  const signOut = async () => {
    if (!isEditorPreview) await supabase.auth.signOut();
    setSession(null);
  };

  if (loadState === LOAD_STATE.loading) {
    return (
      <main className="initialLoadingShell">
        <section className="initialLoadingPanel" role="status" aria-live="polite">
          <span className="loadingBrandMark" aria-hidden="true"><UserRound size={22} /></span>
          <p className="eyebrow">{t('app.kicker')}</p>
          <h1>{t('app.title')}</h1>
          <LoaderCircle className="loadingSpinner" size={34} aria-hidden="true" />
          <p className="initialLoadingText">{t('loading.tree')}</p>
          <p className="initialLoadingHint">{t('loading.connecting')}</p>
          <div className="treeSkeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

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
          {!session ? <p className="publicModeNote">{t('helper.publicMode')}</p> : null}
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

      {loadState === LOAD_STATE.fallback ? (
        <div className="demoFallbackBanner" role="alert">
          <AlertTriangle size={22} aria-hidden="true" />
          <div>
            <strong>{t('fallback.title')}</strong>
            <p>{t('fallback.description')}</p>
          </div>
        </div>
      ) : null}

      <section className="workSurface">
        <aside className="sidePanel">
          <p className="eyebrow">{t('person.selected')}</p>
          <div className="selectedPerson">
            {selectedPerson ? (
              <>
                {selectedPerson.photoUrl ? (
                  <img src={selectedPerson.photoUrl} alt="" loading="lazy" />
                ) : (
                  <div className="avatarPlaceholder">
                    {getPersonDisplayName(selectedPerson, t('person.unnamed')).slice(0, 1)}
                  </div>
                )}
                <h2>{getPersonDisplayName(selectedPerson, t('person.unnamed'))}</h2>
                <p>{getLifeYears(selectedPerson) || t('person.yearsUnknown')}</p>
                {selectedPerson.birthPlace ? (
                  <p className="selectedPersonMetadata">
                    <strong>{t('fields.birthPlace')}:</strong> {selectedPerson.birthPlace}
                  </p>
                ) : null}
                {selectedPerson.clan ? (
                  <p className="selectedPersonMetadata" title={t('fields.clanHint')}>
                    <strong>{t('fields.clan')}:</strong> {selectedPerson.clan}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="selectedPersonEmpty">
                <div className="avatarPlaceholder"><UserRound size={34} aria-hidden="true" /></div>
                <h2>{t('person.noSelection')}</h2>
                <p>{t('person.selectionHint')}</p>
              </div>
            )}
          </div>
          {session ? (
            <>
              <button type="button" className="secondaryButton" onClick={addRootPerson} disabled={isMovingSibling}>
                <Plus size={17} />
                {t('actions.addPerson')}
              </button>
              <p className="helperText">{t('helper.editorReady')}</p>
            </>
          ) : null}
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
            onAddChildToExistingCouple={persistChildToExistingCouple}
            onAddChildWithNewPartner={persistChildWithNewPartner}
            onAddSingleParentChild={persistSingleParentChild}
            onMoveSibling={persistSiblingOrder}
            isMovingSibling={isMovingSibling}
            onUndo={undoLastChange}
            canUndo={undoCount > 0}
            isUndoing={isUndoing || isMovingSibling}
            editorRevision={editorRevision}
          />
        </Suspense>
      ) : null}

      {isLoginOpen ? (
        <Suspense fallback={null}>
          <LoginModal isLoading={loadState === LOAD_STATE.loading} onClose={() => setIsLoginOpen(false)} onSuccess={() => setIsLoginOpen(false)} />
        </Suspense>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
