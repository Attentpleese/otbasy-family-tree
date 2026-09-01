import { useMemo, useState } from 'react';
import { UserPlus, Users, Baby, X, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient';
import { addPersonWithRelationship, createEmptyPerson, upsertRelationship } from '../domain/familyGraph';
import PhotoEditor from './PhotoEditor';
import { mergePersonDraft } from './personDraft';

const fieldNames = ['firstName', 'lastName', 'maidenName', 'birthDate', 'deathDate', 'birthPlace', 'notes'];

function PersonForm({ person, onSave }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(person);
  const [activeTab, setActiveTab] = useState('details');

  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

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
            onSave(mergePersonDraft(draft, person));
          }}
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
        <label key={field}>
          {t(`fields.${field}`)}
          {field === 'notes' ? (
            <textarea value={draft[field] || ''} onChange={(event) => updateField(field, event.target.value)} />
          ) : (
            <input
              type={field.includes('Date') ? 'date' : 'text'}
              value={draft[field] || ''}
              onChange={(event) => updateField(field, event.target.value)}
            />
          )}
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

function AddRelativeForm({ relationType, selectedId, people, relationships, onSaveRelationship, onSelectPerson }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(createEmptyPerson({ firstName: '', gender: 'other' }));
  const [error, setError] = useState('');

  const createRelative = (event) => {
    event.preventDefault();
    const result = addPersonWithRelationship({
      people,
      relationships,
      selectedId,
      relationType,
      person: draft,
    });

    if (!result.ok) {
      setError(t(`validation.${result.errors[0].code}`));
      return;
    }

    onSaveRelationship(result.relationship, result.people, result.relationships);
    onSelectPerson(draft.id);
    setDraft(createEmptyPerson({ firstName: '', gender: 'other' }));
    setError('');
  };

  return (
    <form className="compactAddForm" onSubmit={createRelative}>
      <input
        aria-label={t('fields.firstName')}
        placeholder={t('fields.firstName')}
        value={draft.firstName}
        onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
      />
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
  onSelectPerson,
}) {
  const { t } = useTranslation();
  const [activeAdd, setActiveAdd] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const selectedPerson = useMemo(() => people.find((person) => person.id === selectedId), [people, selectedId]);

  if (!selectedPerson) return null;

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

  const convertRelationship = (type) => {
    const result = upsertRelationship(people, relationships, {
      type,
      personAId: selectedId,
      personBId: selectedId,
    });
    return result;
  };

  convertRelationship;

  return (
    <aside className="editorPanel">
      <div className="editorHeader">
        <div>
          <p className="eyebrow">{t('editor.mode')}</p>
          <h2>{t('editor.title')}</h2>
        </div>
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

      <div className="relationshipActions" aria-label={t('actions.relationships')}>
        <button type="button" className="secondaryButton" onClick={() => setActiveAdd('parent')}>
          <UserPlus size={16} />
          {t('actions.addParent')}
        </button>
        <button type="button" className="secondaryButton" onClick={() => setActiveAdd('spouse')}>
          <Users size={16} />
          {t('actions.addSpouse')}
        </button>
        <button type="button" className="secondaryButton" onClick={() => setActiveAdd('child')}>
          <Baby size={16} />
          {t('actions.addChild')}
        </button>
      </div>

      {activeAdd ? (
        <AddRelativeForm
          relationType={activeAdd}
          selectedId={selectedId}
          people={people}
          relationships={relationships}
          onSaveRelationship={onSaveRelationship}
          onSelectPerson={onSelectPerson}
        />
      ) : null}

      <PersonForm key={selectedPerson.id} person={selectedPerson} onSave={onSavePerson} />
    </aside>
  );
}
