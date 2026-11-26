import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { StylistAvatar } from './StylistAvatar';

interface ProfileImagePickerProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('This image could not be processed. Try a JPG or PNG.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('This image could not be read. Try another file.'));
      reader.readAsDataURL(blob);
    }, type, quality);
  });
}

export function ProfileImagePicker({ name, value, onChange }: ProfileImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose an image smaller than 12 MB.');
      return;
    }

    setProcessing(true);
    try {
      const bitmap = await createImageBitmap(file);
      const cropSize = Math.min(bitmap.width, bitmap.height);
      const cropX = (bitmap.width - cropSize) / 2;
      const cropY = (bitmap.height - cropSize) / 2;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');

      let compressed = '';
      for (const size of [512, 384, 256]) {
        canvas.width = size;
        canvas.height = size;
        context.clearRect(0, 0, size, size);
        context.drawImage(bitmap, cropX, cropY, cropSize, cropSize, 0, 0, size, size);
        for (const type of ['image/webp', 'image/jpeg']) {
          for (const quality of [0.8, 0.62]) {
            compressed = await canvasToDataUrl(canvas, type, quality);
            if (compressed.length <= 120_000) break;
          }
          if (compressed.length <= 120_000) break;
        }
        if (compressed.length <= 120_000) break;
      }
      bitmap.close();
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(compressed) || compressed.length > 120_000) {
        throw new Error('This image could not be compressed enough. Choose another photo.');
      }
      onChange(compressed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to process this image.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E1E7F0] bg-white p-3">
      <StylistAvatar src={value} name={name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[#14213D]">Account photo</p>
        <p className="mt-0.5 text-[10px] text-[#64748B]">JPG, PNG, or WebP. It will be cropped to a square.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleSelect(event)} className="sr-only" />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={processing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C5D8F4] bg-[#F8FAFD] px-3 text-xs font-semibold text-[#14213D] disabled:opacity-60">
            <ImagePlus className="h-4 w-4" />{processing ? 'Preparing photo…' : value ? 'Change photo' : 'Add photo'}
          </button>
          {value && <button type="button" onClick={() => { setError(''); onChange(''); }} disabled={processing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#FECACA] px-3 text-xs font-semibold text-red-700 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
        </div>
        {error && <p role="alert" className="mt-2 text-[10px] font-semibold text-red-700">{error}</p>}
      </div>
    </div>
  );
}
