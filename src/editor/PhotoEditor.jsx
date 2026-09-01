import { useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { ImagePlus, Trash2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cropImageToWebP } from './imageCompression';
import { removePersonPhoto, uploadPersonPhoto } from '../services/photoStorage';

const isLocalPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('editorPreview');

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

function CropModal({ imageUrl, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const saveCrop = async () => {
    if (!cropPixels) return;
    setIsProcessing(true);
    try {
      await onConfirm(await cropImageToWebP(imageUrl, cropPixels));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modalBackdrop cropBackdrop" role="presentation">
      <section className="photoCropModal" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
        <header className="photoCropHeader">
          <div>
            <p className="eyebrow">{t('photo.adjustKicker')}</p>
            <h2 id="photo-crop-title">{t('photo.adjustTitle')}</h2>
          </div>
          <button type="button" className="iconButton" onClick={onCancel} aria-label={t('actions.close')}>
            <X size={18} />
          </button>
        </header>

        <div className="cropViewport">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, pixels) => setCropPixels(pixels)}
          />
        </div>

        <div className="cropToolbar">
          <label htmlFor="photo-zoom">{t('photo.zoom')}</label>
          <input
            id="photo-zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <div className="cropActions">
            <button type="button" className="ghostButton" onClick={onCancel}>
              {t('actions.cancel')}
            </button>
            <button type="button" className="primaryButton" onClick={saveCrop} disabled={!cropPixels || isProcessing}>
              <Upload size={17} />
              {isProcessing ? t('photo.processing') : t('photo.useCrop')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function PhotoEditor({ person, onSave }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (pendingPhoto?.objectUrl) URL.revokeObjectURL(pendingPhoto.objectUrl);
    },
    [sourceUrl, pendingPhoto],
  );

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('photo.invalidFile'));
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setError('');
  };

  const acceptCrop = ({ blob, objectUrl }) => {
    if (pendingPhoto?.objectUrl) URL.revokeObjectURL(pendingPhoto.objectUrl);
    setPendingPhoto({ blob, objectUrl });
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl('');
  };

  const uploadPhoto = async () => {
    if (!pendingPhoto) return;
    setIsUploading(true);
    setError('');

    if (isLocalPreview) {
      const photoUrl = await blobToDataUrl(pendingPhoto.blob);
      await onSave({ ...person, photoUrl });
      URL.revokeObjectURL(pendingPhoto.objectUrl);
      setPendingPhoto(null);
      setIsUploading(false);
      return;
    }

    const uploaded = await uploadPersonPhoto(person.id, pendingPhoto.blob);
    if (uploaded.error) {
      setError(t('photo.uploadFailed'));
      setIsUploading(false);
      return;
    }

    const saveResult = await onSave({ ...person, photoUrl: uploaded.publicUrl });
    if (saveResult?.error) {
      await removePersonPhoto(uploaded.publicUrl);
      setError(t('photo.saveFailed'));
      setIsUploading(false);
      return;
    }
    await removePersonPhoto(person.photoUrl);
    URL.revokeObjectURL(pendingPhoto.objectUrl);
    setPendingPhoto(null);
    setIsUploading(false);
  };

  const deletePhoto = async () => {
    setIsUploading(true);
    setError('');

    if (isLocalPreview) {
      await onSave({ ...person, photoUrl: '' });
      setIsUploading(false);
      return;
    }

    const previousPhotoUrl = person.photoUrl;
    const saveResult = await onSave({ ...person, photoUrl: '' });
    if (saveResult?.error) {
      setError(t('photo.saveFailed'));
      setIsUploading(false);
      return;
    }
    const { error: removeError } = await removePersonPhoto(previousPhotoUrl);
    if (removeError) {
      setError(t('photo.deleteFailed'));
      setIsUploading(false);
      return;
    }
    setIsUploading(false);
  };

  const previewUrl = pendingPhoto?.objectUrl || person.photoUrl;

  return (
    <section className="photoEditor">
      <div className="photoPreview">
        {previewUrl ? (
          <img src={previewUrl} alt={t('photo.previewAlt')} />
        ) : (
          <span>{[person.firstName, person.lastName].filter(Boolean).map((part) => part[0]).join('').slice(0, 2) || '?'}</span>
        )}
      </div>
      <p className="photoHint">{t('photo.hint')}</p>
      {isLocalPreview ? <p className="photoPreviewNote">{t('photo.previewMode')}</p> : null}

      <input ref={fileInputRef} className="visuallyHidden" type="file" accept="image/*" onChange={chooseFile} />
      <button type="button" className="secondaryButton" onClick={() => fileInputRef.current?.click()}>
        <ImagePlus size={17} />
        {t('photo.choose')}
      </button>
      {pendingPhoto ? (
        <button type="button" className="primaryButton" onClick={uploadPhoto} disabled={isUploading}>
          <Upload size={17} />
          {isUploading ? t('photo.uploading') : t(isLocalPreview ? 'photo.applyPreview' : 'photo.upload')}
        </button>
      ) : null}
      {person.photoUrl ? (
        <button type="button" className="dangerButton" onClick={deletePhoto} disabled={isUploading}>
          <Trash2 size={17} />
          {t('photo.delete')}
        </button>
      ) : null}
      {error ? <p className="errorLine">{error}</p> : null}

      {sourceUrl ? <CropModal imageUrl={sourceUrl} onCancel={() => setSourceUrl('')} onConfirm={acceptCrop} /> : null}
    </section>
  );
}
