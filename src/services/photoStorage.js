import { supabase } from './supabaseClient';

export const PERSON_PHOTOS_BUCKET = 'person-photos';

const storagePathFromPublicUrl = (photoUrl) => {
  if (!photoUrl) return '';
  const marker = `/storage/v1/object/public/${PERSON_PHOTOS_BUCKET}/`;
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex === -1) return '';
  return decodeURIComponent(photoUrl.slice(markerIndex + marker.length).split('?')[0]);
};

export async function uploadPersonPhoto(personId, blob) {
  const path = `${personId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(PERSON_PHOTOS_BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    contentType: 'image/webp',
    upsert: false,
  });

  if (error) return { error, path: '', publicUrl: '' };
  const { data } = supabase.storage.from(PERSON_PHOTOS_BUCKET).getPublicUrl(path);
  return { error: null, path, publicUrl: data.publicUrl };
}

export async function removePersonPhoto(photoUrl) {
  const path = storagePathFromPublicUrl(photoUrl);
  if (!path) return { error: null };
  return supabase.storage.from(PERSON_PHOTOS_BUCKET).remove([path]);
}
