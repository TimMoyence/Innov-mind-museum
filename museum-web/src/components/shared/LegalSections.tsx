interface LegalSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export function LegalSections({ sections }: { sections: readonly LegalSection[] }) {
  return sections.map((section) => (
    <div key={section.id} id={section.id} className="mb-10">
      <h2 className="text-xl font-semibold text-text-primary">{section.title}</h2>
      {section.paragraphs.map((paragraph, i) => (
        <p key={i} className="mt-3 text-text-secondary leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  ));
}
