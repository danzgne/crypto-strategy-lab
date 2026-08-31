import { AlertCircle, CheckCircle2 } from 'lucide-react';

type ValidationStatus = 'idle' | 'valid' | 'error';

interface ValidationStatusCardProps {
  status: ValidationStatus;
  message?: string | undefined;
}

export function ValidationStatusCard({
  status,
  message,
}: ValidationStatusCardProps) {
  if (status === 'idle') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        Nhập mô tả hoặc URL và phân tích để xem trạng thái hợp lệ.
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Không thể tạo strategy</p>
          {message && <p className="mt-0.5 text-xs text-rose-700">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">Hợp lệ để lưu vào thư viện</p>
        {message && (
          <p className="mt-0.5 text-xs text-emerald-700">{message}</p>
        )}
      </div>
    </div>
  );
}
