import { useId, useEffect, useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';

export function AttendanceQrScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const readerId = `attendance-qr-reader-${useId().replaceAll(':', '')}`;
  const [error, setError] = useState('');

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let disposed = false;
    let handled = false;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (disposed) return;
        scanner = new Html5Qrcode(readerId, { verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          (decodedText) => {
            if (handled) return;
            handled = true;
            void scanner?.stop().catch(() => undefined).finally(() => {
              if (!disposed) onScan(decodedText);
            });
          },
          () => undefined,
        );
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Could not start the camera. Check camera permission and try again.');
      }
    };

    void start();
    return () => {
      disposed = true;
      if (scanner?.isScanning) void scanner.stop().catch(() => undefined);
    };
  }, [onScan, readerId]);

  return (
    <section className="salon-card w-full rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-bold text-[#14213D]">Scan attendance QR code</h3><p className="mt-1 text-xs text-[#64748B]">Point your camera at the printed Royal Saloon code.</p></div><button type="button" onClick={onClose} aria-label="Close QR scanner" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE6F1] text-[#475467]"><X className="h-4 w-4" /></button></div>
      <div className="mx-auto mt-4 max-w-sm overflow-hidden rounded-xl bg-black"><div id={readerId} /></div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[#64748B]"><Camera className="h-4 w-4" />Allow camera access to scan. Use the installed app or HTTPS site.</p>}
    </section>
  );
}
