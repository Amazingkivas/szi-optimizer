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

const lambdaPresets = [0, 0.25, 0.5, 0.75, 1]

const createMatrix = (rows, columns, fill = '') =>
  Array.from({ length: rows }, () => Array.from({ length: columns }, () => fill))

function normalizeTriangularRow(row) {
  return row.map((value) => (value === '' ? '' : String(value)))
}

function createExampleState() {
  return {
    assets: EXAMPLE.assets,
    protections: EXAMPLE.protections,
    lambda: EXAMPLE.lambda,
    defuzzMethod: EXAMPLE.defuzzMethod,
    cFuzzy: EXAMPLE.cFuzzy.map(normalizeTriangularRow),
    dFuzzy: EXAMPLE.dFuzzy.map(normalizeTriangularRow),
    costs: EXAMPLE.costs.map((row) => [...row]),
    budgets: [...EXAMPLE.budgets],
  }
}

function resizeTriangular(matrix, rows) {
  const next = matrix.map((row) => [...row])
  while (next.length < rows) next.push(['', '', ''])
  return next.slice(0, rows)
}

function resizeCosts(matrix, rows, columns) {
  const next = matrix.map((row) => [...row])
  while (next.length < rows) next.push(Array.from({ length: columns }, () => ''))
  return next.slice(0, rows).map((row) => {
    const normalized = [...row]
    while (normalized.length < columns) normalized.push('')
    return normalized.slice(0, columns)
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
  const [defuzzOptions, setDefuzzOptions] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/meta')
      .then((response) => response.json())
      .then((data) => setDefuzzOptions(data.defuzz_methods ?? []))
      .catch(() => {
        setDefuzzOptions([
          { value: 'centroid', label: 'Центроид: (a + b + c) / 3' },
          { value: 'yager', label: 'Индекс Ягера: (a + 2b + c) / 4' },
          { value: 'graded_mean', label: 'Интегральное среднее: (a + 4b + c) / 6' },
          { value: 'mode', label: 'Мода: b' },
        ])
      })
  }, [])

  useEffect(() => {
    setCFuzzy((current) => resizeTriangular(current, protections))
    setDFuzzy((current) => resizeTriangular(current, protections))
    setCosts((current) => resizeCosts(current, assets, protections))
    setBudgets((current) => resizeVector(current, assets))
    setResult(null)
  }, [assets, protections])

  const lambdaPercent = Math.round(lambdaValue * 100)

  const updateTriangularCell = (setter, matrix, rowIndex, colIndex, value) => {
    const next = matrix.map((row) => [...row])
    next[rowIndex][colIndex] = value
    setter(next)
  }

  const updateCostCell = (rowIndex, colIndex, value) => {
    const next = costs.map((row) => [...row])
    next[rowIndex][colIndex] = value
    setCosts(next)
  }

  const setExample = () => {
    const exampleState = createExampleState()
    setAssets(exampleState.assets)
    setProtections(exampleState.protections)
    setLambdaValue(exampleState.lambda)
    setDefuzzMethod(exampleState.defuzzMethod)
    setCFuzzy(exampleState.cFuzzy)
    setDFuzzy(exampleState.dFuzzy)
    setCosts(exampleState.costs)
    setBudgets(exampleState.budgets)
    setResult(null)
    setError('')
  }

  const clearAll = () => {
    setResult(null)
    setError('')
    setCFuzzy(createMatrix(protections, 3))
    setDFuzzy(createMatrix(protections, 3))
    setCosts(createMatrix(assets, protections))
    setBudgets(Array.from({ length: assets }, () => ''))
  }

  const handleSolve = async () => {
    try {
      setLoading(true)
      setError('')
      setResult(null)

      const payload = {
        lambda: lambdaValue,
        defuzz_method: defuzzMethod,
        c_fuzzy: cFuzzy.map((row, index) => row.map((value, col) => parseNumber(value, `c̃${index + 1}[${col + 1}]`))),
        d_fuzzy: dFuzzy.map((row, index) => row.map((value, col) => parseNumber(value, `d̃${index + 1}[${col + 1}]`))),
        cost_matrix: costs.map((row, rowIndex) => row.map((value, columnIndex) => parseNumber(value, `A[${rowIndex + 1}, ${columnIndex + 1}]`))),
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
    } catch (solveError) {
      setError(solveError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <div>
          <span className="eyebrow">Система выбора СЗИ</span>
          <h1>Лаконичный интерфейс для нечёткой задачи внедрения СЗИ</h1>
          <p>
            Вводите все параметры по ячейкам, выбирайте метод дефаззификации, задавайте λ тремя способами
            и сразу получайте только оптимальное решение.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="secondary-button" onClick={setExample}>
            Загрузить пример
          </button>
          <button type="button" className="ghost-button" onClick={clearAll}>
            Очистить форму
          </button>
        </div>
      </header>

      <main className="workspace-grid">
        <section className="panel panel--wide">
          <div className="panel-header">
            <div>
              <h2>Настройка задачи</h2>
              <p>Горизонтальная компоновка подготовлена для комфортного ввода матриц и нечётких чисел.</p>
            </div>
          </div>

          <div className="control-grid">
            <label className="field-card">
              <span>Число ГИА, m</span>
              <input
                type="number"
                min="1"
                value={assets}
                onChange={(event) => setAssets(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <label className="field-card">
              <span>Число СЗИ, n</span>
              <input
                type="number"
                min="1"
                value={protections}
                onChange={(event) => setProtections(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <label className="field-card field-card--select">
              <span>Метод дефаззификации</span>
              <select value={defuzzMethod} onChange={(event) => setDefuzzMethod(event.target.value)}>
                {defuzzOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lambda-panel">
            <div>
              <h3>Параметр λ</h3>
              <p>Доступны три способа задания: ползунок, точное число и готовые пресеты.</p>
            </div>
            <div className="lambda-controls">
              <label className="slider-card">
                <span>Ползунок λ</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={lambdaValue}
                  onChange={(event) => setLambdaValue(Number(event.target.value))}
                />
              </label>
              <label className="field-card field-card--compact">
                <span>Точное значение</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={lambdaValue}
                  onChange={(event) => setLambdaValue(Math.min(1, Math.max(0, Number(event.target.value) || 0)))}
                />
              </label>
              <div className="preset-card">
                <span>Быстрые варианты</span>
                <div className="preset-list">
                  {lambdaPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={preset === lambdaValue ? 'preset-button preset-button--active' : 'preset-button'}
                      onClick={() => setLambdaValue(preset)}
                    >
                      {preset.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lambda-badge">λ = {lambdaValue.toFixed(2)} · {lambdaPercent}%</div>
            </div>
          </div>

          <div className="tables-stack">
            <TableCard
              title="Нечёткие параметры c̃j = (a, b, c)"
              subtitle="Время взлома каждого СЗИ задаётся тройкой чисел."
            >
              <TriangularInputTable
                rows={protections}
                values={cFuzzy}
                onChange={(rowIndex, colIndex, value) => updateTriangularCell(setCFuzzy, cFuzzy, rowIndex, colIndex, value)}
                rowPrefix="СЗИ"
              />
            </TableCard>

            <TableCard
              title="Нечёткие параметры d̃j = (a, b, c)"
              subtitle="Время реакции отдела безопасности; допустимы нули."
            >
              <TriangularInputTable
                rows={protections}
                values={dFuzzy}
                onChange={(rowIndex, colIndex, value) => updateTriangularCell(setDFuzzy, dFuzzy, rowIndex, colIndex, value)}
                rowPrefix="СЗИ"
              />
            </TableCard>

            <TableCard
              title="Матрица стоимостей A и бюджеты b"
              subtitle="Каждое значение вводится в отдельную ячейку, без строк через пробел."
            >
              <CostTable
                assets={assets}
                protections={protections}
                values={costs}
                budgets={budgets}
                onCellChange={updateCostCell}
                onBudgetChange={(index, value) => {
                  const next = [...budgets]
                  next[index] = value
                  setBudgets(next)
                }}
              />
            </TableCard>
          </div>

          {error ? <div className="error-box">{error}</div> : null}

          <div className="solve-bar">
            <button type="button" className="primary-button" onClick={handleSolve} disabled={loading}>
              {loading ? 'Решение...' : 'Рассчитать оптимальное решение'}
            </button>
          </div>
        </section>

        <aside className="panel panel--result">
          <div className="panel-header">
            <div>
              <h2>Результат</h2>
              <p>Показывается только итог после дефаззификации и решения чёткой задачи.</p>
            </div>
          </div>

          {result ? (
            <div className="result-stack">
              <div className="metric-grid">
                <MetricCard label="Оптимальная свёртка F(x*)" value={result.objective} accent />
                <MetricCard label="Аддитивный критерий F1(x*)" value={result.f1} />
                <MetricCard label="Максиминный критерий F2(x*)" value={result.f2} />
                <MetricCard label="Метод дефаззификации" value={result.defuzz_method_label} />
              </div>

              <ResultSection title="Чёткие параметры после дефаззификации">
                <ResultVector label="c (в исходном порядке)" values={result.c_crisp_original} />
                <ResultVector label="d (в исходном порядке)" values={result.d_crisp_original} />
              </ResultSection>

              <ResultSection title="Сортировка по невозрастанию d">
                <p className="result-note">
                  Индексы СЗИ после сортировки: {result.sorted_order.join(', ')}.
                </p>
                <ResultVector label="c (отсортировано)" values={result.c_crisp_sorted} />
                <ResultVector label="d (отсортировано)" values={result.d_crisp_sorted} />
              </ResultSection>

              <ResultSection title="Оптимальный выбор СЗИ">
                <ResultVector label="x* в исходном порядке" values={result.solution_original} integer />
                <ResultVector label="x* в отсортированном порядке" values={result.solution_sorted} integer />
                <p className="result-note">
                  Выбранные СЗИ в исходной нумерации: {result.selected_original_indices.length ? result.selected_original_indices.join(', ') : 'не выбрано ни одного'}.
                </p>
              </ResultSection>
            </div>
          ) : (
            <div className="empty-result">
              Заполните таблицы слева и нажмите «Рассчитать оптимальное решение», чтобы увидеть чёткие c, d и оптимальный вектор x*.
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function TableCard({ title, subtitle, children }) {
  return (
    <section className="table-card">
      <div className="table-card__header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function TriangularInputTable({ rows, values, onChange, rowPrefix }) {
  return (
    <div className="table-wrap">
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
          {Array.from({ length: rows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <th>{rowPrefix} {rowIndex + 1}</th>
              {[0, 1, 2].map((columnIndex) => (
                <td key={columnIndex}>
                  <input
                    type="number"
                    step="0.001"
                    value={values[rowIndex]?.[columnIndex] ?? ''}
                    onChange={(event) => onChange(rowIndex, columnIndex, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CostTable({ assets, protections, values, budgets, onCellChange, onBudgetChange }) {
  return (
    <div className="table-wrap">
      <table className="matrix-table matrix-table--wide">
        <thead>
          <tr>
            <th>ГИА \ СЗИ</th>
            {Array.from({ length: protections }, (_, columnIndex) => (
              <th key={columnIndex}>СЗИ {columnIndex + 1}</th>
            ))}
            <th>b</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: assets }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <th>ГИА {rowIndex + 1}</th>
              {Array.from({ length: protections }, (_, columnIndex) => (
                <td key={columnIndex}>
                  <input
                    type="number"
                    step="0.001"
                    value={values[rowIndex]?.[columnIndex] ?? ''}
                    onChange={(event) => onCellChange(rowIndex, columnIndex, event.target.value)}
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
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MetricCard({ label, value, accent = false }) {
  return (
    <div className={accent ? 'metric-card metric-card--accent' : 'metric-card'}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? value.toFixed(3) : value}</strong>
    </div>
  )
}

function ResultSection({ title, children }) {
  return (
    <section className="result-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function ResultVector({ label, values, integer = false }) {
  return (
    <div className="vector-block">
      <span>{label}</span>
      <div className="vector-list">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="vector-chip">
            <em>{index + 1}</em>
            <strong>{integer ? value : Number(value).toFixed(3)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
