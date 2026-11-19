interface StatusBadgeProps {
  status: string;
}

const STYLE_MAP: Record<string, string> = {
  Confirmed: 'bg-[#ECFDF5] text-[#047857]',
  Paid: 'bg-[#ECFDF5] text-[#047857]',
  Completed: 'bg-[#ECFDF5] text-[#047857]',
  'In-Service': 'bg-[#EDE9FE] text-[#6D28D9]',
  Pending: 'bg-[#FFFBEB] text-[#B45309]',
  'Low Stock': 'bg-[#FFFBEB] text-[#B45309]',
  Cancelled: 'bg-[#FEF2F2] text-[#B91C1C]',
  'No-Show': 'bg-[#FEF2F2] text-[#B91C1C]',
  Voided: 'bg-[#FEF2F2] text-[#B91C1C]',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const palette = STYLE_MAP[status] ?? 'bg-[#F3F4F6] text-[#4A4455]';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.04em] whitespace-nowrap shrink-0 ${palette}`}
    >
      {status}
    </span>
  );
}
