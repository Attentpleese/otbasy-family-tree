const canvasToWebP = async (canvas, maxBytes) => {
  let quality = 0.86;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  while (blob?.size > maxBytes && quality > 0.46) {
    quality -= 0.08;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  }
  if (!blob) throw new Error('IMAGE_ENCODING_FAILED');
  return blob;
};

export async function cropImageToWebP(imageUrl, cropPixels, size = 400, maxBytes = 300 * 1024) {
  const image = new Image();
  image.decoding = 'async';
  image.src = imageUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    size,
    size,
  );

  const blob = await canvasToWebP(canvas, maxBytes);
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
  };
}
