import { useEffect, useRef, useState } from 'react'
import './App.css'

// Пример для демонстрации
const EXAMPLE_DATA = {
  size: 3,
  cost_matrix: [
    [10, 15, 12],
    [14, 11, 13],
    [9, 16, 10]
  ],
  constraints: [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ],
    [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ]
  ],
  bounds: [1, 2],
  lambda0: [1, 1],
  step_size: 0.1,
  max_iter: 200,
  tolerance: 1e-6
}

function App() {
  const toastTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  const [size, setSize] = useState(EXAMPLE_DATA.size)
  const [sizeInput, setSizeInput] = useState(String(EXAMPLE_DATA.size))

  const [costMatrix, setCostMatrix] = useState(EXAMPLE_DATA.cost_matrix)
  const [constraints, setConstraints] = useState(EXAMPLE_DATA.constraints)
  const [bounds, setBounds] = useState(EXAMPLE_DATA.bounds)
  const [lambda0, setLambda0] = useState(EXAMPLE_DATA.lambda0)
  const [stepSize, setStepSize] = useState(EXAMPLE_DATA.step_size)
  const [maxIter, setMaxIter] = useState(EXAMPLE_DATA.max_iter)
  const [tolerance, setTolerance] = useState(EXAMPLE_DATA.tolerance)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [result, setResult] = useState(null)
  const [isResultOpen, setIsResultOpen] = useState(false)
  const [status, setStatus] = useState('Ожидание')

  const showToast = (message) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2600)
  }

  const resizeMatrices = (newSize) => {
    // Изменение матрицы стоимостей
    const newCost = Array(newSize).fill().map((_, i) =>
      Array(newSize).fill().map((_, j) =>
        (i < costMatrix.length && j < costMatrix[i]?.length) ? costMatrix[i][j] : 0
      )
    )
    setCostMatrix(newCost)

    // Изменение матриц ограничений
    const newConstraints = constraints.map(constraint => {
      const newConstraint = Array(newSize).fill().map((_, i) =>
        Array(newSize).fill().map((_, j) =>
          (i < constraint.length && j < constraint[i]?.length) ? constraint[i][j] : 0
        )
      )
      return newConstraint
    })
    setConstraints(newConstraints)

    // Изменение bounds
    const newBounds = [...bounds]
    while (newBounds.length < constraints.length) newBounds.push(1)
    while (newBounds.length > constraints.length) newBounds.pop()
    setBounds(newBounds)

    // Изменение lambda0
    const newLambda0 = [...lambda0]
    while (newLambda0.length < constraints.length) newLambda0.push(1)
    while (newLambda0.length > constraints.length) newLambda0.pop()
    setLambda0(newLambda0)
  }

  const applySizeChange = (rawValue) => {
    const parsed = Number(rawValue)
    if (!Number.isInteger(parsed) || parsed < 2) {
      showToast('Размер матрицы должен быть целым числом ≥ 2')
      setSizeInput(String(size))
      return
    }
    setSize(parsed)
    setSizeInput(String(parsed))
    resizeMatrices(parsed)
  }

  const addConstraint = () => {
    const newConstraint = Array(size).fill().map(() => Array(size).fill(0))
    setConstraints([...constraints, newConstraint])
    setBounds([...bounds, 1])
    setLambda0([...lambda0, 1])
  }

  const removeConstraint = (idx) => {
    setConstraints(constraints.filter((_, i) => i !== idx))
    setBounds(bounds.filter((_, i) => i !== idx))
    setLambda0(lambda0.filter((_, i) => i !== idx))
  }

  const updateConstraintCell = (cIdx, i, j, value) => {
    const newConstraints = [...constraints]
    newConstraints[cIdx][i][j] = Number(value) || 0
    setConstraints(newConstraints)
  }

  const updateBound = (idx, value) => {
    const newBounds = [...bounds]
    newBounds[idx] = Number(value) || 0
    setBounds(newBounds)
  }

  const updateLambda0 = (idx, value) => {
    const newLambda0 = [...lambda0]
    newLambda0[idx] = Number(value) || 0
    setLambda0(newLambda0)
  }

  const updateCostCell = (i, j, value) => {
    const newCost = [...costMatrix]
    newCost[i][j] = Number(value) || 0
    setCostMatrix(newCost)
  }

  const loadFromFile = async (file) => {
    const text = await file.text()
    let config
    try {
      config = JSON.parse(text)
    } catch {
      throw new Error('Некорректный JSON файл')
    }

    const newSize = config.cost_matrix?.length
    if (!newSize || newSize < 2) throw new Error('Некорректная размерность матрицы C')

    setSize(newSize)
    setSizeInput(String(newSize))
    setCostMatrix(config.cost_matrix)
    setConstraints(config.constraints || [Array(newSize).fill().map(() => Array(newSize).fill(0))])
    setBounds(config.bounds || [1])
    setLambda0(config.lambda0 || [1])
    setStepSize(config.step_size || 0.1)
    setMaxIter(config.max_iter || 200)
    setTolerance(config.tolerance || 1e-6)

    setResult(null)
    setIsResultOpen(false)
    setStatus('Данные загружены')
  }

  const handleSolve = async () => {
    try {
      setLoading(true)
      setError('')
      setStatus('Вычисление...')

      const payload = {
        cost_matrix: costMatrix,
        constraints: constraints,
        bounds: bounds,
        lambda0: lambda0,
        step_size: stepSize,
        max_iter: maxIter,
        tolerance: tolerance
      }

      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ошибка сервера')

      setResult(data)
      setIsResultOpen(true)
      setStatus('Расчёт завершён')
    } catch (err) {
      showToast(err.message)
      setError(err.message)
      setStatus('Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const clearAll = () => {
    setCostMatrix(Array(size).fill().map(() => Array(size).fill(0)))
    setConstraints([Array(size).fill().map(() => Array(size).fill(0))])
    setBounds([1])
    setLambda0([1])
    setStepSize(0.1)
    setMaxIter(200)
    setTolerance(1e-6)
    setResult(null)
    setIsResultOpen(false)
    setStatus('Очищено')
  }

  const loadExample = () => {
    setSize(EXAMPLE_DATA.size)
    setSizeInput(String(EXAMPLE_DATA.size))
    setCostMatrix(EXAMPLE_DATA.cost_matrix)
    setConstraints(EXAMPLE_DATA.constraints)
    setBounds(EXAMPLE_DATA.bounds)
    setLambda0(EXAMPLE_DATA.lambda0)
    setStepSize(EXAMPLE_DATA.step_size)
    setMaxIter(EXAMPLE_DATA.max_iter)
    setTolerance(EXAMPLE_DATA.tolerance)
    setResult(null)
    setIsResultOpen(false)
    setStatus('Пример загружен')
  }

  useEffect(() => {
    return () => toastTimerRef.current && clearTimeout(toastTimerRef.current)
  }, [])

  return (
    <div className="app-screen">
      {toast && <div className="toast">{toast}</div>}

      <div className="panel config-panel">
        <div className="row">
          <div className="field">
            <span>Размер матрицы n×n</span>
            <input
              type="number"
              min="2"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              onBlur={(e) => applySizeChange(e.target.value)}
            />
          </div>

          <div className="field field--wide">
            <span>Шаг (step_size)</span>
            <input type="number" step="0.01" value={stepSize} onChange={(e) => setStepSize(Number(e.target.value))} />
          </div>

          <div className="field">
            <span>Max итераций</span>
            <input type="number" value={maxIter} onChange={(e) => setMaxIter(Number(e.target.value))} />
          </div>

          <div className="field">
            <span>Tolerance</span>
            <input type="number" step="0.000001" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
          </div>
        </div>

        <div className="table-block">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>C</th>
                {Array.from({ length: size }, (_, j) => <th key={j}>СЗИ {j + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {costMatrix.map((row, i) => (
                <tr key={i}>
                  <th>ГИА {i + 1}</th>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <input type="number" value={cell} onChange={(e) => updateCostCell(i, j, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="constraint-panel">
          <div className="constraint-header">
            <strong>Ограничения D<sup>k</sup> · x ≤ b<sub>k</sub></strong>
            <button type="button" className="btn btn--ghost" onClick={addConstraint}>+ Добавить ограничение</button>
          </div>
          <div className="constraint-list">
            {constraints.map((constraint, cIdx) => (
              <div key={cIdx} className="constraint-item">
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>Ограничение {cIdx + 1}</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span>b =</span>
                    <input type="number" style={{ width: 60 }} value={bounds[cIdx]} onChange={(e) => updateBound(cIdx, e.target.value)} />
                    <span>λ₀ =</span>
                    <input type="number" style={{ width: 60 }} value={lambda0[cIdx]} onChange={(e) => updateLambda0(cIdx, e.target.value)} />
                    {constraints.length > 1 && (
                      <button className="btn--ghost" style={{ padding: '2px 8px' }} onClick={() => removeConstraint(cIdx)}>✕</button>
                    )}
                  </div>
                </div>
                <div className="constraint-matrix">
                  <table className="matrix-table">
                    <tbody>
                      {constraint.map((row, i) => (
                        <tr key={i}>
                          <th>{i + 1}</th>
                          {row.map((cell, j) => (
                            <td key={j}>
                              <input type="number" value={cell} onChange={(e) => updateConstraintCell(cIdx, i, j, e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: '0 0 auto' }}>
            <button type="button" className="btn btn--secondary" onClick={loadExample}>📋 Пример</button>
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <button type="button" className="btn btn--secondary" onClick={() => fileInputRef.current?.click()}>📂 Загрузить JSON</button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden-file-input" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) {
                try { await loadFromFile(file) }
                catch (err) { showToast(err.message) }
              }
            }} />
          </div>
          <div className="field" style={{ flex: '0 0 auto' }}>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>🗑 Очистить</button>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <button type="button" className="btn btn--primary" onClick={handleSolve} disabled={loading}>
              {loading ? '⏳ Решение...' : '🎯 Решить задачу'}
            </button>
          </div>
        </div>

        <div className="status-inline">Статус: {status}</div>
        {error && <div className="error-box">{error}</div>}
      </div>

      {isResultOpen && result && (
        <div className="modal-backdrop" onClick={() => setIsResultOpen(false)}>
          <div className="result-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Результаты расчёта</h2>
            <div><strong>Назначение:</strong> {result.assignment?.join(' → ')}</div>
            <div><strong>Значение целевой функции:</strong> {result.objective}</div>
            <div><strong>Значения ограничений:</strong> {result.constraints_values?.join(', ')}</div>
            <div><strong>Границы ограничений:</strong> {result.constraints_bounds?.join(', ')}</div>
            <div><strong>Финальные множители Лагранжа:</strong> {result.final_lambda?.join(', ')}</div>
            <details>
              <summary>Итерации ({result.iterations?.length})</summary>
              <div className="iteration-preview">
                {result.iterations?.map((iter, idx) => (
                  <div key={idx} className="iteration-item">
                    #{iter.iter}: λ={JSON.stringify(iter.lambda)} невязка={iter.violation_norm}
                  </div>
                ))}
              </div>
            </details>
            <pre>Матрица X*: {JSON.stringify(result.x_matrix, null, 2)}</pre>
            <button type="button" className="btn btn--primary" onClick={() => setIsResultOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App