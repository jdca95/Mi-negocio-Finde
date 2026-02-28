import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { exportFullBackup, importFullBackup } from '../services/backupService'

interface BackupModuleProps {
  canManage: boolean
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export const BackupModule = ({
  canManage,
  onNotify,
  onError,
}: BackupModuleProps) => {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!canManage) {
      onError('Solo Admin puede restaurar respaldos.')
      return
    }

    setIsImporting(true)
    try {
      const text = await file.text()
      await importFullBackup(text)
      onNotify('Respaldo restaurado correctamente.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo restaurar respaldo.')
    } finally {
      event.target.value = ''
      setIsImporting(false)
    }
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <h2>Respaldo y recuperacion</h2>
        {!canManage ? (
          <p className="info-text">Modo cajero: solo exportacion de respaldo.</p>
        ) : null}
      </div>

      <p>
        Exporta un respaldo JSON completo de la base local o restaura un respaldo
        previo. Incluye catalogo, inventarios, ventas, movimientos, usuarios y cola
        de sincronizacion.
      </p>

      <div className="actions-row">
        <button
          type="button"
          disabled={isExporting}
          onClick={async () => {
            setIsExporting(true)
            try {
              await exportFullBackup()
              onNotify('Respaldo JSON exportado.')
            } catch (error) {
              onError(
                error instanceof Error ? error.message : 'No se pudo exportar respaldo.',
              )
            } finally {
              setIsExporting(false)
            }
          }}
        >
          {isExporting ? 'Exportando...' : 'Exportar respaldo JSON'}
        </button>

        <label className="file-upload">
          <span>Restaurar respaldo</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            disabled={!canManage || isImporting}
          />
        </label>
      </div>

      <div className="error-block">
        <h4>Importante</h4>
        <ul>
          <li>Restaurar reemplaza toda la base local actual.</li>
          <li>Usa respaldos del mismo proyecto para evitar inconsistencias.</li>
          <li>Haz un respaldo antes de restaurar otro archivo.</li>
        </ul>
      </div>
    </section>
  )
}

