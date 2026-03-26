interface StoreButtonProps {
  store: 'apple' | 'google';
  label: string;
  subLabel: string;
  href?: string;
}

function AppleIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GooglePlayIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.405l2.937 1.697c.552.32.552 1.103 0 1.422l-2.937 1.697-2.535-2.535 2.535-2.281zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
    </svg>
  );
}

export default function StoreButton({ store, label, subLabel, href = '#' }: StoreButtonProps) {
  return (
    <a
      href={href}
      className="glass-card inline-flex items-center gap-3 !bg-primary-900/90 !border-primary-800/30 rounded-2xl px-6 py-3.5 text-white transition-all duration-200 hover:!bg-primary-800/95 hover:shadow-lg active:scale-[0.98]"
    >
      {store === 'apple' ? <AppleIcon /> : <GooglePlayIcon />}
      <div className="text-left">
        <div className="text-[10px] uppercase leading-tight opacity-70">
          {subLabel}
        </div>
        <div className="text-base font-semibold leading-tight">{label}</div>
      </div>
    </a>
  );
}
