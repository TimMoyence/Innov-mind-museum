interface TestimonialCardProps {
  name: string;
  role: string;
  quote: string;
}

function StarIcon() {
  return (
    <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export default function TestimonialCard({ name, role, quote }: TestimonialCardProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-primary-100 bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-md sm:p-8">
      {/* Stars */}
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StarIcon key={i} />
        ))}
      </div>

      {/* Quote */}
      <blockquote className="mt-4 flex-1 text-text-secondary leading-relaxed">
        &ldquo;{quote}&rdquo;
      </blockquote>

      {/* Author */}
      <div className="mt-6 flex items-center gap-3">
        {/* Avatar placeholder */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600">
          {name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{name}</p>
          <p className="text-xs text-text-muted">{role}</p>
        </div>
      </div>
    </div>
  );
}
