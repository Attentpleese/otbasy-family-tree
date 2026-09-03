import { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, Users, UsersRound, Baby, X, PanelRightClose, PanelRightOpen, Trash2, Undo2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient';
import { addPersonWithRelationship, createEmptyPerson, getPersonDisplayName, upsertRelationship } from '../domain/familyGraph';
import PhotoEditor from './PhotoEditor';
import { getChildCreationOptions } from './childCreation';
import { mergePersonDraft } from './personDraft';
import { getSiblingFamily } from '../tree/familyUnits';

function DeletePersonModal({ person, onCancel, onConfirm, isDeleting, error }) {
  const { t } = useTranslation();
  const name = getPersonDisplayName(person, t('person.unnamed'));

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="confirmModal" role="dialog" aria-modal="true" aria-labelledby="delete-person-title">
        <div className="confirmModalIcon" aria-hidden="true"><Trash2 size={22} /></div>
        <h2 id="delete-person-title">{t('deletePerson.title', { name })}</h2>
        <p>{t('deletePerson.warning')}</p>
        {error ? <p className="errorLine">{error}</p> : null}
        <div className="confirmModalActions">
          <button type="button" className="ghostButton" onClick={onCancel}>{t('actions.cancel')}</button>
          <button type="button" className="dangerSolidButton" onClick={onConfirm} disabled={isDeleting}>
            <Trash2 size={17} />
            {isDeleting ? t('deletePerson.deleting') : t('deletePerson.confirm')}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ChildOptionsModal({ options, onCancel, onSelect }) {
  const { t } = useTranslation();

  return (
    <div className="modalBackdrop" role="presentation">
      <section className="confirmModal childOptionsModal" role="dialog" aria-modal="true" aria-labelledby="child-options-title">
        <div className="childOptionsIcon" aria-hidden="true"><Baby size={22} /></div>
        <h2 id="child-options-title">{t('childDialog.title')}</h2>
        <p>{t('childDialog.description')}</p>
        <div className="childOptionList">
          {options.map((option) => {
            const label = option.type === 'existing'
              ? t('childDialog.withPartner', { name: getPersonDisplayName(option.partner, t('person.unnamed')) })
              : t(option.type === 'single' ? 'childDialog.withoutPartner' : 'childDialog.withNewPartner');
            return (
              <button
                key={option.type === 'existing' ? `${option.type}:${option.partnerId}` : option.type}
                type="button"
                className="secondaryButton childOptionButton"
                onClick={() => onSelect(option)}
              >
                <Users size={17} />
                {label}
              </button>
            );
          })}
        </div>
        <div className="confirmModalActions">
          <button type="button" className="ghostButton" onClick={onCancel}>{t('actions.cancel')}</button>
        </div>
      </section>
    </div>
  );
}

const fieldNames = ['firstName', 'lastName', 'patronymic', 'birthDate', 'deathDate', 'birthPlace', 'clan', 'notes'];

function PersonForm({ person, onSave }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(person);
  const [activeTab, setActiveTab] = useState('details');
  const [nameError, setNameError] = useState('');

  const updateField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === 'firstName' && value.trim()) setNameError('');
  };

  return (
    <div className="personEditorTabs">
      <div className="editorTabs" role="tablist" aria-label={t('editor.sections')}>
        <button type="button" role="tab" aria-selected={activeTab === 'details'} onClick={() => setActiveTab('details')}>
          {t('editor.detailsTab')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'photo'} onClick={() => setActiveTab('photo')}>
          {t('editor.photoTab')}
        </button>
      </div>

      {activeTab === 'photo' ? <PhotoEditor person={person} onSave={onSave} /> : (
        <form
          className="editorForm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.firstName.trim()) {
              setNameError(t('validation.missingFirstName'));
              return;
            }
            onSave(mergePersonDraft({ ...draft, firstName: draft.firstName.trim() }, person));
          }}
          noValidate
        >
      <label>
        {t('fields.gender')}
        <select value={draft.gender} onChange={(event) => updateField('gender', event.target.value)}>
          <option value="male">{t('gender.male')}</option>
          <option value="female">{t('gender.female')}</option>
          <option value="other">{t('gender.other')}</option>
        </select>
      </label>

      {fieldNames.map((field) => (
        <label key={field} title={field === 'clan' ? t('fields.clanHint') : undefined}>
          {t(`fields.${field}`)}
          {field === 'notes' ? (
            <textarea value={draft[field] || ''} onChange={(event) => updateField(field, event.target.value)} />
          ) : (
            <input
              type={field.includes('Date') ? 'date' : 'text'}
              value={draft[field] || ''}
              onChange={(event) => updateField(field, event.target.value)}
              required={field === 'firstName'}
              aria-invalid={field === 'firstName' && Boolean(nameError)}
              aria-describedby={field === 'firstName' && nameError ? 'person-first-name-error' : undefined}
              title={field === 'clan' ? t('fields.clanHint') : undefined}
            />
          )}
          {field === 'firstName' && nameError ? (
            <span id="person-first-name-error" className="fieldError">{nameError}</span>
          ) : null}
        </label>
      ))}

          <button type="submit" className="primaryButton">
            {t('actions.save')}
          </button>
        </form>
      )}
    </div>
  );
}

function AddRelativeForm({
  relationType,
  selectedId,
  people,
  relationships,
  childMode,
  onSaveRelationship,
  onAddSibling,
  onAddChildToExistingCouple,
  onAddSingleParentChild,
  onSelectPerson,
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(createEmptyPerson({ firstName: '', gender: 'other' }));
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  const createRelative = async (event) => {
    event.preventDefault();
    if (!draft.firstName.trim()) {
      setNameError(t('validation.missingFirstName'));
      return;
    }
    const person = { ...draft, firstName: draft.firstName.trim() };
    if (relationType === 'sibling') {
      const siblingResult = await onAddSibling(selectedId, person);
      if (!siblingResult.ok) {
        setError(t(`validation.${siblingResult.errors[0].code}`));
        return;
      }
      return;
    }

    if (relationType === 'child' && childMode?.type === 'existing') {
      const childResult = await onAddChildToExistingCouple(selectedId, childMode.partnerId, person);
      if (!childResult.ok) setError(t(`validation.${childResult.errors[0].code}`));
      return;
    }

    if (relationType === 'child' && childMode?.type === 'single') {
      const childResult = await onAddSingleParentChild(selectedId, person);
      if (!childResult.ok) setError(t(`validation.${childResult.errors[0].code}`));
      return;
    }

    const result = addPersonWithRelationship({ people, relationships, selectedId, relationType, person });

    if (!result.ok) {
      setError(t(`validation.${result.errors[0].code}`));
      return;
    }

    const saveResult = await onSaveRelationship(result.relationship, result.people, result.relationships);
    if (saveResult?.error) {
      setError(t('validation.saveFailed'));
      return;
    }
    onSelectPerson(draft.id);
    setDraft(createEmptyPerson({ firstName: '', gender: 'other' }));
    setError('');
    setNameError('');
  };

  return (
    <form className="compactAddForm" onSubmit={createRelative} noValidate>
      <input
        aria-label={t('fields.firstName')}
        placeholder={t('fields.firstName')}
        value={draft.firstName}
        onChange={(event) => {
          setDraft((current) => ({ ...current, firstName: event.target.value }));
          if (event.target.value.trim()) setNameError('');
        }}
        required
        aria-invalid={Boolean(nameError)}
        aria-describedby={nameError ? 'relative-first-name-error' : undefined}
      />
      {nameError ? <span id="relative-first-name-error" className="fieldError">{nameError}</span> : null}
      <input
        aria-label={t('fields.lastName')}
        placeholder={t('fields.lastName')}
        value={draft.lastName}
        onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
      />
      <select
        aria-label={t('fields.gender')}
        value={draft.gender}
        onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value }))}
      >
        <option value="male">{t('gender.male')}</option>
        <option value="female">{t('gender.female')}</option>
        <option value="other">{t('gender.other')}</option>
      </select>
      <button type="submit" className="secondaryButton">
        {t('actions.create')}
      </button>
      {error ? <p className="errorLine">{error}</p> : null}
    </form>
  );
}

function NewPartnerChildForm({ selectedId, onAddChildWithNewPartner }) {
  const { t } = useTranslation();
  const [partner, setPartner] = useState(createEmptyPerson({ firstName: '', gender: 'other' }));
  const [child, setChild] = useState(createEmptyPerson({ firstName: '', gender: 'other' }));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const update = (setter, field, value) => setter((current) => ({ ...current, [field]: value }));
  const fields = (kind, draft, setter) => (
    <fieldset className="compactPersonFields">
      <legend>{t(`childDialog.${kind}Fields`)}</legend>
      <input
        aria-label={`${t(`childDialog.${kind}Fields`)}: ${t('fields.firstName')}`}
        placeholder={t('fields.firstName')}
        value={draft.firstName}
        onChange={(event) => {
          update(setter, 'firstName', event.target.value);
          if (event.target.value.trim()) setErrors((current) => ({ ...current, [kind]: '' }));
        }}
        required
        aria-invalid={Boolean(errors[kind])}
      />
      {errors[kind] ? <span className="fieldError">{errors[kind]}</span> : null}
      <input
        aria-label={`${t(`childDialog.${kind}Fields`)}: ${t('fields.lastName')}`}
        placeholder={t('fields.lastName')}
        value={draft.lastName}
        onChange={(event) => update(setter, 'lastName', event.target.value)}
      />
      <select
        aria-label={`${t(`childDialog.${kind}Fields`)}: ${t('fields.gender')}`}
        value={draft.gender}
        onChange={(event) => update(setter, 'gender', event.target.value)}
      >
        <option value="male">{t('gender.male')}</option>
        <option value="female">{t('gender.female')}</option>
        <option value="other">{t('gender.other')}</option>
      </select>
    </fieldset>
  );

  return (
    <form
      className="compactAddForm newPartnerChildForm"
      onSubmit={async (event) => {
        event.preventDefault();
        const nextErrors = {
          partner: partner.firstName.trim() ? '' : t('validation.missingFirstName'),
          child: child.firstName.trim() ? '' : t('validation.missingFirstName'),
        };
        setErrors(nextErrors);
        if (nextErrors.partner || nextErrors.child) return;

        const result = await onAddChildWithNewPartner(
          selectedId,
          { ...partner, firstName: partner.firstName.trim() },
          { ...child, firstName: child.firstName.trim() },
        );
        if (!result.ok) setSubmitError(t(`validation.${result.errors[0].code}`));
      }}
      noValidate
    >
      {fields('partner', partner, setPartner)}
      {fields('child', child, setChild)}
      <button type="submit" className="secondaryButton">{t('actions.create')}</button>
      {submitError ? <p className="errorLine">{submitError}</p> : null}
    </form>
  );
}

export function LoginModal({ onClose, onSuccess, isLoading }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const signIn = async (event) => {
    event.preventDefault();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(t('auth.loginFailed'));
      return;
    }
    onSuccess();
  };

  return (
    <div className="modalBackdrop" role="presentation">
      <form className="loginModal" onSubmit={signIn}>
        <button type="button" className="iconButton closeButton" onClick={onClose} aria-label={t('actions.close')}>
          <X size={18} />
        </button>
        <h2>{t('auth.editorLogin')}</h2>
        <label>
          {t('auth.email')}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          {t('auth.password')}
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="errorLine">{error}</p> : null}
        <button type="submit" className="primaryButton" disabled={isLoading}>
          {t('auth.signIn')}
        </button>
      </form>
    </div>
  );
}

export default function EditorShell({
  people,
  relationships,
  selectedId,
  onSavePerson,
  onSaveRelationship,
  onDeletePerson,
  onAddParentPair,
  onAddSibling,
  onAddChildToExistingCouple,
  onAddChildWithNewPartner,
  onAddSingleParentChild,
  onMoveSibling,
  isMovingSibling,
  onUndo,
  canUndo,
  isUndoing,
  onSelectPerson,
  editorRevision,
}) {
  const { t } = useTranslation();
  const [activeAdd, setActiveAdd] = useState('');
  const [isChildOptionsOpen, setIsChildOptionsOpen] = useState(false);
  const [childMode, setChildMode] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [actionError, setActionError] = useState('');
  const previousSelectedId = useRef(selectedId);
  const selectedPerson = useMemo(() => people.find((person) => person.id === selectedId), [people, selectedId]);
  const siblingFamily = useMemo(() => getSiblingFamily(people, relationships, selectedId), [people, relationships, selectedId]);
  const siblingIndex = siblingFamily?.children.indexOf(selectedId) ?? -1;
  const parentCount = relationships.filter(
    (relationship) => relationship.type === 'parent-child' && relationship.childId === selectedId,
  ).length;
  const childOptions = useMemo(
    () => getChildCreationOptions(people, relationships, selectedId),
    [people, relationships, selectedId],
  );

  useEffect(() => {
    if (previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    setActiveAdd('');
    setIsChildOptionsOpen(false);
    setChildMode(null);
    setActionError('');
    setIsDeleteOpen(false);
    setIsDeleting(false);
    setDeleteError('');
  }, [selectedId]);

  if (isCollapsed) {
    return (
      <button
        type="button"
        className="editorRestoreButton"
        onClick={() => setIsCollapsed(false)}
        aria-label={t('editor.show')}
        title={t('editor.show')}
      >
        <PanelRightOpen size={18} />
        {t('editor.title')}
      </button>
    );
  }

  if (!selectedPerson) {
    return (
      <aside className="editorPanel editorPanelCompact">
        <div className="editorHeader">
          <div>
            <p className="eyebrow">{t('editor.mode')}</p>
            <h2>{t('editor.title')}</h2>
          </div>
          <div className="editorHeaderActions">
            <button
              type="button"
              className="iconButton"
              onClick={onUndo}
              disabled={!canUndo || isUndoing}
              aria-label={t('actions.undo')}
              title={t('actions.undo')}
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              className="iconButton"
              onClick={() => setIsCollapsed(true)}
              aria-label={t('editor.hide')}
              title={t('editor.hide')}
            >
              <PanelRightClose size={18} />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const convertRelationship = (type) => {
    const result = upsertRelationship(people, relationships, {
      type,
      personAId: selectedId,
      personBId: selectedId,
    });
    return result;
  };

  convertRelationship;

  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    const result = await onDeletePerson(selectedId);
    if (!result.ok) {
      setDeleteError(t(`deletePerson.${result.errors[0].code}`));
      setIsDeleting(false);
      return;
    }
    setIsDeleteOpen(false);
    setIsDeleting(false);
  };

  const createParentPair = async () => {
    setActiveAdd('');
    setActionError('');
    const result = await onAddParentPair(selectedId);
    if (!result.ok) setActionError(t(`validation.${result.errors[0].code}`));
  };

  return (
    <aside className="editorPanel">
      <div className="editorHeader">
        <div>
          <p className="eyebrow">{t('editor.mode')}</p>
          <h2>{t('editor.title')}</h2>
        </div>
        <div className="editorHeaderActions">
          <button
            type="button"
            className="iconButton"
            onClick={onUndo}
            disabled={!canUndo || isUndoing}
            aria-label={t('actions.undo')}
            title={t('actions.undo')}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="iconButton dangerIconButton"
            disabled={isMovingSibling}
            onClick={() => setIsDeleteOpen(true)}
            aria-label={t('deletePerson.open')}
            title={t('deletePerson.open')}
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            className="iconButton"
            onClick={() => setIsCollapsed(true)}
            aria-label={t('editor.hide')}
            title={t('editor.hide')}
          >
            <PanelRightClose size={18} />
          </button>
        </div>
      </div>

      <fieldset className="editorActionFields" disabled={isMovingSibling}>
        <div className="relationshipActions" aria-label={t('actions.relationships')}>
        <button type="button" className="secondaryButton" onClick={createParentPair} disabled={parentCount > 0}>
          <UserPlus size={16} />
          {t('actions.addParent')}
        </button>
        <button type="button" className="secondaryButton" onClick={() => setActiveAdd('spouse')}>
          <Users size={16} />
          {t('actions.addSpouse')}
        </button>
        <button type="button" className="secondaryButton" onClick={() => setActiveAdd('sibling')}>
          <UsersRound size={16} />
          {t('actions.addSibling')}
        </button>
        <button type="button" className="secondaryButton" onClick={() => {
          setActiveAdd('');
          setChildMode(null);
          setIsChildOptionsOpen(true);
        }}>
          <Baby size={16} />
          {t('actions.addChild')}
        </button>
        </div>

      {siblingFamily && siblingFamily.children.length > 1 ? (
        <div className="siblingOrderControls" role="group" aria-label={t('editor.childOrder')}>
          {[-1, 1].map((direction) => {
            const label = t(direction === -1 ? 'actions.moveLeft' : 'actions.moveRight');
            const automatic = siblingFamily.orderMode === 'birth-date';
            const unavailable = siblingIndex + direction < 0 || siblingIndex + direction >= siblingFamily.children.length;
            return (
              <span key={direction} title={automatic ? t('editor.automaticOrder') : label}>
                <button type="button" className="iconButton"
                  aria-label={label}
                  disabled={automatic || unavailable || isMovingSibling || isUndoing}
                  onClick={async () => {
                    setActionError('');
                    const result = await onMoveSibling(selectedId, direction);
                    if (!result.ok) setActionError(t('status.saveFailed'));
                  }}>
                  {direction === -1 ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {parentCount > 0 ? <p className="relationshipHint">{t('validation.parentPairRequiresNoParents')}</p> : null}
      {actionError ? <p className="errorLine">{actionError}</p> : null}

      {activeAdd === 'child-new-partner' ? (
        <NewPartnerChildForm
          selectedId={selectedId}
          onAddChildWithNewPartner={onAddChildWithNewPartner}
        />
      ) : activeAdd ? (
        <AddRelativeForm
          relationType={activeAdd}
          selectedId={selectedId}
          people={people}
          relationships={relationships}
          childMode={childMode}
          onSaveRelationship={onSaveRelationship}
          onAddSibling={onAddSibling}
          onAddChildToExistingCouple={onAddChildToExistingCouple}
          onAddSingleParentChild={onAddSingleParentChild}
          onSelectPerson={onSelectPerson}
        />
      ) : null}

      <PersonForm key={`${selectedPerson.id}:${editorRevision}`} person={selectedPerson} onSave={onSavePerson} />
      </fieldset>

      {isDeleteOpen ? (
        <DeletePersonModal
          person={selectedPerson}
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={confirmDelete}
          isDeleting={isDeleting}
          error={deleteError}
        />
      ) : null}
      {isChildOptionsOpen ? (
        <ChildOptionsModal
          options={childOptions}
          onCancel={() => setIsChildOptionsOpen(false)}
          onSelect={(option) => {
            setIsChildOptionsOpen(false);
            setChildMode(option);
            setActiveAdd(option.type === 'new-partner' ? 'child-new-partner' : 'child');
          }}
        />
      ) : null}
    </aside>
  );
}
