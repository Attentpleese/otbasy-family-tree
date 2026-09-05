import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, LoaderCircle, LogIn, LogOut, Plus, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './styles.css';
import './i18n';
import { getFamilyScenario } from './tree/familyScenarios';
import { supabase, viewerSupabase, hasSupabaseConfig } from './services/supabaseClient';
import { isEditorSession } from './services/authRoles';
import {
  deletePerson,
  fetchFamilyGraph,
  restoreFamilyGraph,
  saveFamilyGraphAdditions,
  savePeople,
  savePerson,
  saveRelationship,
} from './services/familyRepository';
import {
  createEmptyPerson,
  addPersonWithRelationship,
  addChildToExistingCouple,
  addChildWithNewPartner,
  addParentPair,
  addSibling,
  getLifeYears,
  getParents,
  getPersonDisplayName,
  removePersonFromGraph,
  samplePeople,
  sampleRelationships,
  validateGraph,
} from './domain/familyGraph';
import { getChangedPatronymicPeople, regeneratePatronymics } from './domain/patronymics';
import { commitFreeXGroupMove } from './tree/freeXDrag';
import ViewerAccessGate from './viewer/ViewerAccessGate';

const FamilyChartView = lazy(() => import('./tree/FamilyChartView'));
const EditorShell = lazy(() => import('./editor/EditorShell'));
const LoginModal = lazy(() => import('./editor/LoginModal'));
const previewParams = new URLSearchParams(window.location.search);
const previewScenario = import.meta.env.DEV ? getFamilyScenario(previewParams.get('scenario')) : null;
const isEditorPreview = import.meta.env.DEV && (previewParams.has('editorPreview') || Boolean(previewScenario));
const isPublicPreview = import.meta.env.DEV && previewParams.has('publicPreview');
const isLoadingPreview = import.meta.env.DEV && previewParams.has('loadingPreview');
const isFallbackPreview = import.meta.env.DEV && previewParams.has('fallbackPreview');
const bypassViewerAccess = import.meta.env.DEV && (
  Boolean(previewScenario) || isPublicPreview || isLoadingPreview || isFallbackPreview
);

const LOAD_STATE = {
  loading: 'loading',
  ready: 'ready',
  fallback: 'fallback',
};

function App() {
  const { t, i18n } = useTranslation();
  const [hasViewerAccess, setHasViewerAccess] = useState(bypassViewerAccess);
  const [people, setPeople] = useState(previewScenario?.people || []);
  const [relationships, setRelationships] = useState(previewScenario?.relationships || []);
  const [selectedId, setSelectedId] = useState(previewScenario?.selectedId || null);
  const [editorSession, setEditorSession] = useState(
    isEditorPreview ? { user: { id: 'local-preview', app_metadata: { app_role: 'editor' } } } : null,
  );
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [loadState, setLoadState] = useState(previewScenario ? LOAD_STATE.ready : LOAD_STATE.loading);
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const undoHistory = useRef([]);
  const isEditor = isEditorPreview || isEditorSession(editorSession);

  const selectedPerson = useMemo(() => people.find((person) => person.id === selectedId), [people, selectedId]);

  const graphErrors = useMemo(() => validateGraph(people, relationships), [people, relationships]);

  const getFreeXPlacementContext = async () => {
    const [layoutModule, placement] = await Promise.all([
      import('./tree/freeXLayout'),
      import('./tree/initialFreeXPlacement'),
    ]);
    return {
      layout: layoutModule.buildFreeXTreeLayout(people, relationships),
      placement,
    };
  };

  const rememberCurrentGraph = () => {
    undoHistory.current = [...undoHistory.current.slice(-19), { people, relationships, selectedId }];
    setUndoCount(undoHistory.current.length);
  };

  const undoLastChange = async () => {
    const previous = undoHistory.current.at(-1);
    if (!previous || isUndoing) return;

    setIsUndoing(true);
    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
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
  }, [people, relationships, selectedId, isEditor, isUndoing, t]);

  useEffect(() => {
    if (!hasViewerAccess) return undefined;
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

        const graph = await fetchFamilyGraph(viewerSupabase);
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
        if (!isEditorPreview && !isPublicPreview) setEditorSession(authSession);
        if (isPublicPreview) setEditorSession(null);
        setLoadState(nextLoadState);
      }
    }

    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isEditorPreview && !isPublicPreview) setEditorSession(nextSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [hasViewerAccess, t]);

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
    localStorage.setItem('familyTreeLanguage', language);
  };

  if (!hasViewerAccess) {
    return (
      <ViewerAccessGate
        onAccessGranted={() => setHasViewerAccess(true)}
        onChangeLanguage={changeLanguage}
      />
    );
  }

  const persistPerson = async (person) => {
    const editedPeople = people.map((item) => (item.id === person.id ? person : item));
    const preparedPeople = regeneratePatronymics(editedPeople, relationships);
    const changedPatronymics = getChangedPatronymicPeople(editedPeople, preparedPeople);
    const peopleToSaveIds = new Set([person.id, ...changedPatronymics.map(({ id }) => id)]);
    const peopleToSave = preparedPeople.filter(({ id }) => peopleToSaveIds.has(id));
    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
      const result = await savePeople(peopleToSave);
      const { error } = result;
      setStatus(error ? t('status.saveFailed') : t('status.saved'));
      if (error) return result;
      rememberCurrentGraph();
      setPeople(preparedPeople);
      return result;
    }
    rememberCurrentGraph();
    setPeople(preparedPeople);
    return { error: null };
  };

  const persistRelationship = async (relationship, nextPeople, nextRelationships) => {
    const existingIds = new Set(people.map((person) => person.id));
    let preparedPeople = nextPeople;
    const placementContext = await getFreeXPlacementContext();
    if (placementContext) {
      const addedIds = new Set(nextPeople.filter((person) => !existingIds.has(person.id)).map(({ id }) => id));
      preparedPeople = nextPeople.map((person) => {
        if (!addedIds.has(person.id)) return person;
        let layoutX;
        if (['spouse', 'partner'].includes(relationship.type)) {
          const selectedId = relationship.personAId === person.id
            ? relationship.personBId
            : relationship.personAId;
          layoutX = placementContext.placement.getInitialSpouseX(placementContext.layout, selectedId);
        } else if (relationship.type === 'parent-child' && relationship.parentId === person.id) {
          layoutX = placementContext.placement.getInitialParentX(
            placementContext.layout,
            relationship.childId,
            getParents(relationships, relationship.childId),
          );
        } else if (relationship.type === 'parent-child') {
          layoutX = placementContext.placement.getInitialChildX(
            placementContext.layout,
            [relationship.parentId],
          );
        }
        return Number.isFinite(layoutX) ? { ...person, layoutX } : person;
      });
    }
    preparedPeople = regeneratePatronymics(preparedPeople, nextRelationships);
    const addedPeople = preparedPeople.filter((person) => !existingIds.has(person.id));
    const changedExistingPeople = getChangedPatronymicPeople(people, preparedPeople)
      .filter((person) => existingIds.has(person.id));
    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
      const { error } = addedPeople.length
        ? await saveFamilyGraphAdditions(addedPeople, [relationship])
        : await saveRelationship(relationship);
      setStatus(error ? t('status.saveFailed') : t('status.saved'));
      if (error) return { error };
      if (changedExistingPeople.length) {
        const updateResult = await savePeople(changedExistingPeople);
        if (updateResult.error) {
          setStatus(t('status.saveFailed'));
          return updateResult;
        }
      }
    }
    rememberCurrentGraph();
    setPeople(preparedPeople);
    setRelationships(nextRelationships);
    return { error: null };
  };

  const persistAtomicAdditions = async (result, successStatus) => {
    if (!result.ok) return result;
    const preparedPeople = regeneratePatronymics(result.people, result.relationships);
    const addedIds = new Set(result.peopleAdded.map(({ id }) => id));
    const preparedAddedPeople = preparedPeople.filter(({ id }) => addedIds.has(id));
    const changedExistingPeople = getChangedPatronymicPeople(people, preparedPeople)
      .filter(({ id }) => !addedIds.has(id));
    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await saveFamilyGraphAdditions(preparedAddedPeople, result.relationshipsAdded);
      setStatus(error ? t('status.saveFailed') : successStatus);
      if (error) return { ok: false, errors: [{ code: 'saveFailed', cause: error }] };
      if (changedExistingPeople.length) {
        const updateResult = await savePeople(changedExistingPeople);
        if (updateResult.error) {
          setStatus(t('status.saveFailed'));
          return { ok: false, errors: [{ code: 'saveFailed', cause: updateResult.error }] };
        }
      }
    }

    rememberCurrentGraph();
    setPeople(preparedPeople);
    setRelationships(result.relationships);
    setSelectedId(result.childAdded.id);
    setStatus(successStatus);
    return result;
  };

  const persistChildToExistingCouple = async (selectedId, partnerId, child) => {
    const placementContext = await getFreeXPlacementContext();
    const positionedChild = placementContext ? {
      ...child,
      layoutX: placementContext.placement.getInitialChildX(
        placementContext.layout,
        [selectedId, partnerId],
      ),
    } : child;
    return persistAtomicAdditions(
      addChildToExistingCouple({
        people,
        relationships,
        selectedId,
        partnerId,
        person: positionedChild,
      }),
      t('status.childAdded'),
    );
  };

  const persistSingleParentChild = async (selectedId, child) => {
    const placementContext = await getFreeXPlacementContext();
    const positionedChild = placementContext ? {
      ...child,
      layoutX: placementContext.placement.getInitialChildX(placementContext.layout, [selectedId]),
    } : child;
    const result = addPersonWithRelationship({
      people,
      relationships,
      selectedId,
      relationType: 'child',
      person: positionedChild,
    });
    const atomicResult = result.ok
      ? {
          ...result,
          childAdded: positionedChild,
          peopleAdded: [positionedChild],
          relationshipsAdded: [result.relationship],
        }
      : result;
    return persistAtomicAdditions(atomicResult, t('status.childAdded'));
  };

  const persistChildWithNewPartner = async (selectedId, newPartner, child) => {
    const placementContext = await getFreeXPlacementContext();
    let positionedPartner = newPartner;
    let positionedChild = child;
    if (placementContext) {
      const initial = placementContext.placement.getInitialNewPartnerAndChildX(
        placementContext.layout,
        selectedId,
      );
      positionedPartner = { ...newPartner, layoutX: initial.partnerX };
      positionedChild = { ...child, layoutX: initial.childX };
    }
    return persistAtomicAdditions(
      addChildWithNewPartner({
        people,
        relationships,
        selectedId,
        newPartner: positionedPartner,
        child: positionedChild,
      }),
      t('status.childAndPartnerAdded'),
    );
  };

  const addRootPerson = async () => {
    const placementContext = await getFreeXPlacementContext();
    const newPerson = createEmptyPerson({
      firstName: t('defaults.newPerson'),
      gender: 'other',
      layoutX: placementContext
        ? placementContext.placement.getInitialIndependentX(placementContext.layout)
        : null,
    });
    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
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

    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
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
    const placementContext = await getFreeXPlacementContext();
    const parentPositions = placementContext
      ? placementContext.placement.getInitialParentPairX(placementContext.layout, childId)
      : {};
    const result = addParentPair({
      people,
      relationships,
      childId,
      mother: createEmptyPerson({
        firstName: t('defaults.newMother'),
        gender: 'female',
        layoutX: parentPositions.motherX ?? null,
      }),
      father: createEmptyPerson({
        firstName: t('defaults.newFather'),
        gender: 'male',
        layoutX: parentPositions.fatherX ?? null,
      }),
    });
    if (!result.ok) return result;

    const preparedPeople = regeneratePatronymics(result.people, result.relationships);
    const changedExistingPeople = getChangedPatronymicPeople(people, preparedPeople)
      .filter(({ id }) => !result.peopleAdded.some((added) => added.id === id));

    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await saveFamilyGraphAdditions(result.peopleAdded, result.relationshipsAdded);
      if (error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: error }] };
      }
      if (changedExistingPeople.length) {
        const updateResult = await savePeople(changedExistingPeople);
        if (updateResult.error) {
          setStatus(t('status.saveFailed'));
          return { ok: false, errors: [{ code: 'saveFailed', cause: updateResult.error }] };
        }
      }
    }

    rememberCurrentGraph();
    setPeople(preparedPeople);
    setRelationships(result.relationships);
    setSelectedId(result.peopleAdded[0].id);
    setStatus(t('status.parentsAdded'));
    return result;
  };

  const persistSibling = async (personId, sibling) => {
    const placementContext = await getFreeXPlacementContext();
    const positionedSibling = placementContext ? {
      ...sibling,
      layoutX: placementContext.placement.getInitialSiblingX(placementContext.layout, personId),
    } : sibling;
    const result = addSibling({ people, relationships, personId, sibling: positionedSibling });
    if (!result.ok) return result;

    const preparedPeople = regeneratePatronymics(result.people, result.relationships);
    const preparedSibling = preparedPeople.find(({ id }) => id === result.personAdded.id);

    if (isEditor && hasSupabaseConfig && !isEditorPreview) {
      const { error } = await saveFamilyGraphAdditions([preparedSibling], result.relationshipsAdded);
      if (error) {
        setStatus(t('status.saveFailed'));
        return { ok: false, errors: [{ code: 'saveFailed', cause: error }] };
      }
    }

    rememberCurrentGraph();
    setPeople(preparedPeople);
    setRelationships(result.relationships);
    setSelectedId(result.personAdded.id);
    setStatus(t('status.siblingAdded'));
    return result;
  };

  const persistPersonLayoutXs = async (xByPerson) => {
    const result = await commitFreeXGroupMove({
      people,
      xByPerson,
      persistChangedPeople: isEditor && hasSupabaseConfig && !isEditorPreview
        ? savePeople
        : null,
      rememberCurrentGraph,
      applyPeople: setPeople,
    });
    setStatus(result.error ? t('status.saveFailed') : t('status.saved'));
    return { error: result.error };
  };

  const signOut = async () => {
    if (!isEditorPreview) await supabase.auth.signOut();
    setEditorSession(null);
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
          {!isEditor ? <p className="publicModeNote">{t('helper.publicMode')}</p> : null}
          {isEditor ? (
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
                <p>{getLifeYears(selectedPerson, { full: true }) || t('person.yearsUnknown')}</p>
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
          {isEditor ? (
            <>
              <button type="button" className="secondaryButton" onClick={addRootPerson}>
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
              onCommitPersonLayoutXs={isEditor ? persistPersonLayoutXs : undefined}
            />
          </Suspense>
        </section>
      </section>

      {isEditor ? (
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
            onUndo={undoLastChange}
            canUndo={undoCount > 0}
            isUndoing={isUndoing}
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
