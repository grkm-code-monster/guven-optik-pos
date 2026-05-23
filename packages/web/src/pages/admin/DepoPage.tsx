import { StockQueryPanel } from '../StokSorgulaPage'

export default function DepoPage() {
  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900 }}>Depo Yönetimi</h1>
      <StockQueryPanel variant="admin" />
    </div>
  )
}
