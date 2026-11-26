interface BrandFooterProps {
  className?: string;
}

export function BrandFooter({ className = '' }: BrandFooterProps) {
  return (
    <footer className={`no-print mt-auto border-t border-[#E1E7F1]/80 px-3 py-4 text-center text-[10px] font-medium tracking-wide text-[#7B8798] ${className}`}>
      © {new Date().getFullYear()} Nextmind Technologies. All rights reserved.
    </footer>
  );
}
