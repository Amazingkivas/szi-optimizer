import { useEffect, useMemo, useState } from 'react'
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

function openResultWindow(result) {
  const selected = result.selected_original_indices.length
    ? result.selected_original_indices.join(', ')
    : 'нет выбранных СЗИ'

  const vector = result.solution_original.join(', ')
  const popup = window.open('', 'szi_result_window', 'width=760,height=540,menubar=no,toolbar=no,location=no')
  if (!popup) {
    return false
  }

  popup.document.title = 'Оптимальное решение'
  popup.document.body.innerHTML = `
    <main style="margin:0;min-height:100vh;background:#070f1d;color:#e7f0ff;font-family:Inter,Segoe UI,sans-serif;display:grid;place-items:center;padding:20px;box-sizing:border-box;">
      <section style="width:min(720px,100%);background:rgba(16,27,48,0.92);border:1px solid rgba(114,160,255,0.28);border-radius:20px;padding:24px;box-shadow:0 16px 40px rgba(0,0,0,0.35);">
        <h1 style="margin:0 0 16px 0;font-size:24px;">Оптимальное решение</h1>
        <div style="display:grid;gap:14px;font-size:18px;line-height:1.35;">
          <div><strong>x*</strong> = (${vector})</div>
          <div><strong>Выбранные СЗИ</strong>: ${selected}</div>
          <div><strong>F(x*)</strong> = ${formatValue(result.objective, 6)}</div>
        </div>
      </section>
    </main>
  `
  popup.document.body.style.margin = '0'
  popup.focus()
  return true
}

function App() {
  const initial = useMemo(createExampleState, [])

  const [assets, setAssets] = useState(initial.assets)
  const [protections, setProtections] = useState(initial.protections)
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
  const [status, setStatus] = useState('Результат ещё не вычислен.')
  const [lastResult, setLastResult] = useState(null)

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
    setLastResult(null)
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
    setLastResult(null)
    setStatus('Загружен пример. Можно запускать расчёт.')
  }

  const clearAll = () => {
    setCFuzzy(createMatrix(protections, 3))
    setDFuzzy(createMatrix(protections, 3))
    setCosts(createMatrix(assets, protections))
    setBudgets(createVector(assets))
    setError('')
    setLastResult(null)
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

  const openLastResult = () => {
    if (!lastResult) return
    const ok = openResultWindow(lastResult)
    if (!ok) {
      setError('Браузер заблокировал всплывающее окно результата. Разрешите pop-up для этого сайта.')
    }
  }

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

      setLastResult(data)
      const popupOpened = openResultWindow(data)
      setStatus(
        popupOpened
          ? 'Оптимальное решение открыто в отдельном окне.'
          : 'Решение найдено, но окно не открылось (поп-ап заблокирован).'
      )
    } catch (solveError) {
      setError(solveError.message)
      setStatus('Ошибка расчёта.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-screen">
      <section className="panel config-panel">
        <div className="controls-row">
          <label className="field">
            <span>m (ГИА)</span>
            <input
              type="number"
              min="1"
              value={assets}
              onChange={(event) => setAssets(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>

          <label className="field">
            <span>n (СЗИ)</span>
            <input
              type="number"
              min="1"
              value={protections}
              onChange={(event) => setProtections(Math.max(1, Number(event.target.value) || 1))}
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
        <p>Оптимальное решение открывается в отдельном окне без дополнительной информации.</p>
        <div className="status-box">{status}</div>
        {lastResult ? (
          <button type="button" className="btn btn--primary" onClick={openLastResult}>
            Открыть окно результата
          </button>
        ) : null}
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
