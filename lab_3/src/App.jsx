import { useState, useRef, useEffect } from 'react'
import './App.css'

// Пример матрицы из лабораторной работы (5x5)
const EXAMPLE_MATRIX = [
  [90, 76, 30, 35, 30],
  [90, 76, 30, 35, 30],
  [90, 76, 30, 35, 30],
  [90, 76, 30, 35, 30],
  [90, 76, 30, 35, 30]
]

// Пример для загрузки из файла
const EXAMPLE_CONFIG = {
  c_matrix: [
    [90, 76, 30, 35, 30],
    [90, 76, 30, 35, 30],
    [90, 76, 30, 35, 30],
    [90, 76, 30, 35, 30],
    [90, 76, 30, 35, 30]
  ],
  k: 2.0,
  variant: "task1"
}

function App() {
  const toastTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  // Состояния
  const [size, setSize] = useState(5)
  const [cMatrix, setCMatrix] = useState(EXAMPLE_MATRIX)
  const [k, setK] = useState(2.0)
  const [variant, setVariant] = useState('task1')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [result, setResult] = useState(null)
  const [isResultOpen, setIsResultOpen] = useState(false)
  const [status, setStatus] = useState('Ожидание')

  // Показ уведомлений
  const showToast = (message) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2600)
  }

  // Изменение размера матрицы
  const resizeMatrix = (newSize) => {
    const newMatrix = Array(newSize).fill().map((_, i) =>
      Array(newSize).fill().map((_, j) =>
        (i < cMatrix.length && j < cMatrix[i]?.length) ? cMatrix[i][j] : 50
      )
    )
    setCMatrix(newMatrix)
    setSize(newSize)
  }

  // Обновление ячейки матрицы
  const updateCell = (i, j, value) => {
    const newMatrix = [...cMatrix]
    newMatrix[i][j] = Number(value) || 0
    setCMatrix(newMatrix)
  }

  // Загрузка из JSON файла
  const loadFromFile = async (file) => {
    const text = await file.text()
    let config
    try {
      config = JSON.parse(text)
    } catch {
      throw new Error('Некорректный JSON файл')
    }

    // Проверка наличия матрицы C
    const newMatrix = config.c_matrix
    if (!newMatrix || !Array.isArray(newMatrix) || newMatrix.length === 0) {
      throw new Error('В файле отсутствует поле c_matrix')
    }

    const newSize = newMatrix.length
    // Проверка квадратности
    if (!newMatrix.every(row => row.length === newSize)) {
      throw new Error('Матрица C должна быть квадратной')
    }

    resizeMatrix(newSize)
    setCMatrix(newMatrix)
    setK(config.k !== undefined ? config.k : 2.0)
    setVariant(config.variant === 'task2' ? 'task2' : 'task1')
    setResult(null)
    setIsResultOpen(false)
    setStatus('Данные загружены из файла')
    showToast('Файл успешно загружен')
  }

  // Отправка запроса на решение
  const handleSolve = async () => {
    try {
      setLoading(true)
      setError('')
      setStatus('Вычисление...')

      // Подготовка payload
      const payload = {
        c_matrix: cMatrix,
        k: k,
        variant: variant
      }

      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при решении задачи')
      }

      setResult(data)
      setIsResultOpen(true)
      setStatus('Расчёт успешно завершён')
      showToast('Решение получено')
    } catch (err) {
      showToast(err.message)
      setError(err.message)
      setStatus('Ошибка при расчёте')
    } finally {
      setLoading(false)
    }
  }

  // Загрузка примера
  const loadExample = () => {
    setSize(5)
    setCMatrix(EXAMPLE_MATRIX)
    setK(2.0)
    setVariant('task1')
    setResult(null)
    setIsResultOpen(false)
    setStatus('Пример загружен')
    showToast('Загружен демонстрационный пример')
  }

  // Очистка всех полей
  const clearAll = () => {
    setCMatrix(Array(size).fill().map(() => Array(size).fill(0)))
    setK(2.0)
    setVariant('task1')
    setResult(null)
    setIsResultOpen(false)
    setStatus('Все поля очищены')
    showToast('Форма очищена')
  }

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  return (
    <div className="app-screen">
      {/* Всплывающие уведомления */}
      {toast && <div className="toast">{toast}</div>}

      <div className="panel config-panel">
        {/* Панель управления */}
        <div className="row">
          <div className="field">
            <span>Размер матрицы n×n</span>
            <input
              type="number"
              min="2"
              max="20"
              value={size}
              onChange={(e) => resizeMatrix(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <span>Коэффициент k (&gt;1)</span>
            <input
              type="number"
              step="0.5"
              min="1.01"
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <span>Вариант задачи</span>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="task1">Task 1 — ослабление на 1 период</option>
              <option value="task2">Task 2 — ослабление на 2 периода</option>
            </select>
          </div>

          <div className="field" style={{ flex: '0 0 auto' }}>
            <button className="btn btn--secondary" onClick={loadExample}>
              📋 Пример
            </button>
          </div>

          <div className="field" style={{ flex: '0 0 auto' }}>
            <button
              className="btn btn--secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              📂 Загрузить JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden-file-input"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) {
                  try {
                    await loadFromFile(file)
                  } catch (err) {
                    showToast(err.message)
                    setError(err.message)
                  }
                }
                e.target.value = ''
              }}
            />
          </div>

          <div className="field" style={{ flex: '0 0 auto' }}>
            <button className="btn btn--ghost" onClick={clearAll}>
              🗑 Очистить
            </button>
          </div>

          <div className="field" style={{ flex: 1 }}>
            <button
              className="btn btn--primary"
              onClick={handleSolve}
              disabled={loading}
            >
              {loading ? '⏳ Расчёт...' : '🎯 Рассчитать'}
            </button>
          </div>
        </div>

        {/* Таблица матрицы C */}
        <div className="table-block">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>C</th>
                {Array.from({ length: size }, (_, j) => (
                  <th key={j}>Период {j + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cMatrix.map((row, i) => (
                <tr key={i}>
                  <th>СЗИ {i + 1}</th>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <input
                        type="number"
                        step="any"
                        value={cell}
                        onChange={(e) => updateCell(i, j, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Статус и ошибки */}
        <div className="status-inline">Статус: {status}</div>
        {error && <div className="error-box">{error}</div>}
      </div>

      {/* Модальное окно с результатами */}
      {isResultOpen && result && (
        <div className="modal-backdrop" onClick={() => setIsResultOpen(false)}>
          <div className="result-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📊 Результаты расчёта (лабораторная №3)</h2>

            <div>
              <strong>Вариант:</strong>{' '}
              {result.variant === 'task1'
                ? 'Task 1 — ослабление на 1 период'
                : 'Task 2 — ослабление на 2 периода'}
            </div>

            <div>
              <strong>Коэффициент k:</strong> {result.k}
            </div>

            <div>
              <strong>Расписание по периодам:</strong>{' '}
              {result.schedule_by_period?.join(' → ') || '—'}
            </div>

            <div>
              <strong>Максимизированный счёт (Score):</strong>{' '}
              {result.maximized_score?.toFixed(6)}
            </div>

            <div>
              <strong>Исходная суммарная мощность противника:</strong>{' '}
              {result.total_power_without_shelling?.toFixed(6)}
            </div>

            <div>
              <strong>Минимизированная мощность противника:</strong>{' '}
              {result.minimized_enemy_power?.toFixed(6)}
            </div>

            <details>
              <summary>🔍 Эффективная матрица (после модификации)</summary>
              <pre>{JSON.stringify(result.effective_matrix, null, 2)}</pre>
            </details>

            <details>
              <summary>📋 Матрица назначений</summary>
              <pre>{JSON.stringify(result.assignment_matrix, null, 2)}</pre>
            </details>

            <button className="btn btn--primary" onClick={() => setIsResultOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App