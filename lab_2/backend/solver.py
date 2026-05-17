from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.optimize import linear_sum_assignment


class SolverError(ValueError):
    """Raised when input data is invalid or algorithm cannot continue."""


@dataclass(slots=True)
class ProblemData:
    cost_matrix: np.ndarray
    constraints: list[np.ndarray]
    bounds: np.ndarray
    lambda0: np.ndarray
    step_size: float
    max_iter: int
    tolerance: float


def _as_problem_data(payload: dict[str, Any]) -> ProblemData:
    try:
        cost_matrix = np.asarray(payload["cost_matrix"], dtype=float)
        constraints = [np.asarray(x, dtype=float) for x in payload["constraints"]]
        bounds = np.asarray(payload["bounds"], dtype=float)
        lambda0 = np.asarray(payload.get("lambda0", np.ones(len(constraints))), dtype=float)
        step_size = float(payload.get("step_size", 0.1))
        max_iter = int(payload.get("max_iter", 200))
        tolerance = float(payload.get("tolerance", 1e-6))
    except (KeyError, TypeError, ValueError) as exc:
        raise SolverError("Некорректные входные данные для задачи lab_2.") from exc

    if cost_matrix.ndim != 2 or cost_matrix.shape[0] != cost_matrix.shape[1]:
        raise SolverError("Матрица C должна быть квадратной n×n.")
    if len(constraints) == 0:
        raise SolverError("Нужна хотя бы одна дополнительная матрица ограничений D^k.")
    if bounds.ndim != 1 or bounds.shape[0] != len(constraints):
        raise SolverError("Размер bounds должен совпадать с количеством ограничений.")
    if any(d.shape != cost_matrix.shape for d in constraints):
        raise SolverError("Каждая матрица D^k должна иметь тот же размер, что и C.")

    return ProblemData(cost_matrix, constraints, bounds, lambda0, step_size, max_iter, tolerance)


def _solve_assignment(cost: np.ndarray) -> np.ndarray:
    rows, cols = linear_sum_assignment(cost)
    x = np.zeros_like(cost)
    x[rows, cols] = 1.0
    return x


def solve_problem(payload: dict[str, Any]) -> dict[str, Any]:
    p = _as_problem_data(payload)
    multipliers = np.maximum(p.lambda0, 0.0).copy()

    best_x = None
    best_lagrangian = float("inf")
    history: list[dict[str, Any]] = []

    for iteration in range(1, p.max_iter + 1):
        lagrangian_matrix = p.cost_matrix.copy()
        for k, d in enumerate(p.constraints):
            lagrangian_matrix += multipliers[k] * d

        x = _solve_assignment(lagrangian_matrix)
        violations = np.array([float(np.sum(d * x) - p.bounds[k]) for k, d in enumerate(p.constraints)])
        violation_norm = float(np.sum(np.abs(violations)))

        lagrangian_value = float(np.sum(p.cost_matrix * x) + np.dot(multipliers, violations))
        if lagrangian_value < best_lagrangian:
            best_lagrangian = lagrangian_value
            best_x = x.copy()

        history.append({
            "iter": iteration,
            "lambda": np.round(multipliers, 6).tolist(),
            "violations": np.round(violations, 6).tolist(),
            "violation_norm": round(violation_norm, 6),
        })

        if violation_norm <= p.tolerance:
            break

        multipliers = np.maximum(multipliers + p.step_size * violations, 0.0)

    if best_x is None:
        raise SolverError("Алгоритм не смог получить решение.")

    assignment = np.argmax(best_x, axis=1) + 1
    return {
        "assignment": assignment.tolist(),
        "x_matrix": best_x.astype(int).tolist(),
        "objective": round(float(np.sum(p.cost_matrix * best_x)), 6),
        "constraints_values": [round(float(np.sum(d * best_x)), 6) for d in p.constraints],
        "constraints_bounds": np.round(p.bounds, 6).tolist(),
        "iterations": history,
        "final_lambda": np.round(multipliers, 6).tolist(),
    }
