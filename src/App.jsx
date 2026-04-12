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
const TRI_ROWS_PER_PAGE = 8
const COST_ROWS_PER_PAGE = 8
const COST_COLS_PER_PAGE = 7

const FALLBACK_DEFUZZ = [
  { value: 'centroid', label: 'Центроид: (a + b + c) / 3' },
  { value: 'yager', label: 'Индекс Ягера: (a + 2b + c) / 4' },
  { value: 'graded_mean', label: 'Интегральное среднее: (a + 4b + c) / 6' },
  { value: 'mode', label: 'Мода: b' },
]

const UI_TEXT = {
  ru: {
    resultTitle: 'Результаты',
    waiting: 'Ожидание расчёта.',
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
    pageC: 'Страница c̃j',
    pageD: 'Страница d̃j',
    rowsA: 'Строки матрицы A',
    colsA: 'Столбцы матрицы A',
    selected: 'Выбранные СЗИ:',
    noSelected: 'нет выбранных СЗИ',
    menu: 'Настройки',
    theme: 'Тема',
    language: 'Язык',
    dark: 'Тёмная',
    light: 'Светлая',
    russian: 'Русский',
    english: 'English',
  },
  en: {
    resultTitle: 'Results',
    waiting: 'Awaiting calculation.',
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
    pageC: 'c̃j page',
    pageD: 'd̃j page',
    rowsA: 'A matrix rows',
    colsA: 'A matrix cols',
    selected: 'Selected controls:',
    noSelected: 'none',
    menu: 'Settings',
    theme: 'Theme',
    language: 'Language',
    dark: 'Dark',
    light: 'Light',
    russian: 'Русский',
    english: 'English',
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
  if (value === '' || value === null || value === undefined) {
    throw new Error('Обнаружены пустые поля. Заполните все значения.')
  }

  const raw = typeof value === 'string' ? value.trim() : String(value)
  if (raw === '') {
    throw new Error('Обнаружены пустые поля. Заполните все значения.')
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error('Есть некорректные числовые значения. Проверьте ввод.')
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
  const fileInputRef = useRef(null)

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
  const [cPage, setCPage] = useState(0)
  const [dPage, setDPage] = useState(0)
  const [costRowPage, setCostRowPage] = useState(0)
  const [costColPage, setCostColPage] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [language, setLanguage] = useState('ru')
  const [theme, setTheme] = useState('dark')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const t = UI_TEXT[language]
  const [status, setStatus] = useState(UI_TEXT.ru.noResult)
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
    setStatus(t.paramsChanged)
  }, [assets, protections, t.paramsChanged])

  const triTotalPages = Math.max(1, Math.ceil(protections / TRI_ROWS_PER_PAGE))
  const rowTotalPages = Math.max(1, Math.ceil(assets / COST_ROWS_PER_PAGE))
  const colTotalPages = Math.max(1, Math.ceil(protections / COST_COLS_PER_PAGE))

  useEffect(() => {
    setCPage((page) => clampPage(page, triTotalPages))
    setDPage((page) => clampPage(page, triTotalPages))
    setCostRowPage((page) => clampPage(page, rowTotalPages))
    setCostColPage((page) => clampPage(page, colTotalPages))
  }, [triTotalPages, rowTotalPages, colTotalPages])

  const cStart = cPage * TRI_ROWS_PER_PAGE
  const cEnd = Math.min(protections, cStart + TRI_ROWS_PER_PAGE)
  const dStart = dPage * TRI_ROWS_PER_PAGE
  const dEnd = Math.min(protections, dStart + TRI_ROWS_PER_PAGE)

  const costRowStart = costRowPage * COST_ROWS_PER_PAGE
  const costRowEnd = Math.min(assets, costRowStart + COST_ROWS_PER_PAGE)
  const costColStart = costColPage * COST_COLS_PER_PAGE
  const costColEnd = Math.min(protections, costColStart + COST_COLS_PER_PAGE)

  const normalizeUploadedMatrix = (matrix, rowCount, colCount, label) => {
    if (!Array.isArray(matrix) || matrix.length !== rowCount) {
      throw new Error(`Размерности в файле не соответствуют ожидаемому формату для ${label}.`)
    }

    return matrix.map((row) => {
      if (!Array.isArray(row) || row.length !== colCount) {
        throw new Error(`Размерности в файле не соответствуют ожидаемому формату для ${label}.`)
      }
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

    if (!Array.isArray(config.budgets) || config.budgets.length !== nextAssets) {
      throw new Error('Размерности в файле не соответствуют ожидаемому формату для b.')
    }

    const lambdaUploaded = Number(config.lambda)
    if (!Number.isFinite(lambdaUploaded) || lambdaUploaded < 0 || lambdaUploaded > 1) {
      throw new Error('В файле должно быть корректное значение λ в диапазоне [0, 1].')
    }

    const methodUploaded = String(config.defuzzMethod)
    const methodExists = defuzzOptions.some((option) => option.value === methodUploaded)
    if (!methodExists) {
      throw new Error('Метод дефаззификации в файле не поддерживается.')
    }

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
    setCPage(0)
    setDPage(0)
    setCostRowPage(0)
    setCostColPage(0)
    setError('')
    setResult(null)
    setStatus(t.loaded)
  }

  const handleLoadFileClick = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleConfigFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await loadFromConfigFile(file)
    } catch (loadError) {
      showToast(loadError.message)
      setError(loadError.message)
    }
  }

  const clearAll = () => {
    setCFuzzy(createMatrix(protections, 3))
    setDFuzzy(createMatrix(protections, 3))
    setCosts(createMatrix(assets, protections))
    setBudgets(createVector(assets))
    setError('')
    setResult(null)
    setStatus(t.cleared)
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

  const validateClientData = (payload) => {
    const checkTriangular = (rows) => {
      rows.forEach((row) => {
        if (!(row[0] <= row[1] && row[1] <= row[2])) {
          throw new Error('Для нечётких параметров должно выполняться условие a ≤ b ≤ c.')
        }
      })
    }

    checkTriangular(payload.c_fuzzy)
    checkTriangular(payload.d_fuzzy)

    payload.cost_matrix.forEach((row) => {
      row.forEach((value) => {
        if (value < 0) {
          throw new Error('Матрица A должна содержать только неотрицательные значения.')
        }
      })
    })

    payload.budgets.forEach((value) => {
      if (value < 0) {
        throw new Error('Вектор b должен содержать только неотрицательные значения.')
      }
    })

    payload.cost_matrix.forEach((row, rowIndex) => {
      const rowMax = Math.max(...row)
      if (rowMax > payload.budgets[rowIndex]) {
        throw new Error('Должно выполняться условие: для каждой ГИА максимум по A не превышает b.')
      }
    })
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

      validateClientData(payload)

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
      setStatus(t.done)
    } catch (solveError) {
      showToast(solveError.message)
      setError(solveError.message)
      setStatus(t.failed)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-screen" data-theme={theme}>
      {toast ? <div className="toast">{toast}</div> : null}

      <div className="top-menu">
        <button type="button" className="btn btn--ghost top-menu__trigger" onClick={() => setIsMenuOpen((open) => !open)}>
          ☰
        </button>
        {isMenuOpen ? (
          <div className="top-menu__dropdown">
            <strong>{t.menu}</strong>
            <label>
              <span>{t.theme}</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="dark">{t.dark}</option>
                <option value="light">{t.light}</option>
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
            <span>{t.method}</span>
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
            <button type="button" className="btn btn--secondary" onClick={handleLoadFileClick}>
              {t.loadFile}
            </button>
            <button type="button" className="btn btn--ghost" onClick={clearAll}>
              {t.clear}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden-file-input"
              onChange={handleConfigFileChange}
            />
            <button type="button" className="btn btn--primary" onClick={handleSolve} disabled={loading}>
              {loading ? t.solving : t.solve}
            </button>
          </div>
        </div>

        <div className="tables-row">
          <div className="table-block">
            <TableTitle title="c̃j" subtitle={`${cStart + 1}-${cEnd} / ${protections}`} />
            <TriangularTable
              start={cStart}
              end={cEnd}
              values={cFuzzy}
              onChange={(rowIndex, colIndex, value) => updateTriCell(setCFuzzy, cFuzzy, rowIndex, colIndex, value)}
            />
            <Pager
              label={t.pageC}
              page={cPage}
              total={triTotalPages}
              onPrev={() => setCPage((page) => clampPage(page - 1, triTotalPages))}
              onNext={() => setCPage((page) => clampPage(page + 1, triTotalPages))}
            />
          </div>

          <div className="table-block">
            <TableTitle title="d̃j" subtitle={`${dStart + 1}-${dEnd} / ${protections}`} />
            <TriangularTable
              start={dStart}
              end={dEnd}
              values={dFuzzy}
              onChange={(rowIndex, colIndex, value) => updateTriCell(setDFuzzy, dFuzzy, rowIndex, colIndex, value)}
            />
            <Pager
              label={t.pageD}
              page={dPage}
              total={triTotalPages}
              onPrev={() => setDPage((page) => clampPage(page - 1, triTotalPages))}
              onNext={() => setDPage((page) => clampPage(page + 1, triTotalPages))}
            />
          </div>

          <div className="table-block table-block--wide">
            <TableTitle
              title="A и b"
              subtitle={`${costRowStart + 1}-${costRowEnd} / ${assets}, ${costColStart + 1}-${costColEnd} / ${protections}`}
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
            label={t.rowsA}
            page={costRowPage}
            total={rowTotalPages}
            onPrev={() => setCostRowPage((page) => clampPage(page - 1, rowTotalPages))}
            onNext={() => setCostRowPage((page) => clampPage(page + 1, rowTotalPages))}
          />
          <Pager
            label={t.colsA}
            page={costColPage}
            total={colTotalPages}
            onPrev={() => setCostColPage((page) => clampPage(page - 1, colTotalPages))}
            onNext={() => setCostColPage((page) => clampPage(page + 1, colTotalPages))}
          />
        </div>
      </section>

      <section className="panel result-panel">
        <h2>{t.resultTitle}</h2>
        <div className="status-box">{status}</div>

        {result ? (
          <div className="result-solution">
            <div><strong>x*</strong> = ({result.solution_original.join(', ')})</div>
            <div><strong>{t.selected}</strong> {result.selected_original_indices.length ? result.selected_original_indices.join(', ') : t.noSelected}</div>
            <div><strong>F(x*) =</strong> {formatValue(result.objective, 6)}</div>
          </div>
        ) : (
          <div className="result-empty">{t.waiting}</div>
        )}

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

function TriangularTable({ start, end, values, onChange }) {
  return (
    <table className="matrix-table">
      <thead>
        <tr>
          <th>#</th>
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
              <th>{rowIndex + 1}</th>
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
          <th>#</th>
          {columnIndices.map((colIndex) => (
            <th key={colIndex}>{colIndex + 1}</th>
          ))}
          <th>b</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowEnd - rowStart }, (_, offset) => {
          const rowIndex = rowStart + offset
          return (
            <tr key={rowIndex}>
              <th>{rowIndex + 1}</th>
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
