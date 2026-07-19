// Aufklappbarer Abschnitt fürs Delegationsportal. Überschrift + Status-Chip
// sind immer sichtbar (Checkliste auf einen Blick), der Inhalt klappt auf.
export default function CollapsibleSection({ title, status, statusKind, open, onToggle, children }) {
  return (
    <section className="portal-section">
      <button className="section-header" onClick={onToggle} aria-expanded={open}>
        <span className="section-title">{title}</span>
        {status && <span className={`section-status ${statusKind ?? ''}`}>{status}</span>}
        <span className="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}
