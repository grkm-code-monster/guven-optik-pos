import { useState } from 'react'
import YeniTransfer from '../components/transfer/YeniTransfer'
import BekleyenTransferler from '../components/transfer/BekleyenTransferler'

export default function TransferlerPage() {
  const [altSekme, setAltSekme] = useState<'yeni' | 'bekleyen'>('yeni')

  return (
    <div className="transferler-page">
      <div className="transfer-tabs">
        <button
          type="button"
          className={altSekme === 'yeni' ? 'tab-active' : 'tab'}
          onClick={() => setAltSekme('yeni')}
        >
          + Yeni Transfer
        </button>
        <button
          type="button"
          className={altSekme === 'bekleyen' ? 'tab-active' : 'tab'}
          onClick={() => setAltSekme('bekleyen')}
        >
          Bekleyen Transferler
        </button>
      </div>

      {altSekme === 'yeni' ? <YeniTransfer /> : null}
      {altSekme === 'bekleyen' ? <BekleyenTransferler /> : null}
    </div>
  )
}
