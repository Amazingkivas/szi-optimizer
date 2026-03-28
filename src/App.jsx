import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const EXAMPLE = {
  assets: 3,
  protections: 5,
  lambda: 0.5,
  defuzzMethod: 'centroid',
  cFuzzy: [
    ['80', '90', '100'],
    ['70', '76', '82'],
    ['24', '30', '36'],
    ['30', '35', '41'],
    ['26', '30', '34'],
  ],
  dFuzzy: [
    ['30', '40', '50'],
    ['15', '20', '25'],
    ['10', '14', '18'],
    ['8', '12', '16'],
    ['6', '10', '14'],
  ],
  costs: [
    ['15', '10', '5', '4', '3'],
    ['27', '18', '12', '6', '6'],
    ['40', '25', '12', '11', '8'],
  ],
  budgets: ['20', '39', '48'],
}

const LAMBDA_PRESETS = [0, 0.25, 0.5, 0.75, 1]
const TRI_ROWS_PER_PAGE = 8
const COST_ROWS_PER_PAGE = 8
const COST_COLS_PER_PAGE = 6

const FALLBACK_DEFUZZ = [
  { value: 'centroid', label: 'Центроид: (a + b + c) / 3' },
  { value: 'yager', label: 'Индекс Ягера: (a + 2b + c) / 4' },
  { value: 'graded_mean', label: 'Интегральное среднее: (a + 4b + c) / 6' },
  { value: 'mode', label: 'Мода: b' },
]

const createMatrix = (rows, columns, fill = '') =>
  Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill))

const createVector = (size, fill = '') => Array.from({ length: size }, () => fill)

function normalizeTriangularRows(rows) {
  return rows.map((row) => row.map((value) => String(value)))
}

function createExampleState() {
  return {
    assets: EXAMPLE.assets,
    protections: EXAMPLE.protections,
    lambda: EXAMPLE.lambda,
    defuzzMethod: EXAMPLE.defuzzMethod,
    cFuzzy: normalizeTriangularRows(EXAMPLE.cFuzzy),
    dFuzzy: normalizeTriangularRows(EXAMPLE.dFuzzy),
    costs: EXAMPLE.costs.map((row) => row.map((value) => String(value))),
    budgets: EXAMPLE.budgets.map((value) => String(value)),
  }
}

function resizeTriangular(matrix, rows) {
  const next = matrix.map((row) => [...row])
  while (next.length < rows) next.push(['', '', ''])
  return next.slice(0, rows)
}

function resizeCosts(matrix, rows, columns) {
  const next = matrix.map((row) => [...row])
  while (next.length < rows) next.push(createVector(columns))
  return next.slice(0, rows).map((row) => {
    const current = [...row]
    while (current.length < columns) current.push('')
    return current.slice(0, columns)
  })
}

function resizeVector(vector, size) {
  const next = [...vector]
  while (next.length < size) next.push('')
  return next.slice(0, size)
}

function parseNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Поле «${label}» заполнено некорректно.`)
  }
  return parsed
}

function clampPage(page, totalPages) {
  if (totalPages <= 0) return 0
  return Math.max(0, Math.min(page, totalPages - 1))
}

function formatValue(value, precision = 3) {
  if (typeof value !== 'number') return String(value)
  return value.toFixed(precision)
}

function App() {
  const initial = useMemo(createExampleState, [])
  const toastTimerRef = useRef(null)

  const [assets, setAssets] = useState(initial.assets)
  const [protections, setProtections] = useState(initial.protections)
  const [assetsInput, setAssetsInput] = useState(String(initial.assets))
  const [protectionsInput, setProtectionsInput] = useState(String(initial.protections))
  const [lambdaValue, setLambdaValue] = useState(initial.lambda)
  const [defuzzMethod, setDefuzzMethod] = useState(initial.defuzzMethod)

  const [cFuzzy, setCFuzzy] = useState(initial.cFuzzy)
  const [dFuzzy, setDFuzzy] = useState(initial.dFuzzy)
  const [costs, setCosts] = useState(initial.costs)
  const [budgets, setBudgets] = useState(initial.budgets)

  const [defuzzOptions, setDefuzzOptions] = useState(FALLBACK_DEFUZZ)
  const [triPage, setTriPage] = useState(0)
  const [costRowPage, setCostRowPage] = useState(0)
  const [costColPage, setCostColPage] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [status, setStatus] = useState('Результат ещё не вычислен.')
  const [result, setResult] = useState(null)

  const showToast = (message) => {
    setToast(message)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 2600)
  }

  const applyDimensionValue = (field, rawValue) => {
    const parsed = Number(rawValue)
    if (!Number.isInteger(parsed) || parsed < 1) {
      showToast(`Поле ${field} должно быть целым числом не меньше 1.`)
      if (field === 'm') setAssetsInput(String(assets))
      if (field === 'n') setProtectionsInput(String(protections))
      return
    }

    if (field === 'm') {
      setAssets(parsed)
      setAssetsInput(String(parsed))
    }
    if (field === 'n') {
      setProtections(parsed)
      setProtectionsInput(String(parsed))
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    fetch('/api/meta')
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.defuzz_methods) && data.defuzz_methods.length) {
          setDefuzzOptions(data.defuzz_methods)
        }
      })
      .catch(() => {
        setDefuzzOptions(FALLBACK_DEFUZZ)
      })
  }, [])

  useEffect(() => {
    setCFuzzy((current) => resizeTriangular(current, protections))
    setDFuzzy((current) => resizeTriangular(current, protections))
    setCosts((current) => resizeCosts(current, assets, protections))
    setBudgets((current) => resizeVector(current, assets))
    setResult(null)
    setStatus('Параметры изменены. Выполните новый расчёт.')
  }, [assets, protections])

  const triTotalPages = Math.max(1, Math.ceil(protections / TRI_ROWS_PER_PAGE))
  const rowTotalPages = Math.max(1, Math.ceil(assets / COST_ROWS_PER_PAGE))
  const colTotalPages = Math.max(1, Math.ceil(protections / COST_COLS_PER_PAGE))

  useEffect(() => {
    setTriPage((page) => clampPage(page, triTotalPages))
    setCostRowPage((page) => clampPage(page, rowTotalPages))
    setCostColPage((page) => clampPage(page, colTotalPages))
  }, [triTotalPages, rowTotalPages, colTotalPages])

  const triStart = triPage * TRI_ROWS_PER_PAGE
  const triEnd = Math.min(protections, triStart + TRI_ROWS_PER_PAGE)

  const costRowStart = costRowPage * COST_ROWS_PER_PAGE
  const costRowEnd = Math.min(assets, costRowStart + COST_ROWS_PER_PAGE)
  const costColStart = costColPage * COST_COLS_PER_PAGE
  const costColEnd = Math.min(protections, costColStart + COST_COLS_PER_PAGE)

  const setExample = () => {
    const example = createExampleState()
    setAssets(example.assets)
    setProtections(example.protections)
    setAssetsInput(String(example.assets))
    setProtectionsInput(String(example.protections))
    setLambdaValue(example.lambda)
    setDefuzzMethod(example.defuzzMethod)
    setCFuzzy(example.cFuzzy)
    setDFuzzy(example.dFuzzy)
    setCosts(example.costs)
    setBudgets(example.budgets)
    setTriPage(0)
    setCostRowPage(0)
    setCostColPage(0)
    setError('')
    setResult(null)
    setStatus('Загружен пример. Можно запускать расчёт.')
  }

  const clearAll = () => {
    setCFuzzy(createMatrix(protections, 3))
    setDFuzzy(createMatrix(protections, 3))
    setCosts(createMatrix(assets, protections))
    setBudgets(createVector(assets))
    setError('')
    setResult(null)
    setStatus('Поля очищены.')
  }

  const updateTriCell = (setter, matrix, rowIndex, columnIndex, value) => {
    const next = matrix.map((row) => [...row])
    next[rowIndex][columnIndex] = value
    setter(next)
  }

  const updateCostCell = (rowIndex, columnIndex, value) => {
    const next = costs.map((row) => [...row])
    next[rowIndex][columnIndex] = value
    setCosts(next)
  }

  const updateBudgetCell = (rowIndex, value) => {
    const next = [...budgets]
    next[rowIndex] = value
    setBudgets(next)
  }

  const displayedSolution = result?.solution_original ?? Array.from({ length: protections }, () => 0)
  const visualRef = useRef(null)
  const [gridShape, setGridShape] = useState({ cols: 1, rows: 1 })

  const recalcGridShape = useCallback(() => {
    const node = visualRef.current
    const n = Math.max(1, displayedSolution.length)
    if (!node) {
      setGridShape({ cols: Math.ceil(Math.sqrt(n)), rows: Math.ceil(n / Math.ceil(Math.sqrt(n))) })
      return
    }

    const width = Math.max(1, node.clientWidth)
    const height = Math.max(1, node.clientHeight)

    let bestCols = 1
    let bestRows = n
    let bestScore = Number.POSITIVE_INFINITY
    let bestArea = 0

    for (let cols = 1; cols <= n; cols += 1) {
      const rows = Math.ceil(n / cols)
      const cellW = width / cols
      const cellH = height / rows
      const ratioPenalty = Math.abs(Math.log(cellW / Math.max(cellH, 1e-6)))
      const area = cellW * cellH

      if (ratioPenalty < bestScore - 1e-6 || (Math.abs(ratioPenalty - bestScore) <= 1e-6 && area > bestArea)) {
        bestScore = ratioPenalty
        bestArea = area
        bestCols = cols
        bestRows = rows
      }
    }

    setGridShape({ cols: bestCols, rows: bestRows })
  }, [displayedSolution.length])

  useEffect(() => {
    recalcGridShape()
    const node = visualRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => recalcGridShape())
    observer.observe(node)
    return () => observer.disconnect()
  }, [recalcGridShape])

  const handleSolve = async () => {
    try {
      setLoading(true)
      setError('')
      setStatus('Вычисление...')

      const payload = {
        lambda: lambdaValue,
        defuzz_method: defuzzMethod,
        c_fuzzy: cFuzzy.map((row, index) => row.map((value, col) => parseNumber(value, `c̃${index + 1}[${col + 1}]`))),
        d_fuzzy: dFuzzy.map((row, index) => row.map((value, col) => parseNumber(value, `d̃${index + 1}[${col + 1}]`))),
        cost_matrix: costs.map((row, rowIndex) => row.map((value, colIndex) => parseNumber(value, `A[${rowIndex + 1}, ${colIndex + 1}]`))),
        budgets: budgets.map((value, index) => parseNumber(value, `b${index + 1}`)),
      }

      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Сервер не смог решить задачу.')
      }

      setResult(data)
      setStatus('Расчёт завершён.')
    } catch (solveError) {
      setError(solveError.message)
      setStatus('Ошибка расчёта.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-screen">
      {toast ? <div className="toast">{toast}</div> : null}

      <section className="panel config-panel">
        <div className="controls-row">
          <label className="field">
            <span>m (ГИА)</span>
            <input
              type="number"
              min="1"
              value={assetsInput}
              onChange={(event) => setAssetsInput(event.target.value)}
              onBlur={(event) => applyDimensionValue('m', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  applyDimensionValue('m', event.currentTarget.value)
                  event.currentTarget.blur()
                }
              }}
            />
          </label>

          <label className="field">
            <span>n (СЗИ)</span>
            <input
              type="number"
              min="1"
              value={protectionsInput}
              onChange={(event) => setProtectionsInput(event.target.value)}
              onBlur={(event) => applyDimensionValue('n', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  applyDimensionValue('n', event.currentTarget.value)
                  event.currentTarget.blur()
                }
              }}
            />
          </label>

          <label className="field field--wide">
            <span>Метод дефаззификации</span>
            <select value={defuzzMethod} onChange={(event) => setDefuzzMethod(event.target.value)}>
              {defuzzOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field field--lambda">
            <span>λ = {lambdaValue.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={lambdaValue}
              onChange={(event) => setLambdaValue(Number(event.target.value))}
            />
            <div className="preset-row">
              {LAMBDA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={preset === lambdaValue ? 'preset preset--active' : 'preset'}
                  onClick={() => setLambdaValue(preset)}
                >
                  {preset.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div className="field field--actions">
            <button type="button" className="btn btn--secondary" onClick={setExample}>
              Пример
            </button>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>
              Очистить
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSolve} disabled={loading}>
              {loading ? 'Считаю...' : 'Рассчитать'}
            </button>
          </div>
        </div>

        <div className="tables-row">
          <div className="table-block">
            <TableTitle title="c̃j" subtitle={`${triStart + 1}-${triEnd} из ${protections}`} />
            <TriangularTable
              rowPrefix="СЗИ"
              start={triStart}
              end={triEnd}
              values={cFuzzy}
              onChange={(rowIndex, colIndex, value) => updateTriCell(setCFuzzy, cFuzzy, rowIndex, colIndex, value)}
            />
          </div>

          <div className="table-block">
            <TableTitle title="d̃j" subtitle={`${triStart + 1}-${triEnd} из ${protections}`} />
            <TriangularTable
              rowPrefix="СЗИ"
              start={triStart}
              end={triEnd}
              values={dFuzzy}
              onChange={(rowIndex, colIndex, value) => updateTriCell(setDFuzzy, dFuzzy, rowIndex, colIndex, value)}
            />
          </div>

          <div className="table-block table-block--wide">
            <TableTitle
              title="A и b"
              subtitle={`строки ${costRowStart + 1}-${costRowEnd}/${assets}, столбцы ${costColStart + 1}-${costColEnd}/${protections}`}
            />
            <CostTable
              rowStart={costRowStart}
              rowEnd={costRowEnd}
              colStart={costColStart}
              colEnd={costColEnd}
              values={costs}
              budgets={budgets}
              onCellChange={updateCostCell}
              onBudgetChange={updateBudgetCell}
            />
          </div>
        </div>

        <div className="pagers-row">
          <Pager
            label="Страницы c̃j/d̃j"
            page={triPage}
            total={triTotalPages}
            onPrev={() => setTriPage((page) => clampPage(page - 1, triTotalPages))}
            onNext={() => setTriPage((page) => clampPage(page + 1, triTotalPages))}
          />
          <Pager
            label="Строки матрицы A"
            page={costRowPage}
            total={rowTotalPages}
            onPrev={() => setCostRowPage((page) => clampPage(page - 1, rowTotalPages))}
            onNext={() => setCostRowPage((page) => clampPage(page + 1, rowTotalPages))}
          />
          <Pager
            label="Столбцы матрицы A"
            page={costColPage}
            total={colTotalPages}
            onPrev={() => setCostColPage((page) => clampPage(page - 1, colTotalPages))}
            onNext={() => setCostColPage((page) => clampPage(page + 1, colTotalPages))}
          />
        </div>
      </section>

      <section className="panel result-panel">
        <h2>Результаты</h2>
        <div className="status-box">{status}</div>

        {result ? (
          <div className="result-solution">
            <div><strong>x*</strong> = ({result.solution_original.join(', ')})</div>
            <div><strong>Выбранные СЗИ:</strong> {result.selected_original_indices.length ? result.selected_original_indices.join(', ') : 'нет выбранных СЗИ'}</div>
            <div><strong>F(x*) =</strong> {formatValue(result.objective, 6)}</div>
          </div>
        ) : (
          <div className="result-empty">Ожидание расчёта.</div>
        )}

        <div className="szi-visual" ref={visualRef} style={{ '--szi-cols': gridShape.cols, '--szi-rows': gridShape.rows }}>
          {displayedSolution.map((value, index) => (
            <div key={index} className={value === 1 ? 'szi-tile szi-tile--selected' : 'szi-tile'} title={`СЗИ ${index + 1}: ${value === 1 ? 'выбрано' : 'не выбрано'}`}>
              {index + 1}
            </div>
          ))}
        </div>

        {error ? <div className="error-box">{error}</div> : null}
      </section>
    </div>
  )
}

function TableTitle({ title, subtitle }) {
  return (
    <div className="table-title">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  )
}

function TriangularTable({ rowPrefix, start, end, values, onChange }) {
  return (
    <table className="matrix-table">
      <thead>
        <tr>
          <th>{rowPrefix}</th>
          <th>a</th>
          <th>b</th>
          <th>c</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: end - start }, (_, offset) => {
          const rowIndex = start + offset
          return (
            <tr key={rowIndex}>
              <th>{rowPrefix} {rowIndex + 1}</th>
              {[0, 1, 2].map((col) => (
                <td key={col}>
                  <input
                    type="number"
                    step="0.001"
                    value={values[rowIndex]?.[col] ?? ''}
                    onChange={(event) => onChange(rowIndex, col, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CostTable({ rowStart, rowEnd, colStart, colEnd, values, budgets, onCellChange, onBudgetChange }) {
  const columnIndices = Array.from({ length: colEnd - colStart }, (_, offset) => colStart + offset)

  return (
    <table className="matrix-table">
      <thead>
        <tr>
          <th>ГИА</th>
          {columnIndices.map((colIndex) => (
            <th key={colIndex}>СЗИ {colIndex + 1}</th>
          ))}
          <th>b</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowEnd - rowStart }, (_, offset) => {
          const rowIndex = rowStart + offset
          return (
            <tr key={rowIndex}>
              <th>ГИА {rowIndex + 1}</th>
              {columnIndices.map((colIndex) => (
                <td key={`${rowIndex}-${colIndex}`}>
                  <input
                    type="number"
                    step="0.001"
                    value={values[rowIndex]?.[colIndex] ?? ''}
                    onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                  />
                </td>
              ))}
              <td>
                <input
                  type="number"
                  step="0.001"
                  value={budgets[rowIndex] ?? ''}
                  onChange={(event) => onBudgetChange(rowIndex, event.target.value)}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Pager({ label, page, total, onPrev, onNext }) {
  return (
    <div className="pager">
      <span>{label}</span>
      <div className="pager-controls">
        <button type="button" onClick={onPrev} disabled={page <= 0}>
          ←
        </button>
        <strong>{page + 1}/{total}</strong>
        <button type="button" onClick={onNext} disabled={page >= total - 1}>
          →
        </button>
      </div>
    </div>
  )
}

export default App
