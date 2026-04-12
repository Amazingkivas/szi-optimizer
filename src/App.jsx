import { useEffect, useMemo, useRef, useState } from 'react'
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

const FALLBACK_DEFUZZ = [
  { value: 'centroid', label: 'Центроид: (a + b + c) / 3' },
  { value: 'yager', label: 'Индекс Ягера: (a + 2b + c) / 4' },
  { value: 'graded_mean', label: 'Интегральное среднее: (a + 4b + c) / 6' },
  { value: 'mode', label: 'Мода: b' },
]

const UI_TEXT = {
  ru: {
    noResult: 'Результат ещё не вычислен.',
    paramsChanged: 'Параметры изменены. Выполните новый расчёт.',
    loaded: 'Данные из файла успешно загружены.',
    cleared: 'Поля очищены.',
    calculating: 'Вычисление...',
    done: 'Расчёт завершён.',
    failed: 'Ошибка расчёта.',
    solve: 'Рассчитать',
    solving: 'Считаю...',
    loadFile: 'Загрузить файл',
    clear: 'Очистить',
    method: 'Метод дефаззификации',
    selected: 'Выбранные СЗИ:',
    noSelected: 'нет выбранных СЗИ',
    menu: 'Настройки',
    theme: 'Тема',
    language: 'Язык',
    dark: 'Тёмная',
    light: 'Светлая',
    ocean: 'Океан',
    violet: 'Фиолетовая',
    russian: 'Русский',
    english: 'English',
    status: 'Статус',
    cSet: 'Набор c̃',
    dSet: 'Набор d̃',
    resultTitle: 'Результаты расчёта',
    close: 'Закрыть',
    cCrisp: 'Чёткие c',
    dCrisp: 'Чёткие d',
  },
  en: {
    noResult: 'No calculation result yet.',
    paramsChanged: 'Parameters changed. Run calculation again.',
    loaded: 'Data loaded from file.',
    cleared: 'Fields were cleared.',
    calculating: 'Calculating...',
    done: 'Calculation finished.',
    failed: 'Calculation failed.',
    solve: 'Calculate',
    solving: 'Calculating...',
    loadFile: 'Load file',
    clear: 'Clear',
    method: 'Defuzzification method',
    selected: 'Selected controls:',
    noSelected: 'none',
    menu: 'Settings',
    theme: 'Theme',
    language: 'Language',
    dark: 'Dark',
    light: 'Light',
    ocean: 'Ocean',
    violet: 'Violet',
    russian: 'Русский',
    english: 'English',
    status: 'Status',
    cSet: 'c̃ set',
    dSet: 'd̃ set',
    resultTitle: 'Calculation results',
    close: 'Close',
    cCrisp: 'Crisp c',
    dCrisp: 'Crisp d',
  },
}

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

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) throw new Error('Обнаружены пустые поля. Заполните все значения.')
  const raw = typeof value === 'string' ? value.trim() : String(value)
  if (raw === '') throw new Error('Обнаружены пустые поля. Заполните все значения.')
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error('Есть некорректные числовые значения. Проверьте ввод.')
  return parsed
}

function formatValue(value, precision = 3) {
  if (typeof value !== 'number') return String(value)
  return value.toFixed(precision)
}

function App() {
  const initial = useMemo(createExampleState, [])
  const toastTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  const [assets, setAssets] = useState(initial.assets)
  const [protections, setProtections] = useState(initial.protections)
  const [assetsInput, setAssetsInput] = useState(String(initial.assets))
  const [protectionsInput, setProtectionsInput] = useState(String(initial.protections))
  const [lambdaValue, setLambdaValue] = useState(initial.lambda)
  const [lambdaInput, setLambdaInput] = useState(String(initial.lambda))
  const [defuzzMethod, setDefuzzMethod] = useState(initial.defuzzMethod)

  const [cFuzzy, setCFuzzy] = useState(initial.cFuzzy)
  const [dFuzzy, setDFuzzy] = useState(initial.dFuzzy)
  const [costs, setCosts] = useState(initial.costs)
  const [budgets, setBudgets] = useState(initial.budgets)

  const [defuzzOptions, setDefuzzOptions] = useState(FALLBACK_DEFUZZ)
  const [cIndex, setCIndex] = useState(0)
  const [dIndex, setDIndex] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [language, setLanguage] = useState('ru')
  const [theme, setTheme] = useState('dark')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const t = UI_TEXT[language]
  const [status, setStatus] = useState(UI_TEXT.ru.noResult)
  const [result, setResult] = useState(null)
  const [isResultOpen, setIsResultOpen] = useState(false)

  const showToast = (message) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
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

  const applyLambdaValue = (rawValue) => {
    const normalized = String(rawValue).replace(',', '.').trim()
    if (normalized === '') {
      setLambdaInput(String(lambdaValue))
      return
    }

    const parsed = Number(normalized)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      showToast('λ должна принадлежать диапазону [0, 1].')
      setLambdaInput(String(lambdaValue))
      return
    }

    setLambdaValue(parsed)
    setLambdaInput(normalized)
  }

  useEffect(() => () => toastTimerRef.current && clearTimeout(toastTimerRef.current), [])

  useEffect(() => {
    fetch('/api/meta')
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.defuzz_methods) && data.defuzz_methods.length) setDefuzzOptions(data.defuzz_methods)
      })
      .catch(() => setDefuzzOptions(FALLBACK_DEFUZZ))
  }, [])

  useEffect(() => {
    setCFuzzy((current) => resizeTriangular(current, protections))
    setDFuzzy((current) => resizeTriangular(current, protections))
    setCosts((current) => resizeCosts(current, assets, protections))
    setBudgets((current) => resizeVector(current, assets))
    setCIndex((index) => Math.max(0, Math.min(index, protections - 1)))
    setDIndex((index) => Math.max(0, Math.min(index, protections - 1)))
    setResult(null)
    setIsResultOpen(false)
    setStatus(t.paramsChanged)
  }, [assets, protections, t.paramsChanged])

  useEffect(() => {
    setLambdaInput(String(lambdaValue))
  }, [lambdaValue])

  const normalizeUploadedMatrix = (matrix, rowCount, colCount, label) => {
    if (!Array.isArray(matrix) || matrix.length !== rowCount) throw new Error(`Размерности в файле не соответствуют ожидаемому формату для ${label}.`)
    return matrix.map((row) => {
      if (!Array.isArray(row) || row.length !== colCount) throw new Error(`Размерности в файле не соответствуют ожидаемому формату для ${label}.`)
      return row.map((value) => String(value))
    })
  }

  const loadFromConfigFile = async (file) => {
    const text = await file.text()
    let config
    try {
      config = JSON.parse(text)
    } catch {
      throw new Error('Файл имеет некорректный JSON-формат.')
    }

    const nextAssets = Number(config.assets)
    const nextProtections = Number(config.protections)
    if (!Number.isInteger(nextAssets) || !Number.isInteger(nextProtections) || nextAssets < 1 || nextProtections < 1) {
      throw new Error('В файле должны быть корректные целые значения размерностей m и n.')
    }

    const cUploaded = normalizeUploadedMatrix(config.cFuzzy, nextProtections, 3, 'c̃')
    const dUploaded = normalizeUploadedMatrix(config.dFuzzy, nextProtections, 3, 'd̃')
    const costsUploaded = normalizeUploadedMatrix(config.costs, nextAssets, nextProtections, 'A')

    if (!Array.isArray(config.budgets) || config.budgets.length !== nextAssets) throw new Error('Размерности в файле не соответствуют ожидаемому формату для b.')

    const lambdaUploaded = Number(config.lambda)
    if (!Number.isFinite(lambdaUploaded) || lambdaUploaded < 0 || lambdaUploaded > 1) throw new Error('В файле должно быть корректное значение λ в диапазоне [0, 1].')

    const methodUploaded = String(config.defuzzMethod)
    const methodExists = defuzzOptions.some((option) => option.value === methodUploaded)
    if (!methodExists) throw new Error('Метод дефаззификации в файле не поддерживается.')

    setAssets(nextAssets)
    setProtections(nextProtections)
    setAssetsInput(String(nextAssets))
    setProtectionsInput(String(nextProtections))
    setLambdaValue(lambdaUploaded)
    setDefuzzMethod(methodUploaded)
    setCFuzzy(cUploaded)
    setDFuzzy(dUploaded)
    setCosts(costsUploaded)
    setBudgets(config.budgets.map((value) => String(value)))
    setCIndex(0)
    setDIndex(0)
    setError('')
    setResult(null)
    setIsResultOpen(false)
    setStatus(t.loaded)
  }

  const clearAll = () => {
    setCFuzzy(createMatrix(protections, 3))
    setDFuzzy(createMatrix(protections, 3))
    setCosts(createMatrix(assets, protections))
    setBudgets(createVector(assets))
    setError('')
    setResult(null)
    setIsResultOpen(false)
    setStatus(t.cleared)
  }

  const handleSolve = async () => {
    try {
      setLoading(true)
      setError('')
      setStatus(t.calculating)
      setToast('')

      const payload = {
        lambda: lambdaValue,
        defuzz_method: defuzzMethod,
        c_fuzzy: cFuzzy.map((row) => row.map((value) => parseNumber(value))),
        d_fuzzy: dFuzzy.map((row) => row.map((value) => parseNumber(value))),
        cost_matrix: costs.map((row) => row.map((value) => parseNumber(value))),
        budgets: budgets.map((value) => parseNumber(value)),
      }

      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        const message = data.error || 'Сервер не смог решить задачу.'
        showToast(message)
        throw new Error(message)
      }

      setResult(data)
      setIsResultOpen(true)
      setStatus(t.done)
    } catch (solveError) {
      showToast(solveError.message)
      setError(solveError.message)
      setStatus(t.failed)
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="app-screen" data-theme={theme}>
      {toast ? <div className="toast">{toast}</div> : null}

      <div className="top-menu">
        <button type="button" className="btn btn--ghost top-menu__trigger" onClick={() => setIsMenuOpen((open) => !open)}>☰</button>
        {isMenuOpen ? (
          <div className="top-menu__dropdown">
            <strong>{t.menu}</strong>
            <label>
              <span>{t.theme}</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="dark">{t.dark}</option>
                <option value="light">{t.light}</option>
                <option value="ocean">{t.ocean}</option>
                <option value="violet">{t.violet}</option>
              </select>
            </label>
            <label>
              <span>{t.language}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="ru">{t.russian}</option>
                <option value="en">{t.english}</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

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
              onKeyDown={(event) => event.key === 'Enter' && (applyDimensionValue('m', event.currentTarget.value), event.currentTarget.blur())}
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
              onKeyDown={(event) => event.key === 'Enter' && (applyDimensionValue('n', event.currentTarget.value), event.currentTarget.blur())}
            />
          </label>

          <label className="field field--wide">
            <span>{t.method}</span>
            <select value={defuzzMethod} onChange={(event) => setDefuzzMethod(event.target.value)}>
              {defuzzOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
            </select>
          </label>

          <div className="field field--lambda">
            <span>λ = {lambdaValue.toFixed(2)}</span>
            <div className="lambda-inputs">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={lambdaValue}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setLambdaValue(value)
                  setLambdaInput(String(value))
                }}
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={lambdaInput}
                onChange={(event) => setLambdaInput(event.target.value)}
                onBlur={(event) => applyLambdaValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyLambdaValue(event.currentTarget.value)
                    event.currentTarget.blur()
                  }
                }}
              />
            </div>
            <div className="preset-row">
              {LAMBDA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={preset === lambdaValue ? 'preset preset--active' : 'preset'}
                  onClick={() => {
                    setLambdaValue(preset)
                    setLambdaInput(String(preset))
                  }}
                >
                  {preset.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div className="field field--actions">
            <button type="button" className="btn btn--secondary" onClick={() => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() } }}>{t.loadFile}</button>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>{t.clear}</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden-file-input"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                try {
                  await loadFromConfigFile(file)
                } catch (loadError) {
                  showToast(loadError.message)
                  setError(loadError.message)
                }
              }}
            />
            <button type="button" className="btn btn--primary" onClick={handleSolve} disabled={loading}>{loading ? t.solving : t.solve}</button>
          </div>
        </div>

        <div className="single-sets-row">
          <SingleTriEditor
            title={t.cSet}
            index={cIndex}
            total={protections}
            rowValues={cFuzzy[cIndex] ?? ['', '', '']}
            onPrev={() => setCIndex((index) => Math.max(0, index - 1))}
            onNext={() => setCIndex((index) => Math.min(protections - 1, index + 1))}
            onChange={(colIndex, value) => updateTriCell(setCFuzzy, cFuzzy, cIndex, colIndex, value)}
          />
          <SingleTriEditor
            title={t.dSet}
            index={dIndex}
            total={protections}
            rowValues={dFuzzy[dIndex] ?? ['', '', '']}
            onPrev={() => setDIndex((index) => Math.max(0, index - 1))}
            onNext={() => setDIndex((index) => Math.min(protections - 1, index + 1))}
            onChange={(colIndex, value) => updateTriCell(setDFuzzy, dFuzzy, dIndex, colIndex, value)}
          />
        </div>

        <div className="table-block table-block--grow">
          <CostTable
            values={costs}
            budgets={budgets}
            onCellChange={updateCostCell}
            onBudgetChange={updateBudgetCell}
          />
        </div>

        <div className="status-inline">{t.status}: {status}</div>
        {error ? <div className="error-box">{error}</div> : null}
      </section>

      {isResultOpen && result ? (
        <div className="modal-backdrop" onClick={() => setIsResultOpen(false)}>
          <div className="result-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{t.resultTitle}</h2>
            <div><strong>x*</strong> = ({result.solution_original.join(', ')})</div>
            <div><strong>{t.selected}</strong> {result.selected_original_indices.length ? result.selected_original_indices.join(', ') : t.noSelected}</div>
            <div><strong>F(x*) =</strong> {formatValue(result.objective, 6)}</div>
            <div><strong>{t.cCrisp}:</strong> {result.c_crisp_original.map((value) => formatValue(value, 6)).join(', ')}</div>
            <div><strong>{t.dCrisp}:</strong> {result.d_crisp_original.map((value) => formatValue(value, 6)).join(', ')}</div>
            <button type="button" className="btn btn--primary" onClick={() => setIsResultOpen(false)}>{t.close}</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SingleTriEditor({ title, index, total, rowValues, onPrev, onNext, onChange }) {
  return (
    <div className="single-set-card">
      <div className="single-set-head">
        <strong>{title} {index + 1}/{total}</strong>
        <div className="pager-controls">
          <button type="button" onClick={onPrev} disabled={index <= 0}>←</button>
          <button type="button" onClick={onNext} disabled={index >= total - 1}>→</button>
        </div>
      </div>
      <div className="single-set-fields">
        {['a', 'b', 'c'].map((label, colIndex) => (
          <label key={label}>
            <span>{label}</span>
            <input type="number" step="0.001" value={rowValues[colIndex] ?? ''} onChange={(event) => onChange(colIndex, event.target.value)} />
          </label>
        ))}
      </div>
    </div>
  )
}

function CostTable({ values, budgets, onCellChange, onBudgetChange }) {
  const columns = values[0]?.length ?? 0
  return (
    <table className="matrix-table matrix-table--full" style={{ '--matrix-rows': values.length }}>
      <thead>
        <tr>
          <th>#</th>
          {Array.from({ length: columns }, (_, col) => <th key={col}>{col + 1}</th>)}
          <th>b</th>
        </tr>
      </thead>
      <tbody>
        {values.map((row, rowIndex) => (
          <tr key={rowIndex}>
            <th>{rowIndex + 1}</th>
            {row.map((cell, colIndex) => (
              <td key={`${rowIndex}-${colIndex}`}>
                <input type="number" step="0.001" value={cell ?? ''} onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)} />
              </td>
            ))}
            <td>
              <input type="number" step="0.001" value={budgets[rowIndex] ?? ''} onChange={(event) => onBudgetChange(rowIndex, event.target.value)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default App
