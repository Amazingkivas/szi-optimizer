from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp


class SolverError(ValueError):
    """Raised when the input data is invalid or the solver fails."""


DEFUZZ_METHODS = {
    "centroid": "Центроид: (a + b + c) / 3",
    "yager": "Индекс Ягера: (a + 2b + c) / 4",
    "graded_mean": "Интегральное среднее: (a + 4b + c) / 6",
    "mode": "Мода: b",
}


@dataclass(slots=True)
class ProblemData:
    lambda_value: float
    defuzz_method: str
    c_fuzzy: np.ndarray
    d_fuzzy: np.ndarray
    cost_matrix: np.ndarray
    budgets: np.ndarray



def _validate_triangular(name: str, values: np.ndarray) -> None:
    if values.ndim != 2 or values.shape[1] != 3:
        raise SolverError(f"{name} должны быть матрицей n×3.")
    if not np.all(np.isfinite(values)):
        raise SolverError(f"{name} содержат нечисловые значения.")
    if np.any(values[:, 0] > values[:, 1]) or np.any(values[:, 1] > values[:, 2]):
        raise SolverError(f"Для {name} требуется порядок a ≤ b ≤ c в каждой строке.")



def _defuzzify(values: np.ndarray, method: str) -> np.ndarray:
    a = values[:, 0]
    b = values[:, 1]
    c = values[:, 2]

    if method == "centroid":
        return (a + b + c) / 3.0
    if method == "yager":
        return (a + 2.0 * b + c) / 4.0
    if method == "graded_mean":
        return (a + 4.0 * b + c) / 6.0
    if method == "mode":
        return b.copy()
    raise SolverError(f"Неизвестный метод дефаззификации: {method}")



def _as_problem_data(payload: dict[str, Any]) -> ProblemData:
    try:
        lambda_value = float(payload["lambda"])
        defuzz_method = str(payload["defuzz_method"])
        c_fuzzy = np.asarray(payload["c_fuzzy"], dtype=float)
        d_fuzzy = np.asarray(payload["d_fuzzy"], dtype=float)
        cost_matrix = np.asarray(payload["cost_matrix"], dtype=float)
        budgets = np.asarray(payload["budgets"], dtype=float)
    except (KeyError, TypeError, ValueError) as exc:
        raise SolverError("Не удалось прочитать входные данные задачи.") from exc

    if defuzz_method not in DEFUZZ_METHODS:
        raise SolverError("Выберите один из доступных методов дефаззификации.")
    if not 0.0 <= lambda_value <= 1.0:
        raise SolverError("λ должна принадлежать отрезку [0, 1].")

    _validate_triangular("Параметры c̃j", c_fuzzy)
    _validate_triangular("Параметры d̃j", d_fuzzy)

    if c_fuzzy.shape != d_fuzzy.shape:
        raise SolverError("Количество нечётких c̃j и d̃j должно совпадать.")
    if cost_matrix.ndim != 2:
        raise SolverError("Матрица A должна быть двумерной.")

    item_count = c_fuzzy.shape[0]
    if cost_matrix.shape[1] != item_count:
        raise SolverError("Число столбцов матрицы A должно совпадать с числом СЗИ.")
    if budgets.ndim != 1 or budgets.shape[0] != cost_matrix.shape[0]:
        raise SolverError("Размер вектора b должен совпадать с числом строк матрицы A.")

    if np.any(cost_matrix < 0) or np.any(budgets < 0):
        raise SolverError("Матрица A и вектор b должны быть неотрицательными.")

    return ProblemData(
        lambda_value=lambda_value,
        defuzz_method=defuzz_method,
        c_fuzzy=c_fuzzy,
        d_fuzzy=d_fuzzy,
        cost_matrix=cost_matrix,
        budgets=budgets,
    )



def _solve_additive_knapsack(cost_matrix: np.ndarray, budgets: np.ndarray, weights: np.ndarray) -> np.ndarray:
    item_count = weights.shape[0]
    if item_count == 0:
        return np.zeros(0, dtype=int)

    integrality = np.ones(item_count, dtype=int)
    bounds = Bounds(lb=np.zeros(item_count), ub=np.ones(item_count))
    constraints = LinearConstraint(cost_matrix, lb=-np.inf, ub=budgets)
    result = milp(c=-weights, integrality=integrality, bounds=bounds, constraints=constraints)

    if not result.success or result.x is None:
        raise SolverError("MILP-решатель не смог найти допустимое оптимальное решение.")

    return np.rint(result.x).astype(int)



def _additive_value(x: np.ndarray, weights: np.ndarray) -> float:
    return float(np.dot(x, weights))



def _maximin_value(x: np.ndarray, d_values: np.ndarray) -> float:
    selected = np.flatnonzero(x > 0.5)
    if selected.size == 0:
        return 0.0
    return float(np.min(d_values[selected]))



def _combined_value(x: np.ndarray, c_values: np.ndarray, d_values: np.ndarray, lambda_value: float) -> float:
    return lambda_value * _additive_value(x, c_values) + (1.0 - lambda_value) * _maximin_value(x, d_values)



def solve_problem(payload: dict[str, Any]) -> dict[str, Any]:
    problem = _as_problem_data(payload)
    c_values = _defuzzify(problem.c_fuzzy, problem.defuzz_method)
    d_values = _defuzzify(problem.d_fuzzy, problem.defuzz_method)

    if np.any(c_values <= 0):
        raise SolverError("После дефаззификации все c_j должны быть положительными.")
    if np.any(d_values < 0):
        raise SolverError("После дефаззификации все d_j должны быть неотрицательными.")
    if np.any(d_values > c_values + 1e-9):
        raise SolverError("Для корректной постановки требуется d_j ≤ c_j после дефаззификации.")

    original_indices = np.arange(c_values.shape[0])
    sort_order = np.argsort(-d_values, kind="stable")

    sorted_c = c_values[sort_order]
    sorted_d = d_values[sort_order]
    sorted_c_fuzzy = problem.c_fuzzy[sort_order]
    sorted_d_fuzzy = problem.d_fuzzy[sort_order]
    sorted_matrix = problem.cost_matrix[:, sort_order]
    sorted_original_indices = original_indices[sort_order]

    if problem.lambda_value == 0:
        sorted_solution = np.zeros_like(sorted_c, dtype=int)
        sorted_solution[0] = 1
        best_score = _combined_value(sorted_solution, sorted_c, sorted_d, problem.lambda_value)
    else:
        candidates: list[np.ndarray] = []

        x0 = _solve_additive_knapsack(sorted_matrix, problem.budgets, sorted_c)
        candidates.append(x0)
        chosen = np.flatnonzero(x0 > 0.5)
        if chosen.size == 0:
            raise SolverError("Оптимум по F1 оказался пустым; проверьте ограничения A·x ≤ b.")
        j0 = int(chosen[-1])

        for s in range(1, j0 + 1):
            size = j0 + 1 - s
            reduced_matrix = sorted_matrix[:, :size]
            reduced_c = sorted_c[:size]
            reduced_weights = problem.lambda_value * reduced_c
            reduced_weights[-1] += (1.0 - problem.lambda_value) * sorted_d[size - 1]
            reduced_solution = _solve_additive_knapsack(reduced_matrix, problem.budgets, reduced_weights)
            full_solution = np.pad(reduced_solution, (0, sorted_c.shape[0] - size))
            candidates.append(full_solution.astype(int))

        candidate_scores = [
            _combined_value(candidate, sorted_c, sorted_d, problem.lambda_value) for candidate in candidates
        ]
        best_position = int(np.argmax(candidate_scores))
        sorted_solution = candidates[best_position]
        best_score = float(candidate_scores[best_position])

    inverse_order = np.argsort(sort_order)
    solution_original_order = sorted_solution[inverse_order]

    return {
        "lambda": round(problem.lambda_value, 6),
        "defuzz_method": problem.defuzz_method,
        "defuzz_method_label": DEFUZZ_METHODS[problem.defuzz_method],
        "c_crisp_original": np.round(c_values, 6).tolist(),
        "d_crisp_original": np.round(d_values, 6).tolist(),
        "sorted_order": (sorted_original_indices + 1).tolist(),
        "c_crisp_sorted": np.round(sorted_c, 6).tolist(),
        "d_crisp_sorted": np.round(sorted_d, 6).tolist(),
        "c_fuzzy_sorted": np.round(sorted_c_fuzzy, 6).tolist(),
        "d_fuzzy_sorted": np.round(sorted_d_fuzzy, 6).tolist(),
        "cost_matrix_sorted": np.round(sorted_matrix, 6).tolist(),
        "budgets": np.round(problem.budgets, 6).tolist(),
        "solution_sorted": sorted_solution.astype(int).tolist(),
        "solution_original": solution_original_order.astype(int).tolist(),
        "selected_original_indices": (np.flatnonzero(solution_original_order) + 1).tolist(),
        "f1": round(_additive_value(sorted_solution, sorted_c), 6),
        "f2": round(_maximin_value(sorted_solution, sorted_d), 6),
        "objective": round(best_score, 6),
    }
