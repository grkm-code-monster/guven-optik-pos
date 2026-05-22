export default function PatronPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Patron Görünümü</h1>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            backgroundColor: '#fef08a',
            color: '#854d0e',
            padding: '4px 10px',
            borderRadius: 999,
          }}
        >
          Yakında
        </span>
      </div>
      <p style={{ color: '#6b7280', fontSize: 15 }}>Bu modül geliştirme aşamasındadır.</p>
    </div>
  )
}
