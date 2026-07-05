'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  className?: string;
  onClick?: () => void;
  label?: string;
}

export function BackButton({ className, onClick, label }: BackButtonProps) {
  const router = useRouter();

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      router.back();
    }
  };

  return (
    <div className={cn("absolute left-6 top-6 z-20 flex items-center gap-3", className)}>
      <button
        onClick={handleBack}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors cursor-pointer"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      {label && (
        <span className="text-[10px] font-bold text-primary uppercase tracking-widest select-none">
          {label}
        </span>
      )}
    </div>
  );
}
