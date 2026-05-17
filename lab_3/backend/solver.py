from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.optimize import linear_sum_assignment


class SolverError(ValueError):
    pass


@dataclass(slots=True)
class ProblemData:
    c_matrix: np.ndarray
    k: float
    variant: str


def _as_problem_data(payload: dict[str, Any]) -> ProblemData:
    try:
        c_matrix = np.asarray(payload["c_matrix"], dtype=float)
        k = float(payload["k"])
        variant = str(payload.get("variant", "task1"))
    except (KeyError, TypeError, ValueError) as exc:
        raise SolverError("Некорректные входные данные для lab_3.") from exc

    if c_matrix.ndim != 2 or c_matrix.shape[0] != c_matrix.shape[1]:
        raise SolverError("Матрица C должна быть квадратной n×n.")
    if k <= 1:
        raise SolverError("Параметр k должен быть > 1.")
    if variant not in {"task1", "task2"}:
        raise SolverError("variant должен быть task1 или task2.")
    return ProblemData(c_matrix=c_matrix, k=k, variant=variant)


def _maximize_assignment(profit: np.ndarray) -> tuple[np.ndarray, float]:
    rows, cols = linear_sum_assignment(-profit)
    x = np.zeros_like(profit)
    x[rows, cols] = 1.0
    return x, float(np.sum(profit * x))


def solve_problem(payload: dict[str, Any]) -> dict[str, Any]:
    p = _as_problem_data(payload)
    n = p.c_matrix.shape[0]

    if p.variant == "task1":
        effective = p.c_matrix
    else:
        effective = np.zeros_like(p.c_matrix)
        effective[:, :-1] = p.c_matrix[:, :-1] + p.c_matrix[:, 1:]
        effective[:, -1] = p.c_matrix[:, -1]

    x, max_score = _maximize_assignment(effective)
    sigma = np.argmax(x, axis=0) + 1
    total_power = float(np.sum(p.c_matrix))

    minimized_power = total_power - ((p.k - 1.0) / p.k) * max_score

    return {
        "variant": p.variant,
        "k": p.k,
        "schedule_by_period": sigma.tolist(),
        "assignment_matrix": x.astype(int).tolist(),
        "maximized_score": round(max_score, 6),
        "total_power_without_shelling": round(total_power, 6),
        "minimized_enemy_power": round(minimized_power, 6),
        "effective_matrix": np.round(effective, 6).tolist(),
    }
