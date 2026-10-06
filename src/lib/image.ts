/**
 * Shrinks a photo before upload (payment slips, outstanding screenshots): longest side at most 1600 px, JPEG quality
 * 0.75, usually 100-300 KB. The API refuses images above about 1 MB, and small images keep the free database light.
 */
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.75): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image (photo or screenshot).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This image could not be read.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot prepare the image.');
    ctx.fillStyle = '#ffffff'; // transparent PNG areas become white in the JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
